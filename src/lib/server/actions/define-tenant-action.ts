import { unstable_rethrow } from "next/navigation";
import { getRequestContext } from "@/lib/server/request-context";
import { withTenantContext, type TenantContext } from "@/lib/server/tenant-context";
import { requirePermission } from "@/lib/rbac/require-permission";
import { toErrorPayload } from "@/lib/server/errors";
import { actionOk, actionFail, type ActionResult } from "@/types/action";
import type { PermissionCode } from "@/lib/rbac/permissions";

/**
 * Wraps a Server Action for the `/app/[tenantSlug]/**` area: resolves +
 * validates the tenant context for `tenantSlug` (redirecting away if the
 * caller isn't a member — see getRequestContext), optionally requires a
 * specific Permission, then runs the handler with that context established
 * for the whole call (so tenant-scoped Prisma queries downstream are
 * automatically filtered — see lib/db/tenant-scoped-client.ts).
 *
 * `tenantSlug` is always the first argument: Server Actions can't read the
 * route's dynamic segment on their own, so callers bind/pass it explicitly
 * (e.g. `inviteUser.bind(null, tenantSlug)` or just `inviteUser(tenantSlug, input)`).
 */
export function defineTenantAction<TInput, TOutput>(
  permission: PermissionCode | null,
  handler: (ctx: TenantContext, input: TInput) => Promise<TOutput>
) {
  return async (tenantSlug: string, input: TInput): Promise<ActionResult<TOutput>> => {
    try {
      const ctx = await getRequestContext(tenantSlug);
      if (permission) requirePermission(ctx, permission);
      const data = await withTenantContext(ctx, () => handler(ctx, input));
      return actionOk(data);
    } catch (err) {
      unstable_rethrow(err);
      return actionFail(toErrorPayload(err));
    }
  };
}
