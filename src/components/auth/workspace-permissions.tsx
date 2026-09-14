"use client";

import { createContext, useContext } from "react";

import { hasPermission, type Permission, type WorkspaceRole } from "@/lib/auth/permissions";

const WorkspacePermissionContext = createContext<WorkspaceRole>("viewer");

export function WorkspacePermissionProvider({ role, children }: { role: WorkspaceRole; children: React.ReactNode }) {
  return <WorkspacePermissionContext.Provider value={role}>{children}</WorkspacePermissionContext.Provider>;
}

export function useWorkspaceRole(): WorkspaceRole {
  return useContext(WorkspacePermissionContext);
}

export function useWorkspacePermission(permission: Permission): boolean {
  return hasPermission(useWorkspaceRole(), permission);
}

export function PermissionGate({ permission, children }: { permission: Permission; children: React.ReactNode }) {
  return useWorkspacePermission(permission) ? children : null;
}
