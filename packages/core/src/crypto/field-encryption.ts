import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

export function resolveFieldEncryptionKey(
  envVarName: string,
  salt: string,
  minLength = 32,
): Buffer {
  const secret = process.env[envVarName];
  if (!secret || secret.length < minLength) {
    throw new Error(`${envVarName}_MISSING`);
  }
  return scryptSync(secret, salt, 32);
}

export function encryptField(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptField(payload: string, key: Buffer): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("INVALID_ENCRYPTED_FIELD_PAYLOAD");
  }

  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
