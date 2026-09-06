import assert from "node:assert/strict";
import { before, describe, test } from "node:test";

// `serverConfig.encryptionKey` is resolved lazily but cached, so the key has to
// exist before `@/lib/crypto/tokens` is first imported. Tests run offline: this
// is a throwaway key, never a real deployment secret.
process.env.ENCRYPTION_KEY ??= "dGVzdC1lbmNyeXB0aW9uLWtleS0xMjM0NTY3ODkwMTI=";

const { decryptSecret, encryptSecret, resetEncryptionKeyCache, safeEqual } =
  await import("@/lib/crypto/tokens");

before(() => {
  resetEncryptionKeyCache();
});

describe("encryptSecret / decryptSecret", () => {
  test("round trips a value", () => {
    const plaintext = "EAAGsbCVZCr1kBZBoOauthTokenValue1234567890";
    const encoded = encryptSecret(plaintext);
    assert.equal(decryptSecret(encoded), plaintext);
  });

  test("round trips an empty string and unicode", () => {
    assert.equal(decryptSecret(encryptSecret("")), "");
    assert.equal(decryptSecret(encryptSecret("token — ünïcode ✓")), "token — ünïcode ✓");
  });

  test("the payload is versioned and base64url", () => {
    const encoded = encryptSecret("secret-value");
    const parts = encoded.split(".");
    assert.equal(parts.length, 4);
    assert.equal(parts[0], "v1");
    for (const part of parts.slice(1)) {
      assert.equal(/^[A-Za-z0-9_-]+$/.test(part), true, `${part} is base64url`);
    }
  });

  test("two encryptions of the same plaintext differ (random IV)", () => {
    const first = encryptSecret("same-token");
    const second = encryptSecret("same-token");
    assert.notEqual(first, second);
    assert.equal(decryptSecret(first), decryptSecret(second));
  });

  test("decryptSecret throws on a malformed payload", () => {
    assert.throws(() => decryptSecret("not-a-payload"));
    assert.throws(() => decryptSecret("v1.only.two"));
    assert.throws(() => decryptSecret("v2.a.b.c"), {
      message: "Stored secret has an unsupported format.",
    });
    assert.throws(() => decryptSecret("v1.short.b.c"), {
      message: "Stored secret has an unsupported format.",
    });
  });

  test("decryptSecret rejects a tampered ciphertext (GCM auth tag)", () => {
    const encoded = encryptSecret("live-access-token");
    const parts = encoded.split(".");
    const tamperedPayload = Buffer.from("tampered-payload")
      .toString("base64url")
      .padEnd(parts[3].length, "A");

    assert.throws(() =>
      decryptSecret([parts[0], parts[1], parts[2], tamperedPayload].join(".")),
    );
    assert.equal(decryptSecret(encoded), "live-access-token");
  });

  test("decryptSecret rejects a tampered auth tag", () => {
    const encoded = encryptSecret("live-access-token");
    const parts = encoded.split(".");
    const tag = Buffer.from(parts[2], "base64url");
    tag[0] ^= 0xff;
    const tampered = [parts[0], parts[1], tag.toString("base64url"), parts[3]].join(".");

    assert.throws(() => decryptSecret(tampered));
  });
});

describe("safeEqual", () => {
  test("equal strings match", () => {
    assert.equal(safeEqual("abc", "abc"), true);
    assert.equal(safeEqual("", ""), true);
    assert.equal(safeEqual("state-123", "state-123"), true);
  });

  test("different strings do not match", () => {
    assert.equal(safeEqual("abc", "abd"), false);
    assert.equal(safeEqual("abc", "ABC"), false);
    assert.equal(safeEqual("abc", "abcd"), false);
    assert.equal(safeEqual("abcd", "abc"), false);
    assert.equal(safeEqual("", "a"), false);
  });
});
