import type { EnqueueInput } from "@/lib/queue/publish";

/**
 * Records what would have gone to BullMQ/Redis. The queue is an external
 * boundary, not the thing under test — what matters is that the right job is
 * enqueued with the right delay, and that cancelling removes it.
 */

export type FakeJob = {
  id: string;
  name: string;
  postPlatformId: string;
  attempt: number;
  delayMs: number | null;
  maxAttempts: number | null;
};

export const enqueued: FakeJob[] = [];
export const removed: string[] = [];

export function publishJobId(postPlatformId: string, attempt: number): string {
  return `${postPlatformId}:${attempt}`;
}

export async function enqueuePublishJob(
  input: EnqueueInput,
): Promise<string | undefined> {
  const id = publishJobId(input.postPlatformId, input.attempt);

  enqueued.push({
    id,
    name: "publish",
    postPlatformId: input.postPlatformId,
    attempt: input.attempt,
    delayMs: typeof input.delayMs === "number" ? Math.ceil(input.delayMs) : null,
    maxAttempts: typeof input.maxAttempts === "number" ? input.maxAttempts : null,
  });

  return id;
}

export async function removePublishJob(
  jobId: string | null | undefined,
): Promise<boolean> {
  if (!jobId) return false;
  removed.push(jobId);
  return true;
}

export async function removePublishJobs(
  jobIds: Array<string | null | undefined>,
): Promise<number> {
  let count = 0;
  for (const jobId of jobIds) {
    if (await removePublishJob(jobId)) count += 1;
  }
  return count;
}

export function resetQueue(): void {
  enqueued.length = 0;
  removed.length = 0;
}

export function jobsFor(postPlatformId: string): FakeJob[] {
  return enqueued.filter((job) => job.postPlatformId === postPlatformId);
}
