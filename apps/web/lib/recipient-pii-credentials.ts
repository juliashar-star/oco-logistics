import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/** Ключ шифрования ПДн получателя в Shipment — только из .env, минимум 32 символа. */
export function isRecipientPiiEncryptionConfigured(): boolean {
  const secret = process.env.RECIPIENT_PII_ENCRYPTION_KEY;
  return Boolean(secret && secret.length >= 32);
}

function getEncryptionKey(): Buffer {
  const secret = process.env.RECIPIENT_PII_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new Error("RECIPIENT_PII_ENCRYPTION_KEY_MISSING");
  }
  return scryptSync(secret, "oco-recipient-pii-v1", 32);
}

/** Шифрует поле ПДн получателя для хранения в базе (не хэш — нужен для UI/экспорта/API). */
export function encryptRecipientPii(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptRecipientPii(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Некорректный формат зашифрованных данных получателя");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
