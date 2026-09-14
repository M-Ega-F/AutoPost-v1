import { createHmac, timingSafeEqual } from "node:crypto";

export function signWebhookPayload(secret: string, timestamp: number, rawPayload: string): string {
  const digest = createHmac("sha256", secret).update(`${timestamp}.${rawPayload}`, "utf8").digest("hex");
  return `v1=${digest}`;
}

export function verifyWebhookSignature(secret: string, timestamp: number, rawPayload: string, signature: string): boolean {
  const expected = signWebhookPayload(secret, timestamp, rawPayload);
  const actual = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}
