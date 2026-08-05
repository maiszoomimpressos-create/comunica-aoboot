import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // recommended nonce length for GCM

function getKey(): Buffer {
  const raw = process.env.SECRET_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "SECRET_ENCRYPTION_KEY não configurada. Gere uma chave de 32 bytes em base64 " +
        '(ex: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))") ' +
        "e defina essa variável de ambiente antes de armazenar qualquer segredo."
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("SECRET_ENCRYPTION_KEY deve decodificar para exatamente 32 bytes (AES-256).");
  }
  return key;
}

/**
 * Encrypts a secret (e.g. a tenant's WhatsApp provider API token) at rest
 * using AES-256-GCM via Node's built-in `crypto` — no native/npm binary
 * dependency, so it isn't affected by this machine's native-binary block.
 * Stored format is "iv:authTag:ciphertext", each segment base64-encoded, so
 * it fits in a single TEXT column.
 *
 * These are customer business credentials (e.g. a Z-API instance token),
 * not our own secrets — storing them in plain text would be exactly the
 * kind of provisional shortcut this project avoids.
 */
export function encryptSecret(plain: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptSecret(stored: string): string {
  const key = getKey();
  const [ivB64, authTagB64, ciphertextB64] = stored.split(":");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Formato inválido de segredo criptografado.");
  }
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString("utf8");
}
