import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { webhookDeliveries, webhooks, workspaces } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { enqueueWebhookDelivery } from "@/lib/queue/webhooks";
import { WEBHOOK_EVENT_TYPES, type WebhookEnvelope, type WebhookEventType } from "@/lib/webhooks/types";

export { WEBHOOK_EVENT_TYPES };
export type { WebhookEventType };
export type WebhookDeliveryStatus = "pending" | "processing" | "delivered" | "retrying" | "failed" | "cancelled";

export function isWebhookEventType(value: unknown): value is WebhookEventType {
  return typeof value === "string" && (WEBHOOK_EVENT_TYPES as readonly string[]).includes(value);
}

function safeData(data: Record<string, unknown>): Record<string, unknown> {
  const allowed = new Set([
    "postId", "status", "platform", "publishedAt", "scheduledAt", "failureReason",
    "accountId", "memberId", "oldRole", "newRole", "invitationId", "analyticsSnapshotId",
    "webhookId", "reason", "actorId", "reviewStatus", "reviewEventId",
  ]);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!allowed.has(key)) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
      result[key] = typeof value === "string" ? value.slice(0, 500) : value;
    }
  }
  return result;
}

export function buildWebhookEnvelope(input: {
  eventId?: string;
  type: WebhookEventType;
  workspace: { id: string; name: string };
  data: Record<string, unknown>;
  createdAt?: Date;
}): WebhookEnvelope {
  return {
    id: input.eventId ?? randomUUID(),
    type: input.type,
    version: "2026-09-01",
    createdAt: (input.createdAt ?? new Date()).toISOString(),
    workspace: input.workspace,
    data: safeData(input.data),
  };
}

function uniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && (error as { code?: unknown }).code === "23505") return true;
  if ("cause" in error) return uniqueViolation((error as { cause?: unknown }).cause);
  return false;
}

export async function emitWebhookEvent(input: {
  workspaceId: string;
  type: WebhookEventType;
  data: Record<string, unknown>;
  eventId?: string;
  webhookId?: string;
}): Promise<{ eventId: string; deliveryIds: string[] }> {
  const [workspace] = await db.select({ id: workspaces.id, name: workspaces.name }).from(workspaces).where(eq(workspaces.id, input.workspaceId)).limit(1);
  if (!workspace) return { eventId: input.eventId ?? randomUUID(), deliveryIds: [] };

  const endpoints = await db.select().from(webhooks).where(and(eq(webhooks.workspaceId, input.workspaceId), eq(webhooks.isActive, true), isNull(webhooks.deletedAt)));
  const envelope = buildWebhookEnvelope({ eventId: input.eventId, type: input.type, workspace, data: input.data });
  const deliveryIds: string[] = [];

  for (const endpoint of endpoints) {
    const configuredEvents = Array.isArray(endpoint.events) ? endpoint.events : [];
    if (endpoint.id !== input.webhookId && !configuredEvents.includes(input.type)) continue;
    try {
      const [delivery] = await db.insert(webhookDeliveries).values({
        webhookId: endpoint.id,
        workspaceId: input.workspaceId,
        eventType: input.type,
        eventId: envelope.id,
        payload: envelope,
      }).returning({ id: webhookDeliveries.id });
      if (!delivery) continue;
      deliveryIds.push(delivery.id);
      await enqueueWebhookDelivery({ webhookId: endpoint.id, deliveryId: delivery.id });
    } catch (error) {
      if (uniqueViolation(error)) {
        const [existing] = await db.select({ id: webhookDeliveries.id }).from(webhookDeliveries).where(and(eq(webhookDeliveries.webhookId, endpoint.id), eq(webhookDeliveries.eventId, envelope.id))).limit(1);
        if (existing) deliveryIds.push(existing.id);
        continue;
      }
      logger.error("webhook delivery enqueue failed", { webhookId: endpoint.id, eventType: input.type, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { eventId: envelope.id, deliveryIds };
}

export async function emitWebhookEventSafely(input: Parameters<typeof emitWebhookEvent>[0]): Promise<void> {
  try {
    await emitWebhookEvent(input);
  } catch (error) {
    logger.error("webhook event dispatch failed", { workspaceId: input.workspaceId, eventType: input.type, error: error instanceof Error ? error.message : String(error) });
  }
}
