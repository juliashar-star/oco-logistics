import assert from "node:assert/strict";
import test from "node:test";

const SETTINGS_BACKUP_FORMAT = "oco-settings-backup";
const SETTINGS_BACKUP_VERSION = 1;

function trimOrNull(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function isEncryptedPasswordPayload(value) {
  const parts = value.split(".");
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

function parseSettingsBackup(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Файл резервной копии повреждён или пуст");
  }

  const data = raw;
  if (data.format !== SETTINGS_BACKUP_FORMAT) {
    throw new Error("Это не файл резервной копии OCO Logistics");
  }
  if (data.version !== SETTINGS_BACKUP_VERSION) {
    throw new Error("Неподдерживаемая версия резервной копии");
  }
  if (typeof data.exportedAt !== "string" || Number.isNaN(Date.parse(data.exportedAt))) {
    throw new Error("В резервной копии нет даты экспорта");
  }

  const company = data.company;
  if (!company || typeof company !== "object") {
    throw new Error("В резервной копии нет блока настроек компании");
  }

  const name = trimOrNull(company.name);
  if (!name) throw new Error("В резервной копии не указано название компании");

  const apishipLogin = trimOrNull(company.apishipLogin);
  const apishipPasswordEnc = trimOrNull(company.apishipPasswordEnc);

  if (apishipPasswordEnc && !isEncryptedPasswordPayload(apishipPasswordEnc)) {
    throw new Error("Некорректный формат пароля APIShip в резервной копии");
  }
  if (apishipPasswordEnc && !apishipLogin) {
    throw new Error("В резервной копии есть пароль APIShip, но нет логина");
  }

  return data;
}

const validBackup = {
  format: SETTINGS_BACKUP_FORMAT,
  version: SETTINGS_BACKUP_VERSION,
  exportedAt: "2026-06-18T12:00:00.000Z",
  company: {
    name: "Brand Co",
    senderCity: "Москва",
    senderAddress: "ул. Тестовая, д. 1",
    senderPhone: "+79001234567",
    apishipLogin: "test",
    apishipPasswordEnc: "aabb.ccdd.eeff",
    apishipConnectedAt: "2026-06-18T10:00:00.000Z",
  },
};

test("parseSettingsBackup accepts valid backup", () => {
  const parsed = parseSettingsBackup(validBackup);
  assert.equal(parsed.company.name, "Brand Co");
});

test("parseSettingsBackup rejects wrong format", () => {
  assert.throws(
    () => parseSettingsBackup({ ...validBackup, format: "other" }),
    /не файл резервной копии/,
  );
});

test("parseSettingsBackup rejects password without login", () => {
  assert.throws(
    () =>
      parseSettingsBackup({
        ...validBackup,
        company: { ...validBackup.company, apishipLogin: null },
      }),
    /нет логина/,
  );
});

test("parseSettingsBackup rejects malformed encrypted password", () => {
  assert.throws(
    () =>
      parseSettingsBackup({
        ...validBackup,
        company: { ...validBackup.company, apishipPasswordEnc: "not-valid" },
      }),
    /Некорректный формат пароля/,
  );
});

test("parseSettingsBackup accepts backup without APIShip", () => {
  const parsed = parseSettingsBackup({
    ...validBackup,
    company: {
      ...validBackup.company,
      apishipLogin: null,
      apishipPasswordEnc: null,
      apishipConnectedAt: null,
    },
  });
  assert.equal(parsed.company.apishipLogin, null);
});
