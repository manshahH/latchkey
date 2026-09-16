import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";
const keyLength = 32;

export interface KeyEncryptionService {
  decrypt(ciphertext: string): string;
  encrypt(plaintext: string): string;
}

export const createLocalKms = (key = randomBytes(keyLength)): KeyEncryptionService => {
  if (key.length !== keyLength) throw new Error("Encryption key must be 32 bytes.");
  return {
    encrypt: (plaintext) => {
      const iv = randomBytes(12);
      const cipher = createCipheriv(algorithm, key, iv);
      const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      return [iv, cipher.getAuthTag(), encrypted]
        .map((part) => part.toString("base64url"))
        .join(".");
    },
    decrypt: (ciphertext) => {
      const [ivValue, tagValue, encryptedValue] = ciphertext.split(".");
      if (!ivValue || !tagValue || !encryptedValue) throw new Error("Invalid ciphertext.");
      const decipher = createDecipheriv(algorithm, key, Buffer.from(ivValue, "base64url"));
      decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(encryptedValue, "base64url")),
        decipher.final()
      ]).toString("utf8");
    }
  };
};

export const createToken = (): string => randomBytes(32).toString("base64url");
export const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");
