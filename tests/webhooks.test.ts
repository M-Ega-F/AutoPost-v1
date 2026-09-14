import { strict as assert } from "node:assert";
import { beforeEach, describe, test } from "node:test";

import { createWebhook, getWebhook, listWebhookDeliveries } from "@/lib/webhooks/service";
import { emitWebhookEvent } from "@/lib/webhooks/events";
import { webhookDeliveries, webhooks } from "@/lib/db/schema";
import { encryptSecret } from "@/lib/crypto/tokens";

import { getDb } from "./db-harness";
import { getActiveWorkspaceForUser } from "@/lib/domain/workspaces";
import { setupTestDatabase, USER_ID } from "./fixtures";
import { webhookEnqueued } from "./fake-queue";

describe("outbound webhooks", () => {
  beforeEach(async () => setupTestDatabase());

  test("creates encrypted secret once, scopes events, and enqueues ID-only deliveries", async () => {
    const created = await createWebhook(USER_ID, { name: "Automation", url: "https://example.com/hook", events: ["post.published"] });
    assert.ok(created.secret.length >= 40);
    const publicWebhook = await getWebhook(USER_ID, created.webhook.id);
    assert.equal("secret" in publicWebhook, false);
    const stored = await getDb().select({ encryptedSecret: webhooks.encryptedSecret }).from(webhooks);
    assert.equal(stored.length, 1);
    assert.notEqual(stored[0]?.encryptedSecret, created.secret);

    const workspace = (await getActiveWorkspaceForUser(USER_ID)).workspace;
    const emitted = await emitWebhookEvent({ workspaceId: workspace.id, type: "post.published", data: { postId: "post-1", token: "must-not-store" } });
    assert.equal(emitted.deliveryIds.length, 1);
    assert.equal(webhookEnqueued.length, 1);
    assert.deepEqual(Object.keys(webhookEnqueued[0]!).sort(), ["delayMs", "deliveryId", "webhookId"]);
    const deliveries = await listWebhookDeliveries(USER_ID, created.webhook.id);
    assert.equal(deliveries[0]?.eventType, "post.published");
    const raw = await getDb().select({ payload: webhookDeliveries.payload }).from(webhookDeliveries);
    assert.equal(JSON.stringify(raw[0]?.payload).includes("must-not-store"), false);
  });

  test("does not cross workspace boundaries", async () => {
    const first = (await getActiveWorkspaceForUser(USER_ID)).workspace;
    const otherUser = "22222222-2222-2222-2222-222222222222";
    const other = (await getActiveWorkspaceForUser(otherUser)).workspace;
    await getDb().insert(webhooks).values({ workspaceId: other.id, createdBy: otherUser, name: "Other", url: "https://example.com/other", encryptedSecret: encryptSecret("other-secret"), events: ["post.published"] });
    const result = await emitWebhookEvent({ workspaceId: first.id, type: "post.published", data: { postId: "post-2" } });
    assert.equal(result.deliveryIds.length, 0);
  });
});
