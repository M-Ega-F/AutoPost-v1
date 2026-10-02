import assert from "node:assert/strict";
import { after, test } from "node:test";

import { decryptSecret } from "@/lib/crypto/tokens";
import { resolveEncryptedRefreshToken } from "./accounts";

const previousEncryptionKey = process.env.ENCRYPTION_KEY;
process.env.ENCRYPTION_KEY = "c".repeat(64);

after(() => {
  if (previousEncryptionKey === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = previousEncryptionKey;
});

test("OAuth reconnect preserves an existing refresh token when Google omits one", () => {
  assert.equal(
    resolveEncryptedRefreshToken("existing-ciphertext", null),
    "existing-ciphertext",
  );
  assert.equal(
    resolveEncryptedRefreshToken("existing-ciphertext", undefined),
    "existing-ciphertext",
  );
});

test("OAuth reconnect encrypts and replaces an existing refresh token when a new one is returned", () => {
  const encrypted = resolveEncryptedRefreshToken("existing-ciphertext", "new-refresh-token");

  assert.ok(encrypted);
  assert.notEqual(encrypted, "new-refresh-token");
  assert.equal(decryptSecret(encrypted), "new-refresh-token");
});
