import assert from "node:assert/strict";
import test from "node:test";

import {
  isCdekOrderNotFound,
  readCdekCreateState,
} from "../packages/core/src/carrier-adapter/cdek/order-state.ts";

/**
 * VERBATIM SUCCESSFUL lookup body — C3b-0 case 1
 * GET /v2/orders?im_number=probe-1785847326011-sender (trimmed to keys the
 * reader uses, structure preserved from the measured reply).
 */
const MEASURED_SUCCESSFUL_LOOKUP = {
  entity: {
    uuid: "e7b9f786-bdf2-43a9-af93-415f7c43feab",
    type: 1,
    is_return: false,
    is_reverse: false,
    cdek_number: "1109940740",
    number: "probe-1785847326011-sender",
    tariff_code: 136,
    delivery_point: "MSK65",
    statuses: [
      {
        code: "CREATED",
        name: "Создан",
        date_time: "2026-08-04T12:42:08+0000",
        city: "Офис СДЭК",
        deleted: false,
      },
      {
        code: "ACCEPTED",
        name: "Принят",
        date_time: "2026-08-04T12:42:04+0000",
        city: "Офис СДЭК",
        deleted: false,
      },
    ],
  },
  requests: [
    {
      request_uuid: "69a9ce38-30e1-45d8-a92d-fa3569d10afa",
      type: "CREATE",
      date_time: "2026-08-04T12:42:05+0000",
      state: "SUCCESSFUL",
    },
  ],
  related_entities: [],
};

/**
 * VERBATIM ACCEPTED create reply — C3 from_location probe POST /v2/orders
 */
const MEASURED_ACCEPTED_CREATE = {
  entity: {
    uuid: "e7b9f786-bdf2-43a9-af93-415f7c43feab",
  },
  requests: [
    {
      request_uuid: "69a9ce38-30e1-45d8-a92d-fa3569d10afa",
      type: "CREATE",
      date_time: "2026-08-04T12:42:05+0000",
      state: "ACCEPTED",
    },
  ],
  related_entities: [],
};

/**
 * VERBATIM INVALID settled body — C3 follow-up on STEP C order
 * (error_validate_receiver_delivery_point_is_empty)
 */
const MEASURED_INVALID_SETTLED = {
  entity: {
    uuid: "ceb5432e-ace9-4baf-8345-806427864d9b",
    statuses: [
      {
        code: "INVALID",
        name: "Некорректный заказ",
        date_time: "2026-08-04T08:37:02+0000",
        city: "Офис СДЭК",
        deleted: false,
      },
      {
        code: "ACCEPTED",
        name: "Принят",
        date_time: "2026-08-04T08:36:55+0000",
        city: "Офис СДЭК",
        deleted: false,
      },
    ],
  },
  requests: [
    {
      request_uuid: "07c0daf3-9d20-408b-ab38-34cddf5f07b5",
      type: "CREATE",
      date_time: "2026-08-04T08:36:55+0000",
      state: "INVALID",
      errors: [
        {
          code: "error_validate_receiver_delivery_point_is_empty",
          message: "Не задан офис получателя",
        },
      ],
    },
  ],
};

/**
 * VERBATIM not-found 400 body — C3b-0 case 3
 */
const MEASURED_NOT_FOUND = {
  requests: [
    {
      type: "GET",
      date_time: "2026-08-04T12:54:45+0000",
      state: "INVALID",
      errors: [
        {
          code: "v2_entity_not_found_im_number",
          additional_code: "0x7B234F39",
          message: "Entity is not found by number no-such-number-04082026",
        },
      ],
    },
  ],
  related_entities: [],
};

test("SUCCESSFUL lookup → created with uuid, cdekNumber, no error codes", () => {
  const result = readCdekCreateState(MEASURED_SUCCESSFUL_LOOKUP);
  assert.deepEqual(result, {
    state: "created",
    uuid: "e7b9f786-bdf2-43a9-af93-415f7c43feab",
    cdekNumber: "1109940740",
    errorCodes: [],
  });
});

test("ACCEPTED create reply → pending, uuid present, cdekNumber null", () => {
  const result = readCdekCreateState(MEASURED_ACCEPTED_CREATE);
  assert.deepEqual(result, {
    state: "pending",
    uuid: "e7b9f786-bdf2-43a9-af93-415f7c43feab",
    cdekNumber: null,
    errorCodes: [],
  });
});

test("INVALID settled body → invalid, code only, no message text in result", () => {
  const result = readCdekCreateState(MEASURED_INVALID_SETTLED);
  assert.equal(result.state, "invalid");
  assert.deepEqual(result.errorCodes, [
    "error_validate_receiver_delivery_point_is_empty",
  ]);
  assert.equal(result.uuid, "ceb5432e-ace9-4baf-8345-806427864d9b");
  assert.equal(result.cdekNumber, null);
  const dumped = JSON.stringify(result);
  assert.equal(dumped.includes("Не задан офис получателя"), false);
  assert.equal(dumped.includes("message"), false);
});

test("not-found 400 body → isCdekOrderNotFound true; SUCCESSFUL → false", () => {
  assert.equal(isCdekOrderNotFound(MEASURED_NOT_FOUND), true);
  assert.equal(isCdekOrderNotFound(MEASURED_SUCCESSFUL_LOOKUP), false);
});

test("{} / null / no CREATE entry → pending; uuid from entity when present", () => {
  assert.deepEqual(readCdekCreateState({}), {
    state: "pending",
    uuid: null,
    cdekNumber: null,
    errorCodes: [],
  });
  assert.deepEqual(readCdekCreateState(null), {
    state: "pending",
    uuid: null,
    cdekNumber: null,
    errorCodes: [],
  });
  assert.deepEqual(
    readCdekCreateState({
      entity: { uuid: "should-be-kept" },
      requests: [
        {
          type: "GET",
          state: "INVALID",
          errors: [{ code: "v2_entity_not_found_im_number" }],
        },
      ],
    }),
    {
      state: "pending",
      uuid: "should-be-kept",
      cdekNumber: null,
      errorCodes: [],
    },
  );
});

test("unknown state value → pending (not invalid), uuid present", () => {
  const result = readCdekCreateState({
    entity: { uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" },
    requests: [
      {
        type: "CREATE",
        state: "SOMETHING_NEW",
      },
    ],
  });
  assert.deepEqual(result, {
    state: "pending",
    uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    cdekNumber: null,
    errorCodes: [],
  });
});

test('literal "INVALID" still maps to invalid', () => {
  const result = readCdekCreateState({
    entity: { uuid: "bbbbbbbb-cccc-dddd-eeee-ffffffffffff" },
    requests: [
      {
        type: "CREATE",
        state: "INVALID",
        errors: [{ code: "some_measured_code" }],
      },
    ],
  });
  assert.deepEqual(result, {
    state: "invalid",
    uuid: "bbbbbbbb-cccc-dddd-eeee-ffffffffffff",
    cdekNumber: null,
    errorCodes: ["some_measured_code"],
  });
});
