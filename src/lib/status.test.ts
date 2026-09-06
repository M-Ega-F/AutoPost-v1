import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  ACCOUNT_STATUS_META,
  derivePostStatus,
  EXECUTION_STATUS_META,
  isInFlightPostStatus,
  isPostStatus,
  isTerminalPostStatus,
  PLATFORMS,
  PLATFORM_FALLBACK_ICON,
  platformLabel,
  PLATFORM_META,
  PLATFORM_STATUS_META,
  POST_STATUS_META,
  type PostPlatformStatus,
  type PostStatus,
  type StatusTone,
} from "@/lib/status";

const TONES: readonly StatusTone[] = [
  "neutral",
  "info",
  "success",
  "warning",
  "danger",
];

function assertCopy(
  meta: { label: string; tone: string; icon: unknown },
  label: string,
) {
  assert.equal(meta.label, label);
  assert.ok(
    TONES.includes(meta.tone as StatusTone),
    `tone "${meta.tone}" is not a StatusTone`,
  );
  // Lucide icons are React components: a function or a forwardRef object.
  assert.ok(meta.icon, `${label} needs a lucide icon`);
  assert.equal(
    typeof meta.icon === "function" || typeof meta.icon === "object",
    true,
    `${label} needs a lucide icon`,
  );
}

describe("derivePostStatus", () => {
  test("all success is published", () => {
    assert.equal(derivePostStatus(["success"]), "published");
    assert.equal(derivePostStatus(["success", "success"]), "published");
    assert.equal(
      derivePostStatus(["success", "success", "success"]),
      "published",
    );
  });

  test("mixed success and failure is partial_failure", () => {
    assert.equal(derivePostStatus(["failed", "success"]), "partial_failure");
    assert.equal(derivePostStatus(["success", "failed"]), "partial_failure");
    assert.equal(
      derivePostStatus(["failed", "success", "success"]),
      "partial_failure",
    );
  });

  test("the plan's critical scenario is never failed or published", () => {
    const statuses: PostPlatformStatus[] = ["failed", "success", "success"];
    const result = derivePostStatus(statuses);
    assert.equal(result, "partial_failure");
    assert.notEqual(result, "failed");
    assert.notEqual(result, "published");
  });

  test("all failed is failed", () => {
    assert.equal(derivePostStatus(["failed"]), "failed");
    assert.equal(derivePostStatus(["failed", "failed"]), "failed");
  });

  test("any processing with no terminal failure is processing", () => {
    assert.equal(derivePostStatus(["processing"]), "processing");
    assert.equal(derivePostStatus(["success", "processing"]), "processing");
    assert.equal(derivePostStatus(["pending", "processing"]), "processing");
  });

  test("all pending depends on whether the post is scheduled", () => {
    assert.equal(
      derivePostStatus(["pending"], { scheduled: true }),
      "scheduled",
    );
    assert.equal(
      derivePostStatus(["pending"], { scheduled: false }),
      "processing",
    );
    assert.equal(
      derivePostStatus(["pending", "pending", "pending"], { scheduled: true }),
      "scheduled",
    );
    assert.equal(
      derivePostStatus(["pending", "pending"], { scheduled: false }),
      "processing",
    );
  });

  test("an empty array is failed when not scheduled and scheduled otherwise", () => {
    assert.equal(derivePostStatus([]), "failed");
    assert.equal(derivePostStatus([], { scheduled: false }), "failed");
    assert.equal(derivePostStatus([], { scheduled: true }), "scheduled");
  });

  test("every output is a real PostStatus", () => {
    const statuses: PostPlatformStatus[] = [
      "pending",
      "processing",
      "success",
      "failed",
    ];
    for (const scheduled of [true, false]) {
      for (const a of statuses) {
        for (const b of statuses) {
          const result = derivePostStatus([a, b], { scheduled });
          assert.equal(isPostStatus(result), true, `${a}+${b} -> ${result}`);
        }
      }
    }
  });
});

describe("terminal and in-flight classification", () => {
  const terminal: PostStatus[] = [
    "published",
    "partial_failure",
    "failed",
    "cancelled",
  ];
  const inFlight: PostStatus[] = ["processing", "scheduled"];
  const neither: PostStatus[] = ["draft"];

  test("terminal statuses", () => {
    for (const status of terminal) {
      assert.equal(isTerminalPostStatus(status), true, status);
      assert.equal(isInFlightPostStatus(status), false, status);
    }
  });

  test("in-flight statuses", () => {
    for (const status of inFlight) {
      assert.equal(isInFlightPostStatus(status), true, status);
      assert.equal(isTerminalPostStatus(status), false, status);
    }
  });

  test("a draft is neither terminal nor in flight", () => {
    for (const status of neither) {
      assert.equal(isTerminalPostStatus(status), false, status);
      assert.equal(isInFlightPostStatus(status), false, status);
    }
  });

  test("every PostStatus is classified exactly once", () => {
    for (const status of Object.keys(POST_STATUS_META) as PostStatus[]) {
      assert.equal(
        isTerminalPostStatus(status) !== isInFlightPostStatus(status) ||
          neither.includes(status),
        true,
        `${status} must be terminal, in flight, or explicitly neither`,
      );
    }
  });
});

