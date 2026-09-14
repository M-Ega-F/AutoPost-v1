import "server-only";

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { z } from "zod";

import { requireWorkspacePermission } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { webhookDeliveries, webhooks } from "@/lib/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto/tokens";
import { AppError } from "@/lib/errors";
import { notifyWebhookOperationalEvent } from "@/lib/domain/notifications";
import { isWebhookEventType } from "@/lib/webhooks/events";
import { validateWebhookUrl } from "@/lib/webhooks/security";
import { WEBHOOK_EVENT_TYPES, type WebhookDeliveryPublic, type WebhookEventType, type WebhookPublic } from "@/lib/webhooks/types";

const webhookInputSchema = z.object({
  name: z.string().trim().min(1, "Enter a webhook name.").max(120, "Webhook names must be 120 characters or fewer."),
  url: z.string().trim().min(1, "Enter a webhook URL."),
  events: z.array(z.string()).min(1, "Choose at least one event.").max(WEBHOOK_EVENT_TYPES.length),
  workspaceId: z.string().uuid().optional(),
});

export type WebhookInput = z.infer<typeof webhookInputSchema>;
export const WEBHOOK_AUTO_DISABLE_THRESHOLD = 10;

function parseEvents(values: string[]): WebhookEventType[] {
  const unique = [...new Set(values)];
  if (unique.some((value) => !isWebhookEventType(value))) throw new AppError("validation_failed", "Choose valid webhook events.");
  return unique as WebhookEventType[];
}

function publicStatus(row: typeof webhooks.$inferSelect): WebhookPublic["status"] {
  if (row.deletedAt || !row.isActive) return "disabled";
  if (row.consecutiveFailureCount >= WEBHOOK_AUTO_DISABLE_THRESHOLD) return "failing";
  if (row.consecutiveFailureCount > 0) return "degraded";
  return "healthy";
}

