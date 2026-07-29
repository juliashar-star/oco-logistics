import assert from "node:assert/strict";
import test from "node:test";

import { CarrierLabelsNotReadyError } from "../packages/core/src/carrier-adapter/errors.ts";
import {
  YandexAuthError,
  generateLabels,
} from "../packages/core/src/carrier-adapter/yandex/client.ts";

const TEST_BASE_URL = "https://b2b.taxi.tst.yandex.net";
const VALID_CREDS = {
  platformStationId: "fbed3aa1-2cc6-4370-ab4d-59c5cc9bb924",
  token: "test-token",
};
const REQUEST_ID = "6711cc7331be480095c9f79f4f74f2a7-udp";

/** Measured 2026-07-29 tst: nonexistent / not-ready → identical 409 body. */
const LABELS_NOT_READY_BODY = {
  message:
    "Some orders are not ready to generate labels yet. Please try again later.",
  code: "409",
};

const PDF_BYTES = Buffer.from("%PDF-1.4 fake-label-body");

function setEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

async function withEnv(name, value, run) {
  const saved = process.env[name];
  setEnv(name, value);
  try {
    return await run();
  } finally {
    setEnv(name, saved);
  }
}

function binaryResponse(status, bodyBytes, contentType) {
  const buf = Buffer.from(bodyBytes);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get(name) {
        if (String(name).toLowerCase() === "content-type") {
          return contentType;
        }
        return null;
      },
    },
    async arrayBuffer() {
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    },
    async text() {
      return buf.toString("utf8");
    },
  };
}

function installFetchMock(handler) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const body =
      init?.body != null ? JSON.parse(init.body) : undefined;
    calls.push({ url, init, body });
    return handler({ url, init, body, calls });
  };
  return {
    calls,
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

test("empty providerOrderIds rejects before fetch", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() => {
      throw new Error("fetch must not be called");
    });

    try {
      await assert.rejects(
        () => generateLabels([], VALID_CREDS),
        (error) => {
          assert.ok(error instanceof Error);
          assert.equal(error instanceof CarrierLabelsNotReadyError, false);
          assert.match(error.message, /providerOrderIds must not be empty/);
          return true;
        },
      );
      assert.equal(mock.calls.length, 0);
    } finally {
      mock.restore();
    }
  });
});

test("HTTP 409 maps to CarrierLabelsNotReadyError with recorded body", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      binaryResponse(
        409,
        JSON.stringify(LABELS_NOT_READY_BODY),
        "application/json",
      ),
    );

    try {
      await assert.rejects(
        () => generateLabels([REQUEST_ID], VALID_CREDS),
        (error) => {
          assert.ok(error instanceof CarrierLabelsNotReadyError);
          assert.equal(error.name, "CarrierLabelsNotReadyError");
          assert.match(error.message, /HTTP 409/);
          assert.match(
            error.message,
            /Some orders are not ready to generate labels yet/,
          );
          return true;
        },
      );
    } finally {
      mock.restore();
    }
  });
});

test("HTTP 200 whose body is not %PDF is rejected", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      binaryResponse(200, Buffer.from('{"ok":true}'), "application/json"),
    );

    try {
      await assert.rejects(
        () => generateLabels([REQUEST_ID], VALID_CREDS),
        (error) => {
          assert.ok(error instanceof Error);
          assert.equal(error instanceof CarrierLabelsNotReadyError, false);
          assert.match(error.message, /not a PDF/);
          return true;
        },
      );
    } finally {
      mock.restore();
    }
  });
});

test("HTTP 200 %PDF body is returned intact with content type", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      binaryResponse(200, PDF_BYTES, "application/pdf"),
    );

    try {
      const result = await generateLabels([REQUEST_ID], VALID_CREDS);
      assert.equal(result.contentType, "application/pdf");
      assert.deepEqual(Buffer.from(result.bytes), PDF_BYTES);
      assert.equal(result.bytes[0], 0x25);
      assert.equal(result.bytes[1], 0x50);
      assert.equal(result.bytes[2], 0x44);
      assert.equal(result.bytes[3], 0x46);
    } finally {
      mock.restore();
    }
  });
});

test("request_ids is passed through unchanged", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const ids = [REQUEST_ID, "second-request-id-udp"];
    const mock = installFetchMock(() =>
      binaryResponse(200, PDF_BYTES, "application/pdf"),
    );

    try {
      await generateLabels(ids, VALID_CREDS);
      assert.equal(mock.calls.length, 1);
      assert.equal(mock.calls[0].init.method, "POST");
      assert.equal(
        mock.calls[0].url,
        `${TEST_BASE_URL}/api/b2b/platform/request/generate-labels`,
      );
      assert.deepEqual(mock.calls[0].body, { request_ids: ids });
    } finally {
      mock.restore();
    }
  });
});

test("HTTP 500 throws ordinary Error, not CarrierLabelsNotReadyError", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      binaryResponse(500, "upstream boom", "text/plain"),
    );

    try {
      await assert.rejects(
        () => generateLabels([REQUEST_ID], VALID_CREDS),
        (error) => {
          assert.ok(error instanceof Error);
          assert.equal(error instanceof CarrierLabelsNotReadyError, false);
          assert.match(error.message, /HTTP 500/);
          assert.match(error.message, /upstream boom/);
          return true;
        },
      );
    } finally {
      mock.restore();
    }
  });
});

test("HTTP 401 throws YandexAuthError from transport", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      binaryResponse(401, "unauthorized", "text/plain"),
    );

    try {
      await assert.rejects(
        () => generateLabels([REQUEST_ID], VALID_CREDS),
        (error) => error instanceof YandexAuthError,
      );
    } finally {
      mock.restore();
    }
  });
});
