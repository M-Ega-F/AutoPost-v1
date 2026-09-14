import assert from "node:assert/strict";
import test from "node:test";

import { signWebhookPayload, verifyWebhookSignature } from "@/lib/webhooks/signing";
import { isRetryableWebhookStatus, retryDelayMs, WEBHOOK_RETRY_DELAYS_MS } from "@/lib/webhooks/retry";
import { isBlockedAddress, isBlockedHostname } from "@/lib/media/fetch-url";
import { buildWebhookEnvelope } from "@/lib/webhooks/events";

test("webhook signatures cover timestamp and exact payload", () => {
  const signature = signWebhookPayload("secret", 1_700_000_000, '{"id":"event"}');
  assert.match(signature, /^v1=[a-f0-9]{64}$/);
  assert.equal(verifyWebhookSignature("secret", 1_700_000_000, '{"id":"event"}', signature), true);
  assert.equal(verifyWebhookSignature("secret", 1_700_000_001, '{"id":"event"}', signature), false);
  assert.equal(verifyWebhookSignature("secret", 1_700_000_000, '{"id":"other"}', signature), false);
});

test("webhook retry classification and bounded Retry-After", () => {
  assert.equal(isRetryableWebhookStatus(500), true);
  assert.equal(isRetryableWebhookStatus(429), true);
  assert.equal(isRetryableWebhookStatus(400), false);
  assert.equal(retryDelayMs(2, "30"), 30_000);
  assert.equal(retryDelayMs(2, "999999"), 60 * 60_000);
  assert.equal(retryDelayMs(3, null), WEBHOOK_RETRY_DELAYS_MS[2]);
});

test("webhook SSRF predicates reject private and metadata destinations", () => {
  assert.equal(isBlockedHostname("localhost"), true);
  assert.equal(isBlockedHostname("service.internal"), true);
  assert.equal(isBlockedHostname("example.com"), false);
  assert.equal(isBlockedAddress("127.0.0.1"), true);
  assert.equal(isBlockedAddress("169.254.169.254"), true);
  assert.equal(isBlockedAddress("10.0.0.1"), true);
  assert.equal(isBlockedAddress("8.8.8.8"), false);
});

test("webhook envelope is versioned and excludes unapproved fields", () => {
  const envelope = buildWebhookEnvelope({ type: "post.published", workspace: { id: "workspace", name: "Demo" }, data: { postId: "post", token: "never", failureReason: "safe" } });
  assert.equal(envelope.version, "2026-09-01");
  assert.deepEqual(envelope.data, { postId: "post", failureReason: "safe" });
});
