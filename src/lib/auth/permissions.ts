export const WORKSPACE_ROLES = ["owner", "admin", "editor", "viewer"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];
export const INVITABLE_ROLES = ["admin", "editor", "viewer"] as const;
export type InvitableWorkspaceRole = (typeof INVITABLE_ROLES)[number];

export const PERMISSIONS = [
  "workspace:view", "workspace:manage", "workspace:update", "workspace:create", "workspace:delete", "workspace:transfer", "workspace:leave", "members:view", "members:manage", "members:invite", "members:update", "members:remove",
  "posts:view", "posts:create", "posts:update", "posts:delete", "posts:publish", "posts:schedule", "posts:cancel", "posts:retry", "posts:duplicate",
  "drafts:create", "drafts:update", "drafts:delete",
  "content:review",
  "accounts:view", "accounts:connect", "accounts:disconnect", "accounts:manage",
  "templates:view", "templates:create", "templates:update", "templates:delete", "templates:use",
  "media:view", "media:create", "media:delete",
  "analytics:view", "analytics:refresh", "settings:view", "settings:update",
  "webhooks:view", "webhooks:create", "webhooks:update", "webhooks:delete", "webhooks:test",
  "notifications:view", "notifications:update",
] as const;

export type Permission = (typeof PERMISSIONS)[number];
const allPermissions = new Set<Permission>(PERMISSIONS);

export const ROLE_PERMISSIONS: Readonly<Record<WorkspaceRole, ReadonlySet<Permission>>> = {
  owner: allPermissions,
  admin: new Set([
    "workspace:view", "workspace:update", "workspace:leave", "members:view", "members:invite", "members:update", "members:remove", "posts:view", "posts:create", "posts:update", "posts:delete", "posts:publish", "posts:schedule", "posts:cancel", "posts:retry", "posts:duplicate",
    "drafts:create", "drafts:update", "drafts:delete", "content:review", "accounts:view", "accounts:connect", "accounts:disconnect", "accounts:manage",
    "templates:view", "templates:create", "templates:update", "templates:delete", "templates:use", "media:view", "media:create", "media:delete",
    "analytics:view", "analytics:refresh", "settings:view", "settings:update",
    "notifications:view", "notifications:update", "webhooks:view", "webhooks:create", "webhooks:update", "webhooks:delete", "webhooks:test",
  ]),
  editor: new Set([
    "workspace:view", "workspace:create", "workspace:leave", "members:view", "posts:view", "posts:create", "posts:update", "posts:duplicate", "drafts:create", "drafts:update", "drafts:delete",
    "accounts:view", "templates:view", "templates:create", "templates:update", "templates:use", "media:view", "media:create", "analytics:view", "settings:view", "settings:update",
    "notifications:view", "notifications:update", "webhooks:view",
  ]),
  viewer: new Set(["workspace:view", "workspace:create", "workspace:leave", "members:view", "posts:view", "accounts:view", "templates:view", "media:view", "analytics:view", "settings:view", "notifications:view", "notifications:update", "webhooks:view"]),
};

export function hasPermission(role: WorkspaceRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export function hasAnyPermission(role: WorkspaceRole, permissions: readonly Permission[]): boolean {
  return permissions.some((permission) => hasPermission(role, permission));
}

export function hasAllPermissions(role: WorkspaceRole, permissions: readonly Permission[]): boolean {
  return permissions.every((permission) => hasPermission(role, permission));
}

/** Explicit hierarchy policy: admins cannot manage other admins, and owners are protected. */
export function canManageRole(actorRole: WorkspaceRole, targetRole: WorkspaceRole): boolean {
  if (targetRole === "owner") return false;
  if (actorRole === "owner") return true;
  if (actorRole === "admin") return targetRole === "editor" || targetRole === "viewer";
  return false;
}
