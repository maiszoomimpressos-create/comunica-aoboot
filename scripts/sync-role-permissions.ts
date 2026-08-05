// Backfills RolePermission rows for existing tenants' system roles whenever
// a new permission code is added to src/lib/rbac/permissions.ts.
//
// Why this exists: getRequestContext() reads a member's permissions from the
// *persisted* Role -> RolePermission rows (see lib/server/request-context.ts),
// not by recomputing DEFAULT_TENANT_ROLES live. Those rows are materialized
// once, at tenant-creation time (see services/onboarding.service.ts). So a
// brand-new permission code added to the catalog only reaches BRAND-NEW
// tenants automatically — every tenant created before that point is
// silently missing it until this script runs. Every future module that adds
// permission codes needs this same step; safe to re-run any time (only adds
// missing links, via `skipDuplicates`, never removes anything a tenant may
// have customized).
import "dotenv/config";
import { prisma } from "@/lib/db/prisma";
import { DEFAULT_TENANT_ROLES } from "@/lib/rbac/default-roles";

async function main() {
  const permissions = await prisma.permission.findMany();
  const permissionIdByCode = new Map(permissions.map((p) => [p.code, p.id]));

  let totalAdded = 0;

  for (const roleDef of DEFAULT_TENANT_ROLES) {
    const roles = await prisma.role.findMany({
      where: { key: roleDef.key, isSystem: true },
      include: { rolePermissions: true },
    });

    for (const role of roles) {
      const existingIds = new Set(role.rolePermissions.map((rp) => rp.permissionId));
      const missingIds = roleDef.permissions
        .map((code) => permissionIdByCode.get(code))
        .filter((id): id is string => typeof id === "string" && !existingIds.has(id));

      if (missingIds.length === 0) continue;

      await prisma.rolePermission.createMany({
        data: missingIds.map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      });
      totalAdded += missingIds.length;
      console.log(`Role "${role.key}" (tenant ${role.tenantId}): +${missingIds.length} permission(s)`);
    }
  }

  console.log(`Done. ${totalAdded} role-permission link(s) added across all tenants.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
