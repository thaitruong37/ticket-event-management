import "server-only";

import { requireSession, type AuthenticatedSession } from "./auth";
import type { MembershipRole } from "../db/schema";

export class AuthorizationError extends Error {
  readonly status = 403;
  readonly code = "FORBIDDEN";

  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export type Permission =
  | "workspace:manage"
  | "members:read"
  | "members:manage"
  | "catalog:read"
  | "catalog:write"
  | "inventory:read"
  | "inventory:write"
  | "orders:read"
  | "orders:write"
  | "payments:read"
  | "payments:write"
  | "deliveries:read"
  | "deliveries:write"
  | "cases:read"
  | "cases:write"
  | "audit:read";

const permissionsByRole: Record<MembershipRole, ReadonlySet<Permission>> = {
  owner: new Set<Permission>([
    "workspace:manage",
    "members:read",
    "members:manage",
    "catalog:read",
    "catalog:write",
    "inventory:read",
    "inventory:write",
    "orders:read",
    "orders:write",
    "payments:read",
    "payments:write",
    "deliveries:read",
    "deliveries:write",
    "cases:read",
    "cases:write",
    "audit:read",
  ]),
  operations: new Set<Permission>([
    "catalog:read",
    "catalog:write",
    "inventory:read",
    "inventory:write",
    "orders:read",
    "orders:write",
    "payments:read",
    "deliveries:read",
    "deliveries:write",
    "cases:read",
    "cases:write",
  ]),
  finance: new Set<Permission>([
    "catalog:read",
    "inventory:read",
    "orders:read",
    "payments:read",
    "payments:write",
    "deliveries:read",
    "cases:read",
    "cases:write",
    "audit:read",
  ]),
  viewer: new Set<Permission>([
    "catalog:read",
    "inventory:read",
    "orders:read",
    "payments:read",
    "deliveries:read",
    "cases:read",
  ]),
};

export function hasPermission(role: MembershipRole, permission: Permission): boolean {
  return permissionsByRole[role].has(permission);
}

export function assertPermission(session: AuthenticatedSession, permission: Permission): void {
  if (!hasPermission(session.role, permission)) throw new AuthorizationError();
}

export async function requirePermission(permission: Permission): Promise<AuthenticatedSession> {
  const session = await requireSession();
  assertPermission(session, permission);
  return session;
}

export function assertRole(session: AuthenticatedSession, allowed: readonly MembershipRole[]): void {
  if (!allowed.includes(session.role)) throw new AuthorizationError();
}

export async function requireRole(...allowed: MembershipRole[]): Promise<AuthenticatedSession> {
  const session = await requireSession();
  assertRole(session, allowed);
  return session;
}

export function assertWorkspaceScope(session: AuthenticatedSession, workspaceId: string): void {
  if (session.workspaceId !== workspaceId) throw new AuthorizationError("Workspace access denied.");
}
