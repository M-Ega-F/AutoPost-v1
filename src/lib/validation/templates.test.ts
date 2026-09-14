import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { templateSchema, templateUpdateSchema } from "./schemas";

describe("template validation", () => {
  test("accepts optional caption and platforms", () => {
    const parsed = templateSchema.parse({ name: "Launch", caption: "Hello", platforms: ["instagram"] });
    assert.equal(parsed.name, "Launch");
    assert.deepEqual(parsed.platforms, ["instagram"]);
  });

  test("requires a name and rejects duplicate platforms", () => {
    assert.equal(templateSchema.safeParse({ caption: "Hello" }).success, false);
    assert.equal(templateSchema.safeParse({ name: "Launch", platforms: ["instagram", "instagram"] }).success, false);
  });

  test("allows partial updates", () => {
    const parsed = templateUpdateSchema.parse({ name: "Renamed" });
    assert.deepEqual(parsed, { name: "Renamed" });
  });
});
