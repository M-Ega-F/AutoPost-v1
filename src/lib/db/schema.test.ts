import assert from "node:assert/strict";
import { test } from "node:test";

import { postMedia } from "@/lib/db/schema";

test("post_media duration uses a nullable double-precision column", () => {
  assert.equal(postMedia.duration.getSQLType(), "double precision");
  assert.equal(postMedia.duration.notNull, false);
  assert.equal(postMedia.duration.mapToDriverValue(20.4), 20.4);
  assert.equal(postMedia.duration.mapToDriverValue(20), 20);
  assert.equal(postMedia.duration.mapToDriverValue(null), null);
});
