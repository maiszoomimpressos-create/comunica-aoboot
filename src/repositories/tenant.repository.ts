import { prisma } from "@/lib/db/prisma";

export function getTenantById(tenantId: string) {
  return prisma.organization.findUniqueOrThrow({ where: { id: tenantId } });
}

export interface UpdateTenantInput {
  name?: string;
  primaryColor?: string | null;
  messageBusinessName?: string | null;
}

export function updateTenant(tenantId: string, data: UpdateTenantInput) {
  // Written directly against Prisma rather than `auth.api.updateOrganization`:
  // Better Auth's organization plugin has its own internal owner/admin-only
  // permission check on that endpoint, which would conflict with our own
  // (already-checked-by-the-caller) granular RBAC — a custom role granted
  // `tenant.update` in our tables might not be "owner"/"admin" in Better
  // Auth's eyes. Our RBAC is the single source of truth for authorization;
  // Better Auth's organization tables are just where the data lives.
  return prisma.organization.update({ where: { id: tenantId }, data });
}
