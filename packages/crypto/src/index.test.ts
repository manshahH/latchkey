import { expect, test } from "vitest";
import { createLocalKms, createToken, hashToken } from "./index.js";

test("encrypts secrets and hashes random tokens", () => {
  const kms = createLocalKms(Buffer.alloc(32, 7));
  const ciphertext = kms.encrypt("secret");
  expect(ciphertext).not.toContain("secret");
  expect(kms.decrypt(ciphertext)).toBe("secret");
  expect(hashToken(createToken())).toHaveLength(64);
});
