export const SETTINGS_BACKUP_FORMAT = "oco-settings-backup" as const;
export const SETTINGS_BACKUP_VERSION = 1;

export type SettingsBackupCompany = {
  name: string;
  senderCity: string | null;
  senderAddress: string | null;
  senderPhone: string | null;
  apishipLogin: string | null;
  apishipPasswordEnc: string | null;
  apishipConnectedAt: string | null;
};

export type SettingsBackupPayload = {
  format: typeof SETTINGS_BACKUP_FORMAT;
  version: typeof SETTINGS_BACKUP_VERSION;
  exportedAt: string;
  company: SettingsBackupCompany;
};

export type CompanyBackupSource = {
  name: string;
  senderCity: string | null;
  senderAddress: string | null;
  senderPhone: string | null;
  apishipLogin: string | null;
  apishipPasswordEnc: string | null;
  apishipConnectedAt: Date | null;
};

export type RestoreSettingsData = {
  senderCity: string | null;
  senderAddress: string | null;
  senderPhone: string | null;
};

import { normalizeRuPhone } from "@/lib/phone/ru-phone";

export class SettingsBackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettingsBackupError";
  }
}

function trimOrNull(value: unknown): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function isEncryptedPasswordPayload(value: string): boolean {
  const parts = value.split(".");
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

export function buildSettingsBackup(
  company: CompanyBackupSource,
  exportedAt = new Date(),
): SettingsBackupPayload {
  return {
    format: SETTINGS_BACKUP_FORMAT,
    version: SETTINGS_BACKUP_VERSION,
    exportedAt: exportedAt.toISOString(),
    company: {
      name: company.name.trim(),
      senderCity: trimOrNull(company.senderCity),
      senderAddress: trimOrNull(company.senderAddress),
      senderPhone: trimOrNull(company.senderPhone),
      apishipLogin: trimOrNull(company.apishipLogin),
      apishipPasswordEnc: trimOrNull(company.apishipPasswordEnc),
      apishipConnectedAt: company.apishipConnectedAt?.toISOString() ?? null,
    },
  };
}

export function parseSettingsBackup(raw: unknown): SettingsBackupPayload {
  if (!raw || typeof raw !== "object") {
    throw new SettingsBackupError("Файл резервной копии повреждён или пуст");
  }

  const data = raw as Record<string, unknown>;

  if (data.format !== SETTINGS_BACKUP_FORMAT) {
    throw new SettingsBackupError("Это не файл резервной копии OCO Logistics");
  }

  if (data.version !== SETTINGS_BACKUP_VERSION) {
    throw new SettingsBackupError("Неподдерживаемая версия резервной копии");
  }

  if (typeof data.exportedAt !== "string" || Number.isNaN(Date.parse(data.exportedAt))) {
    throw new SettingsBackupError("В резервной копии нет даты экспорта");
  }

  const company = data.company;
  if (!company || typeof company !== "object") {
    throw new SettingsBackupError("В резервной копии нет блока настроек компании");
  }

  const companyData = company as Record<string, unknown>;
  const name = trimOrNull(companyData.name);
  if (!name) {
    throw new SettingsBackupError("В резервной копии не указано название компании");
  }

  const senderPhoneRaw = trimOrNull(companyData.senderPhone);
  let senderPhone: string | null = null;
  if (senderPhoneRaw) {
    const normalized = normalizeRuPhone(senderPhoneRaw);
    if (!normalized.ok) {
      throw new SettingsBackupError("Некорректный телефон отправителя в резервной копии");
    }
    senderPhone = normalized.value || null;
  }

  const apishipLogin = trimOrNull(companyData.apishipLogin);
  const apishipPasswordEnc = trimOrNull(companyData.apishipPasswordEnc);

  if (apishipPasswordEnc && !isEncryptedPasswordPayload(apishipPasswordEnc)) {
    throw new SettingsBackupError("Некорректный формат пароля APIShip в резервной копии");
  }

  if (apishipPasswordEnc && !apishipLogin) {
    throw new SettingsBackupError("В резервной копии есть пароль APIShip, но нет логина");
  }

  const apishipConnectedAtRaw = companyData.apishipConnectedAt;
  if (
    apishipConnectedAtRaw != null &&
    (typeof apishipConnectedAtRaw !== "string" || Number.isNaN(Date.parse(apishipConnectedAtRaw)))
  ) {
    throw new SettingsBackupError("Некорректная дата подключения APIShip в резервной копии");
  }

  return {
    format: SETTINGS_BACKUP_FORMAT,
    version: SETTINGS_BACKUP_VERSION,
    exportedAt: data.exportedAt,
    company: {
      name,
      senderCity: trimOrNull(companyData.senderCity),
      senderAddress: trimOrNull(companyData.senderAddress),
      senderPhone,
      apishipLogin,
      apishipPasswordEnc,
      apishipConnectedAt:
        apishipConnectedAtRaw == null ? null : String(apishipConnectedAtRaw),
    },
  };
}

export function restoreDataFromBackup(payload: SettingsBackupPayload): RestoreSettingsData {
  return {
    senderCity: payload.company.senderCity,
    senderAddress: payload.company.senderAddress,
    senderPhone: payload.company.senderPhone,
  };
}

export function settingsBackupFilename(exportedAt: Date): string {
  const date = exportedAt.toISOString().slice(0, 10);
  return `oco-settings-backup-${date}.json`;
}
