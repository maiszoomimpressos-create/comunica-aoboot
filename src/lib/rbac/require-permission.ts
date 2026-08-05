import { ForbiddenError } from "@/lib/server/errors";
import type { TenantContext } from "@/lib/server/tenant-context";
import type { PermissionCode } from "./permissions";

export function hasPermission(ctx: TenantContext, code: PermissionCode): boolean {
  return ctx.permissions.includes(code);
}

export function requirePermission(ctx: TenantContext, code: PermissionCode): void {
  if (!hasPermission(ctx, code)) {
    throw new ForbiddenError(`Permissão necessária: ${code}`);
  }
}
