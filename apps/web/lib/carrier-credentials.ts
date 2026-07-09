import {
  decryptField,
  encryptField,
  resolveFieldEncryptionKey,
} from "@oco/core/crypto/field-encryption";
import type { CarrierCredentials } from "@oco/core/carrier-adapter/types";

/** Ключ шифрования CarrierCredential.credentialsEnc — только из .env, минимум 32 символа. */
export function isCarrierCredentialsEncryptionConfigured(): boolean {
  const secret = process.env.CARRIER_CREDENTIALS_ENCRYPTION_KEY;
  return Boolean(secret && secret.length >= 32);
}

function getEncryptionKey(): Buffer {
  return resolveFieldEncryptionKey("CARRIER_CREDENTIALS_ENCRYPTION_KEY", "oco-carrier-credentials-v1");
}

/** Шифрует креды перевозчика (JSON) для хранения в CarrierCredential.credentialsEnc. */
export function encryptCarrierCredentials(creds: CarrierCredentials): string {
  return encryptField(JSON.stringify(creds), getEncryptionKey());
}

export function decryptCarrierCredentials(payload: string): CarrierCredentials {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Некорректный формат зашифрованных credentials перевозчика");
  }
  const json = decryptField(payload, getEncryptionKey());
  return JSON.parse(json) as CarrierCredentials;
}
