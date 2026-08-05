import { prisma } from "./prisma";
import { getCurrentTenantContext } from "@/lib/server/tenant-context";

/**
 * Prisma Client Extension: for the tenant-owned product tables (Role,
 * Subscription, TenantModule), automatically injects `tenantId` into every
 * query's `where`/`data` from the active AsyncLocalStorage context — so a
 * repository can't accidentally forget the filter and leak data across
 * tenants. This is defense in depth, not the only line of defense:
 * repositories still receive/pass `tenantId` explicitly wherever it reads
 * more clearly to do so.
 *
 * `AuditLog` is deliberately NOT included here — its `tenantId` is nullable
 * (null = a platform-level action), so repositories set it explicitly.
 *
 * Throws if used with no tenant context active (e.g. called outside
 * `withTenantContext` / `defineTenantAction`) rather than silently running
 * an unscoped query.
 */
function withTenantScope(modelLabel: string) {
  return async ({
    operation,
    args,
    query,
  }: {
    operation: string;
    args: Record<string, unknown>;
    query: (args: Record<string, unknown>) => Promise<unknown>;
  }) => {
    const ctx = getCurrentTenantContext();
    if (!ctx) {
      throw new Error(
        `[tenant-scoped-client] No tenant context active while querying "${modelLabel}". ` +
          `Wrap the caller in withTenantContext() (see lib/server/actions/define-tenant-action.ts).`
      );
    }
    const { tenantId } = ctx;

    switch (operation) {
      case "findMany":
      case "findFirst":
      case "findFirstOrThrow":
      case "count":
      case "aggregate":
      case "groupBy":
      case "updateMany":
      case "deleteMany":
        args.where = { ...(args.where as object | undefined), tenantId };
        break;
      case "findUnique":
      case "findUniqueOrThrow":
      case "update":
      case "delete":
        args.where = { ...(args.where as object | undefined), tenantId };
        break;
      case "create":
        args.data = { ...(args.data as object | undefined), tenantId };
        break;
      case "createMany":
        if (Array.isArray(args.data)) {
          args.data = (args.data as Record<string, unknown>[]).map((d) => ({
            ...d,
            tenantId,
          }));
        }
        break;
      case "upsert":
        args.where = { ...(args.where as object | undefined), tenantId };
        args.create = { ...(args.create as object | undefined), tenantId };
        break;
      default:
        break;
    }

    return query(args);
  };
}

export const tenantScopedPrisma = prisma.$extends({
  name: "tenant-scope",
  query: {
    role: { $allOperations: withTenantScope("Role") },
    subscription: { $allOperations: withTenantScope("Subscription") },
    tenantModule: { $allOperations: withTenantScope("TenantModule") },
  },
});