function toPublic(row: typeof webhooks.$inferSelect): WebhookPublic {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    url: row.url,
    events: parseEvents(Array.isArray(row.events) ? row.events : []),
    isActive: row.isActive,
    status: publicStatus(row),
    failureCount: row.failureCount,
    consecutiveFailureCount: row.consecutiveFailureCount,
    lastDeliveryAt: row.lastDeliveryAt?.toISOString() ?? null,
    lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
    lastFailureAt: row.lastFailureAt?.toISOString() ?? null,
    disabledAt: row.disabledAt?.toISOString() ?? null,
    disabledReason: row.disabledReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDelivery(row: typeof webhookDeliveries.$inferSelect): WebhookDeliveryPublic {
  return {
    id: row.id,
    webhookId: row.webhookId,
    eventType: row.eventType as WebhookEventType,
    eventId: row.eventId,
    status: row.status as WebhookDeliveryPublic["status"],
    attemptCount: row.attemptCount,
    responseStatus: row.responseStatus,
    responseTimeMs: row.responseTimeMs,
    lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
    nextAttemptAt: row.nextAttemptAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    failedAt: row.failedAt?.toISOString() ?? null,
    errorCode: row.errorCode,
    safeErrorMessage: row.safeErrorMessage,
    createdAt: row.createdAt.toISOString(),
  };
}

function newSecret(): string {
  return randomBytes(32).toString("base64url");
}

async function findAuthorizedWebhook(userId: string, webhookId: string, permission: "webhooks:view" | "webhooks:update" | "webhooks:delete" | "webhooks:test"): Promise<{ row: typeof webhooks.$inferSelect; workspaceId: string }> {
  const [row] = await db.select().from(webhooks).where(and(eq(webhooks.id, webhookId), isNull(webhooks.deletedAt))).limit(1);
  if (!row) throw new AppError("not_found", "Webhook not found.");
  await requireWorkspacePermission(userId, permission, row.workspaceId);
  return { row, workspaceId: row.workspaceId };
}

export async function listWebhooks(userId: string): Promise<WebhookPublic[]> {
  const context = await requireWorkspacePermission(userId, "webhooks:view");
  const rows = await db.select().from(webhooks).where(and(eq(webhooks.workspaceId, context.workspaceId), isNull(webhooks.deletedAt))).orderBy(desc(webhooks.createdAt));
  return rows.map(toPublic);
}

export async function getWebhook(userId: string, webhookId: string): Promise<WebhookPublic> {
  const { row } = await findAuthorizedWebhook(userId, webhookId, "webhooks:view");
  return toPublic(row);
}

export async function createWebhook(userId: string, input: WebhookInput): Promise<{ webhook: WebhookPublic; secret: string }> {
  const parsed = webhookInputSchema.parse(input);
  const context = await requireWorkspacePermission(userId, "webhooks:create", input.workspaceId);
  const url = validateWebhookUrl(parsed.url).toString();
  const events = parseEvents(parsed.events);
  const secret = newSecret();
  const [row] = await db.insert(webhooks).values({ workspaceId: context.workspaceId, name: parsed.name, url, encryptedSecret: encryptSecret(secret), events, createdBy: userId }).returning();
  if (!row) throw new AppError("server_error", "We couldn't create this webhook.");
  return { webhook: toPublic(row), secret };
}

export async function updateWebhook(userId: string, webhookId: string, input: WebhookInput): Promise<WebhookPublic> {
  const parsed = webhookInputSchema.parse(input);
  const { row } = await findAuthorizedWebhook(userId, webhookId, "webhooks:update");
  const url = validateWebhookUrl(parsed.url).toString();
  const events = parseEvents(parsed.events);
  const [updated] = await db.update(webhooks).set({ name: parsed.name, url, events, updatedAt: new Date() }).where(eq(webhooks.id, row.id)).returning();
  if (!updated) throw new AppError("not_found", "Webhook not found.");
  return toPublic(updated);
}

export async function setWebhookActive(userId: string, webhookId: string, active: boolean): Promise<WebhookPublic> {
  const { row } = await findAuthorizedWebhook(userId, webhookId, "webhooks:update");
  const [updated] = await db.update(webhooks).set({ isActive: active, disabledAt: active ? null : new Date(), disabledReason: active ? null : "manually_disabled", updatedAt: new Date() }).where(eq(webhooks.id, row.id)).returning();
  if (!updated) throw new AppError("not_found", "Webhook not found.");
  return toPublic(updated);
}

export async function deleteWebhook(userId: string, webhookId: string): Promise<void> {
  const { row } = await findAuthorizedWebhook(userId, webhookId, "webhooks:delete");
  await db.transaction(async (tx) => {
    await tx.update(webhooks).set({ isActive: false, deletedAt: new Date(), disabledAt: new Date(), disabledReason: "deleted", updatedAt: new Date() }).where(eq(webhooks.id, row.id));
    await tx.update(webhookDeliveries).set({ status: "cancelled", updatedAt: new Date() }).where(and(eq(webhookDeliveries.webhookId, row.id), sql`${webhookDeliveries.status} in ('pending', 'retrying')`));
  });
}

export async function rotateWebhookSecret(userId: string, webhookId: string): Promise<string> {
  const { row } = await findAuthorizedWebhook(userId, webhookId, "webhooks:update");
  const secret = newSecret();
  await db.update(webhooks).set({ encryptedSecret: encryptSecret(secret), updatedAt: new Date() }).where(eq(webhooks.id, row.id));
  void notifyWebhookOperationalEvent(row.workspaceId, row.id, "secret_rotated");
  return secret;
}

export async function testWebhook(userId: string, webhookId: string): Promise<{ deliveryId: string; eventId: string }> {
  const { row } = await findAuthorizedWebhook(userId, webhookId, "webhooks:test");
  const result = await import("@/lib/webhooks/events").then(({ emitWebhookEvent }) => emitWebhookEvent({ workspaceId: row.workspaceId, webhookId: row.id, type: "webhook.test", data: { webhookId } }));
  const [delivery] = result.deliveryIds.length ? await db.select({ id: webhookDeliveries.id, eventId: webhookDeliveries.eventId }).from(webhookDeliveries).where(eq(webhookDeliveries.id, result.deliveryIds[0]!)).limit(1) : [];
  if (!delivery) throw new AppError("conflict", "This webhook is not subscribed to test events.");
  return { deliveryId: delivery.id, eventId: delivery.eventId };
}

export async function listWebhookDeliveries(userId: string, webhookId: string, limit = 50): Promise<WebhookDeliveryPublic[]> {
  const { row } = await findAuthorizedWebhook(userId, webhookId, "webhooks:view");
  const rows = await db.select().from(webhookDeliveries).where(and(eq(webhookDeliveries.webhookId, row.id), eq(webhookDeliveries.workspaceId, row.workspaceId))).orderBy(desc(webhookDeliveries.createdAt)).limit(Math.min(100, Math.max(1, limit)));
  return rows.map(toDelivery);
}

export async function getWebhookDelivery(userId: string, webhookId: string, deliveryId: string): Promise<WebhookDeliveryPublic> {
  const { row } = await findAuthorizedWebhook(userId, webhookId, "webhooks:view");
  const [delivery] = await db.select().from(webhookDeliveries).where(and(eq(webhookDeliveries.id, deliveryId), eq(webhookDeliveries.webhookId, row.id), eq(webhookDeliveries.workspaceId, row.workspaceId))).limit(1);
  if (!delivery) throw new AppError("not_found", "Delivery not found.");
  return toDelivery(delivery);
}

export async function loadWebhookForDelivery(webhookId: string, deliveryId: string): Promise<{ webhook: typeof webhooks.$inferSelect; delivery: typeof webhookDeliveries.$inferSelect } | null> {
  const [row] = await db.select({ webhook: webhooks, delivery: webhookDeliveries }).from(webhookDeliveries).innerJoin(webhooks, eq(webhooks.id, webhookDeliveries.webhookId)).where(and(eq(webhooks.id, webhookId), eq(webhookDeliveries.id, deliveryId))).limit(1);
  return row ?? null;
}

export { decryptSecret };
