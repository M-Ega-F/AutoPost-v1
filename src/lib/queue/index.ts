import { Queue, type ConnectionOptions, type JobsOptions } from "bullmq";
import IORedis from "ioredis";

import { serverConfig } from "@/lib/env";

export const PUBLISH_QUEUE_NAME = "publish-post-platform";

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

let queue: Queue | undefined;

export function getPublishQueue(): Queue {
  if (!queue) {
    queue = new Queue(PUBLISH_QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: defaultJobOptions(),
    });
  }
  return queue;
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
  const redis = connection as unknown as IORedis | undefined;
  if (redis && typeof redis.disconnect === "function") {
    redis.disconnect();
    connection = undefined;
  }
}
