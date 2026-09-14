import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { historyQuerySchema } from "@/lib/validation/schemas";

describe("historyQuerySchema", () => {
  test("applies safe defaults", () => {
    const result = historyQuerySchema.parse({});

    assert.deepEqual(result, {
      page: 1,
      pageSize: 20,
      sort: "newest",
    });
  });

  test("accepts supported filters", () => {
    const result = historyQuerySchema.safeParse({
      page: "2",
      pageSize: "50",
      status: "partial_failure",
      platform: "instagram",
      accountId: "00000000-0000-0000-0000-000000000001",
      from: "2026-09-01",
      to: "2026-09-13",
      search: "launch",
      sort: "published",
    });

    assert.equal(result.success, true);
  });

  test("rejects unsafe pagination and invalid date ranges", () => {
    const result = historyQuerySchema.safeParse({
      page: "-1",
      pageSize: "999999",
      from: "2026-09-13",
      to: "2026-09-01",
    });

    assert.equal(result.success, false);
  });
});