describe("isPostStatus", () => {
  test("accepts the seven stored values", () => {
    for (const status of Object.keys(POST_STATUS_META)) {
      assert.equal(isPostStatus(status), true);
    }
  });

  test("rejects anything else", () => {
    assert.equal(isPostStatus("nonsense"), false);
    assert.equal(isPostStatus(""), false);
    assert.equal(isPostStatus(null), false);
    assert.equal(isPostStatus(undefined), false);
    assert.equal(isPostStatus(42), false);
    assert.equal(isPostStatus("Success"), false);
  });
});

describe("status copy contract (Design.md section 5)", () => {
  test("POST_STATUS_META", () => {
    assert.deepEqual(Object.keys(POST_STATUS_META), [
      "draft",
      "scheduled",
      "processing",
      "published",
      "partial_failure",
      "failed",
      "cancelled",
    ]);
    assertCopy(POST_STATUS_META.draft, "Draft");
    assertCopy(POST_STATUS_META.scheduled, "Scheduled");
    assertCopy(POST_STATUS_META.processing, "Processing");
    assertCopy(POST_STATUS_META.published, "Published");
    assertCopy(POST_STATUS_META.partial_failure, "Partial failure");
    assertCopy(POST_STATUS_META.failed, "Failed");
    assertCopy(POST_STATUS_META.cancelled, "Cancelled");

    assert.equal(POST_STATUS_META.draft.tone, "neutral");
    assert.equal(POST_STATUS_META.scheduled.tone, "info");
    assert.equal(POST_STATUS_META.processing.tone, "info");
    assert.equal(POST_STATUS_META.published.tone, "success");
    assert.equal(POST_STATUS_META.partial_failure.tone, "warning");
    assert.equal(POST_STATUS_META.failed.tone, "danger");
    assert.equal(POST_STATUS_META.cancelled.tone, "neutral");
  });

  test("PLATFORM_STATUS_META", () => {
    assert.deepEqual(Object.keys(PLATFORM_STATUS_META), [
      "pending",
      "processing",
      "success",
      "failed",
    ]);
    assertCopy(PLATFORM_STATUS_META.pending, "Pending");
    assertCopy(PLATFORM_STATUS_META.processing, "Processing");
    assertCopy(PLATFORM_STATUS_META.success, "Success");
    assertCopy(PLATFORM_STATUS_META.failed, "Failed");

    assert.equal(PLATFORM_STATUS_META.pending.tone, "neutral");
    assert.equal(PLATFORM_STATUS_META.processing.tone, "info");
    assert.equal(PLATFORM_STATUS_META.success.tone, "success");
    assert.equal(PLATFORM_STATUS_META.failed.tone, "danger");
  });

  test("ACCOUNT_STATUS_META", () => {
    assert.deepEqual(Object.keys(ACCOUNT_STATUS_META), [
      "active",
      "needs_reconnect",
      "disconnected",
    ]);
    assertCopy(ACCOUNT_STATUS_META.active, "Connected");
    assertCopy(ACCOUNT_STATUS_META.needs_reconnect, "Needs reconnect");
    assertCopy(ACCOUNT_STATUS_META.disconnected, "Not connected");

    assert.equal(ACCOUNT_STATUS_META.active.tone, "success");
    assert.equal(ACCOUNT_STATUS_META.needs_reconnect.tone, "warning");
    assert.equal(ACCOUNT_STATUS_META.disconnected.tone, "neutral");
  });

  test("EXECUTION_STATUS_META", () => {
    assert.deepEqual(Object.keys(EXECUTION_STATUS_META), [
      "accepted",
      "processing",
      "published",
      "failed",
    ]);
    assertCopy(EXECUTION_STATUS_META.accepted, "Accepted");
    assertCopy(EXECUTION_STATUS_META.processing, "Processing");
    assertCopy(EXECUTION_STATUS_META.published, "Published");
    assertCopy(EXECUTION_STATUS_META.failed, "Failed");

    assert.equal(EXECUTION_STATUS_META.accepted.tone, "neutral");
    assert.equal(EXECUTION_STATUS_META.processing.tone, "info");
    assert.equal(EXECUTION_STATUS_META.published.tone, "success");
    assert.equal(EXECUTION_STATUS_META.failed.tone, "danger");
  });

  test("PLATFORM_META", () => {
    assert.deepEqual(Object.keys(PLATFORM_META), [
      "instagram",
      "facebook",
      "tiktok",
    ]);
    assertCopy(PLATFORM_META.instagram, "Instagram");
    assertCopy(PLATFORM_META.facebook, "Facebook");
    assertCopy(PLATFORM_META.tiktok, "TikTok");

    // Platform badges are always neutral: identity comes from icon + name.
    for (const platform of PLATFORMS) {
      assert.equal(PLATFORM_META[platform].tone, "neutral");
      assert.ok(PLATFORM_FALLBACK_ICON[platform]);
    }
  });

  test("platformLabel resolves known platforms and passes through unknown ones", () => {
    assert.equal(platformLabel("instagram"), "Instagram");
    assert.equal(platformLabel("facebook"), "Facebook");
    assert.equal(platformLabel("tiktok"), "TikTok");
    assert.equal(platformLabel("threads"), "threads");
  });

  test("PLATFORMS order is Instagram, Facebook, TikTok", () => {
    assert.deepEqual([...PLATFORMS], ["instagram", "facebook", "tiktok"]);
  });
});
