import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { hasAllPermissions, hasAnyPermission, hasPermission, ROLE_PERMISSIONS } from "@/lib/auth/permissions";

describe("workspace permission matrix", () => {
  test("owner has every declared permission", () => {
    assert.equal(ROLE_PERMISSIONS.owner.size, 48);
    assert.equal(hasAllPermissions("owner", [...ROLE_PERMISSIONS.owner]), true);
  });

  test("admin can operate publishing resources and manage limited members", () => {
    assert.equal(hasPermission("admin", "posts:publish"), true);
    assert.equal(hasPermission("admin", "accounts:manage"), true);
    assert.equal(hasPermission("admin", "workspace:manage"), false);
    assert.equal(hasPermission("admin", "members:manage"), false);
    assert.equal(hasAllPermissions("admin", ["members:view", "members:invite", "members:update", "members:remove"]), true);
  });

  test("editor is productive without publishing or account management", () => {
    assert.equal(hasAllPermissions("editor", ["posts:create", "drafts:update", "templates:use", "media:create"]), true);
    assert.equal(hasAnyPermission("editor", ["posts:publish", "posts:schedule", "accounts:connect"]), false);
  });

  test("viewer is read-only", () => {
    assert.equal(hasPermission("viewer", "posts:view"), true);
    assert.equal(hasPermission("viewer", "analytics:view"), true);
    assert.equal(hasAnyPermission("viewer", ["posts:create", "media:create", "templates:delete"]), false);
    assert.equal(hasPermission("viewer", "members:view"), true);
  });
});
