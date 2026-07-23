import assert from "node:assert/strict";
import test from "node:test";

const SETTINGS_BACKUP_FORMAT = "oco-settings-backup";
const SETTINGS_BACKUP_VERSION = 1;

function trimOrNull(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
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

  return {
    format: SETTINGS_BACKUP_FORMAT,
    version: SETTINGS_BACKUP_VERSION,
    exportedAt: data.exportedAt,
    company: {
      name,
      senderCity: trimOrNull(company.senderCity),
      senderAddress: trimOrNull(company.senderAddress),
      senderPhone: trimOrNull(company.senderPhone),
    },
  };
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

test("parseSettingsBackup accepts old v1 backup that still carries APIShip keys", () => {
  const parsed = parseSettingsBackup({
    ...validBackup,
    company: {
      ...validBackup.company,
      apishipLogin: "test",
      apishipPasswordEnc: "aabb.ccdd.eeff",
      apishipConnectedAt: "2026-06-18T10:00:00.000Z",
    },
  });
  assert.equal(parsed.company.name, "Brand Co");
  assert.equal(parsed.company.senderCity, "Москва");
  assert.equal(parsed.company.senderAddress, "ул. Тестовая, д. 1");
  assert.equal(parsed.company.senderPhone, "+79001234567");
  assert.equal("apishipLogin" in parsed.company, false);
  assert.equal("apishipPasswordEnc" in parsed.company, false);
  assert.equal("apishipConnectedAt" in parsed.company, false);
});
