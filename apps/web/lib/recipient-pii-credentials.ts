import {
  decryptField,
  encryptField,
  resolveFieldEncryptionKey,
} from "@oco/core/crypto/field-encryption";

/** Ключ шифрования ПДн получателя в Shipment — только из .env, минимум 32 символа. */
export function isRecipientPiiEncryptionConfigured(): boolean {
  const secret = process.env.RECIPIENT_PII_ENCRYPTION_KEY;
  return Boolean(secret && secret.length >= 32);
}

function getEncryptionKey(): Buffer {
  return resolveFieldEncryptionKey("RECIPIENT_PII_ENCRYPTION_KEY", "oco-recipient-pii-v1");
}

/** Шифрует поле ПДн получателя для хранения в базе (не хэш — нужен для UI/экспорта/API). */
export function encryptRecipientPii(plain: string): string {
  return encryptField(plain, getEncryptionKey());
}

export function decryptRecipientPii(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Некорректный формат зашифрованных данных получателя");
  }

  return decryptField(payload, getEncryptionKey());
}
