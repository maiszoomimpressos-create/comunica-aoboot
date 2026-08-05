import { AsyncLocalStorage } from "node:async_hooks";
import type { PermissionCode } from "@/lib/rbac/permissions";

export interface TenantContext {
  userId: string;
  tenantId: string;
  tenantSlug: string;
  roleKey: string;
  permissions: PermissionCode[];
  isPlatformAdmin: boolean;
}

export const tenantALS = new AsyncLocalStorage<TenantContext>();

/** Returns the active tenant context, or `undefined` outside of one (e.g. platform-admin code paths, which are intentionally cross-tenant). */
export function getCurrentTenantContext(): TenantContext | undefined {
  return tenantALS.getStore();
}

/**
 * Establishes the tenant context for the *entire* async call graph inside
 * `fn`. AsyncLocalStorage only propagates reliably within a function you
 * invoke yourself — never rely on it "leaking" into React Server Components
 * rendered further down the tree. This is why every Server Action and Route
 * Handler wraps its whole body with this (see lib/server/actions/*), instead
 * of trying to set the context once in a layout.
 */
export function withTenantContext<T>(
  ctx: TenantContext,
  fn: () => Promise<T>
): Promise<T> {
  return tenantALS.run(ctx, fn);
}
