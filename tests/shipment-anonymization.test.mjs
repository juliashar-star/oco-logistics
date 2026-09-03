import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";

import {
  ANONYMIZED_SHIPMENT_FIELDS,
  ANONYMIZED_TEXT,
  anonymizedShipmentUpdate,
} from "../apps/web/lib/shipment-anonymization.ts";
import {
  decryptShipmentRecipientPii,
  encryptShipmentRecipientFields,
} from "../apps/web/lib/recipient-pii.ts";
import { encryptRecipientPii } from "../apps/web/lib/recipient-pii-credentials.ts";

/**
 * A throwaway key, present only so encryptShipmentRecipientFields can run at
 * all — resolveFieldEncryptionKey throws RECIPIENT_PII_ENCRYPTION_KEY_MISSING
 * below 32 chars. Nothing here reads .env and no real value is involved: the
 * test needs the function's OUTPUT KEYS, never its ciphertext.
 */
process.env.RECIPIENT_PII_ENCRYPTION_KEY = "test-only-not-a-secret-0123456789abcdef";

/** The encrypted set, taken from the code that encrypts rather than retyped. */
function encryptedRecipientFieldNames() {
  return Object.keys(
    encryptShipmentRecipientFields({
      recipientName: "n",
      recipientPhone: "p",
      destAddress: "a",
      destApartment: "ap",
      deliveryComment: "c",
    }),
  );
}

/**
 * The DECRYPT set, found by watching what the decryptor actually does.
 *
 * WHY NOT THE TYPE. `ShipmentRecipientPiiRow` is a TypeScript type and is gone
 * at runtime, so a test cannot enumerate it. WHY NOT THE DECRYPTOR'S OUTPUT
 * KEYS EITHER: `decryptShipmentRecipientPii` spreads the row it is given, so
 * its output keys are whatever the CALLER passed — reading them would just echo
 * a list this file wrote, which is the third hand-written list the guard exists
 * to avoid.
 *
 * So the candidates come from Prisma's DMMF — every String column that Shipment
 * actually has — and the answer comes from behaviour: put a known ciphertext in
 * each, and whichever come back changed are the ones the decryptor processes.
 * Both sources are real; neither is retyped here.
 */
function decryptedRecipientFieldNames() {
  const model = Prisma.dmmf.datamodel.models.find((m) => m.name === "Shipment");
  assert.ok(model, "Shipment model missing from Prisma DMMF");

  const stringColumns = model.fields
    .filter((f) => f.kind === "scalar" && f.type === "String")
    .map((f) => f.name);

  const row = { isAnonymized: false };
  for (const name of stringColumns) {
    row[name] = encryptRecipientPii(`MARKER-${name}`);
  }

  const decrypted = decryptShipmentRecipientPii(row);
  return stringColumns.filter((name) => decrypted[name] !== row[name]);
}

/**
 * GUARD ONE — the ENCRYPTION path. It fails when a field is encrypted but
 * missing from the anonymisation list — the exact defect that let destApartment
 * and deliveryComment survive as encrypted personal data.
 *
 * It asserts KEY PRESENCE, never the resolved value. `null` is a legitimate
 * replacement here, so `assert.ok(ANONYMIZED_SHIPMENT_FIELDS[field])` would
 * fail on a field that IS covered and would be a guard built on a fallback.
 */
test("every encrypted recipient field is a key in the anonymisation list", () => {
  const encrypted = encryptedRecipientFieldNames();
  assert.ok(encrypted.length > 0, "encryption returned no fields — the guard would be vacuous");

  for (const field of encrypted) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(ANONYMIZED_SHIPMENT_FIELDS, field),
      `${field} is encrypted by recipient-pii.ts but has no entry in ANONYMIZED_SHIPMENT_FIELDS — it would survive anonymisation as encrypted personal data`,
    );
  }
});

/**
 * GUARD TWO — the DECRYPTION path, and it exists because guard one does not
 * cover it. Guard one is tied to what `encryptShipmentRecipientFields` returns;
 * a field added only to the decryptor would pass it unseen and then survive
 * anonymisation. This one watches the decryptor instead.
 *
 * Key presence again, and for the same reason: `null` is a legitimate value.
 */
test("every field the decryptor processes is a key in the anonymisation list", () => {
  const decrypted = decryptedRecipientFieldNames();
  assert.ok(
    decrypted.length > 0,
    "the decryptor processed no column — the guard would be vacuous",
  );

  for (const field of decrypted) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(ANONYMIZED_SHIPMENT_FIELDS, field),
      `${field} is decrypted by recipient-pii.ts but has no entry in ANONYMIZED_SHIPMENT_FIELDS — it would survive anonymisation as encrypted personal data`,
    );
  }
});

/**
 * destCity and pvzCode are NOT encrypted, so the two guards above cannot see
 * them. Pinning the whole key set is what keeps them from being dropped
 * silently.
 */
test("the anonymisation list holds exactly the seven expected fields", () => {
  assert.deepEqual(Object.keys(ANONYMIZED_SHIPMENT_FIELDS).sort(), [
    "deliveryComment",
    "destAddress",
    "destApartment",
    "destCity",
    "pvzCode",
    "recipientName",
    "recipientPhone",
  ]);
});

/** Columns that are NOT NULL in the schema cannot be cleared with null. */
test("non-nullable columns are cleared with the marker, not with null", () => {
  for (const field of ["recipientName", "recipientPhone", "destCity"]) {
    assert.equal(
      ANONYMIZED_SHIPMENT_FIELDS[field],
      ANONYMIZED_TEXT,
      `${field} is NOT NULL in the schema and must take the marker`,
    );
  }
});

/** Nullable columns that never carried a marker stay absent rather than fake. */
test("nullable columns with no prior marker are cleared to null", () => {
  for (const field of ["destApartment", "deliveryComment", "pvzCode"]) {
    assert.equal(ANONYMIZED_SHIPMENT_FIELDS[field], null, `${field} should clear to null`);
  }
});

test("the update payload is the list plus the flag, and nothing else", () => {
  const update = anonymizedShipmentUpdate();
  assert.equal(update.isAnonymized, true);
  assert.deepEqual(
    Object.keys(update).sort(),
    [...Object.keys(ANONYMIZED_SHIPMENT_FIELDS), "isAnonymized"].sort(),
  );
});

test("the update payload cannot mutate the frozen list", () => {
  const update = anonymizedShipmentUpdate();
  update.recipientName = "changed";
  assert.equal(ANONYMIZED_SHIPMENT_FIELDS.recipientName, ANONYMIZED_TEXT);
});
