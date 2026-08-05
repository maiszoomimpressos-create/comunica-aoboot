import { prisma } from "@/lib/db/prisma";
import type { PermissionCode } from "@/lib/rbac/permissions";

export interface TenantRole {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
  permissions: PermissionCode[];
}

export async function listRolesWithPermissions(tenantId: string): Promise<TenantRole[]> {
  const roles = await prisma.role.findMany({
    where: { tenantId },
    include: { rolePermissions: { include: { permission: true } } },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });
  return roles.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    isSystem: r.isSystem,
    permissions: r.rolePermissions.map((rp) => rp.permission.code as PermissionCode),
  }));
}

export async function createRole(params: {
  tenantId: string;
  key: string;
  name: string;
  permissionCodes: PermissionCode[];
}) {
  const permissions = await prisma.permission.findMany({
    where: { code: { in: params.permissionCodes } },
  });
  return prisma.role.create({
    data: {
      tenantId: params.tenantId,
      key: params.key,
      name: params.name,
      isSystem: false,
      rolePermissions: {
        create: permissions.map((p) => ({ permissionId: p.id })),
      },
    },
  });
}

export async function updateRolePermissions(
  tenantId: string,
  roleId: string,
  permissionCodes: PermissionCode[]
) {
  const role = await prisma.role.findFirst({ where: { id: roleId, tenantId } });
  if (!role) return null;

  const permissions = await prisma.permission.findMany({
    where: { code: { in: permissionCodes } },
  });

  return prisma.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId } });
    await tx.role.update({
      where: { id: roleId },
      data: {
        rolePermissions: { create: permissions.map((p) => ({ permissionId: p.id })) },
      },
    });
  });
}

export async function renameRole(tenantId: string, roleId: string, name: string) {
  return prisma.role.updateMany({ where: { id: roleId, tenantId, isSystem: false }, data: { name } });
}

export async function deleteRole(tenantId: string, roleId: string) {
  const role = await prisma.role.findFirst({ where: { id: roleId, tenantId } });
  if (!role || role.isSystem) return null;

  const membersUsingRole = await prisma.member.count({
    where: { organizationId: tenantId, role: role.key },
  });
  if (membersUsingRole > 0) {
    throw new Error("ROLE_IN_USE");
  }
  return prisma.role.delete({ where: { id: roleId } });
}
