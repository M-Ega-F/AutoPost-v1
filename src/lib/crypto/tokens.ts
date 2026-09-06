import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { serverConfig } from "@/lib/env";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

let cachedKey: Buffer | undefined;

function encryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = serverConfig.encryptionKey;

  const base64 = Buffer.from(raw, "base64");
  if (base64.length === 32) {
    cachedKey = base64;
    return cachedKey;
  }

  if (/^[0-9a-f]{64}$/i.test(raw)) {
    cachedKey = Buffer.from(raw, "hex");
    return cachedKey;
  }

  // Fall back to a deterministic derivation so a passphrase-style key still
  // works. A 32 byte random base64 key is strongly preferred.
  cachedKey = createHash("sha256").update(raw, "utf8").digest();
  return cachedKey;
}

export function resetEncryptionKeyCache(): void {
  cachedKey = undefined;
}

/**
 * Encrypts a secret (an OAuth access or refresh token) for storage at rest.
 * Output format: `v1.<iv>.<authTag>.<ciphertext>` (all base64url).
 */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptSecret(encoded: string): string {
  const parts = encoded.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Stored secret has an unsupported format.");
  }

  const [, ivPart, tagPart, payloadPart] = parts;
  const iv = Buffer.from(ivPart, "base64url");
  const tag = Buffer.from(tagPart, "base64url");
  const payload = Buffer.from(payloadPart, "base64url");

  if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
    throw new Error("Stored secret has an unsupported format.");
  }

  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(payload), decipher.final()]).toString(
    "utf8",
  );
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
