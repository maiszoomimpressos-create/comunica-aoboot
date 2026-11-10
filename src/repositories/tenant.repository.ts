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

/** Exclusão self-service pelo próprio Owner, de dentro do painel normal —
 * sem exigir o status CANCELED que o fluxo do admin exige (ver deleteTenant
 * em admin.repository.ts), porque um tenant comum não tem como mudar o
 * próprio status (setTenantStatus é admin-only). A única salvaguarda aqui é
 * a checagem de papel ("owner") + confirmação de slug feitas na action (ver
 * actions/tenant/delete-tenant.ts) antes de chamar isto. Cascata idêntica —
 * mesmas relações `onDelete: Cascade` do schema. */
export async function deleteTenantAsOwner(tenantId: string) {
  await prisma.organization.delete({ where: { id: tenantId } });
}
