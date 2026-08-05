import { createApiHandler } from "@/lib/api/v1/handler";
import { getTenantById } from "@/repositories/tenant.repository";

/**
 * Second /api/v1 route — validates the full createApiHandler path
 * (tenant resolution via ?tenantSlug=/X-Tenant-Slug + permission gate).
 */
export const GET = createApiHandler({
  requiredPermission: "tenant.view",
  handler: async ({ ctx }) => {
    const tenant = await getTenantById(ctx!.tenantId);
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
    };
  },
});
