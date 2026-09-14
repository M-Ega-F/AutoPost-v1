import { Queue, type ConnectionOptions, type JobsOptions } from "bullmq";
import IORedis from "ioredis";

import { serverConfig } from "@/lib/env";

export const PUBLISH_QUEUE_NAME = "publish-post-platform";
export const ANALYTICS_QUEUE_NAME = "sync-post-analytics";
export const WEBHOOK_QUEUE_NAME = "deliver-webhook";

let connection: ConnectionOptions | undefined;

/**
 * BullMQ needs a raw TCP Redis connection (`rediss://` for Upstash), not the
 * Upstash REST API. `maxRetriesPerRequest: null` is required by BullMQ.
 */
export function getRedisConnection(): ConnectionOptions {
  if (connection) return connection;

  const options = new IORedis(serverConfig.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectTimeout: 15_000,
    retryStrategy: (times: number) => Math.min(times * 500, 5_000),
  }) as unknown as ConnectionOptions;

  connection = options;
  return connection;
}

/**
 * Returns the shared ioredis client behind BullMQ's connection options.
 * Observability uses the same multiplexed connection instead of opening a
 * second Redis connection for every health request.
 */
export function getRedisClient(): IORedis {
  getRedisConnection();
  return connection as unknown as IORedis;
}

let queue: Queue | undefined;
let analyticsQueue: Queue | undefined;
let webhookQueue: Queue | undefined;

export function getPublishQueue(): Queue {
  if (!queue) {
    queue = new Queue(PUBLISH_QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: defaultJobOptions(),
    });
  }
  return queue;
}

export function getAnalyticsQueue(): Queue {
  if (!analyticsQueue) {
    analyticsQueue = new Queue(ANALYTICS_QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: defaultJobOptions(),
    });
  }
  return analyticsQueue;
}

export function getWebhookQueue(): Queue {
  if (!webhookQueue) {
    webhookQueue = new Queue(WEBHOOK_QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
        removeOnFail: { age: 7 * 24 * 60 * 60 },
        attempts: 1,
      },
    });
  }
  return webhookQueue;
}

export function defaultJobOptions(): JobsOptions {
  return {
    removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
    removeOnFail: { age: 7 * 24 * 60 * 60 },
    attempts: 3,
    backoff: { type: "exponential", delay: 15_000 },
  };
}

export async function closeQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = undefined;
  }
  if (analyticsQueue) {
    await analyticsQueue.close();
    analyticsQueue = undefined;
  }
  if (webhookQueue) {
    await webhookQueue.close();
    webhookQueue = undefined;
  }
  const redis = connection as unknown as IORedis | undefined;
  if (redis && typeof redis.disconnect === "function") {
    redis.disconnect();
    connection = undefined;
  }
}
