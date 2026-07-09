import {
  decryptField,
  encryptField,
  resolveFieldEncryptionKey,
} from "@oco/core/crypto/field-encryption";

/** Ключ шифрования apishipPasswordEnc — только из .env, минимум 32 символа. */
export function isApishipEncryptionConfigured(): boolean {
  const secret = process.env.APISHIP_ENCRYPTION_KEY;
  return Boolean(secret && secret.length >= 32);
}

function getEncryptionKey(): Buffer {
  return resolveFieldEncryptionKey("APISHIP_ENCRYPTION_KEY", "oco-apiship-v1");
}

/** Шифрует пароль APIShip для хранения в базе (не хэш — нужен для вызовов API). */
export function encryptApishipPassword(plain: string): string {
  return encryptField(plain, getEncryptionKey());
}

export function decryptApishipPassword(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Некорректный формат зашифрованного пароля APIShip");
  }

  return decryptField(payload, getEncryptionKey());
}

export function maskApishipLogin(login: string): string {
  if (login.length <= 2) return "***";
  return `${login.slice(0, 2)}***`;
}

export function isSandboxApishipUrl(baseUrl?: string): boolean {
  return (baseUrl ?? process.env.APISHIP_BASE_URL ?? "").includes("dev.apiship");
}
