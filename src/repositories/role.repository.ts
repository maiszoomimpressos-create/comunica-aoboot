import { prisma } from "@/lib/db/prisma";
import type { PermissionCode } from "@/lib/rbac/permissions";

export interface TenantRole {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
  permissions: PermissionCode[];
  connectionScopeEnabled: boolean;
  scopedConnectionIds: string[];
}

export async function listRolesWithPermissions(tenantId: string): Promise<TenantRole[]> {
  const roles = await prisma.role.findMany({
    where: { tenantId },
    include: {
      rolePermissions: { include: { permission: true } },
      connectionScopes: { select: { connectionId: true } },
    },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });
  return roles.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    isSystem: r.isSystem,
    permissions: r.rolePermissions.map((rp) => rp.permission.code as PermissionCode),
    connectionScopeEnabled: r.connectionScopeEnabled,
    scopedConnectionIds: r.connectionScopes.map((s) => s.connectionId),
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

/** Full-replace, same shape as updateRolePermissions: wipes the role's
 * current connection scope and recreates it from `connectionIds`, in one
 * transaction with flipping `connectionScopeEnabled`. See the comment on
 * Role.connectionScopeEnabled in schema.prisma for why `enabled` is a
 * separate flag instead of inferring "unrestricted" from an empty list. */
export async function updateRoleConnectionScope(
  tenantId: string,
  roleId: string,
  params: { enabled: boolean; connectionIds: string[] }
) {
  const role = await prisma.role.findFirst({ where: { id: roleId, tenantId } });
  if (!role) return null;

  return prisma.$transaction(async (tx) => {
    await tx.roleConnectionScope.deleteMany({ where: { roleId } });
    await tx.role.update({
      where: { id: roleId },
      data: {
        connectionScopeEnabled: params.enabled,
        connectionScopes: params.enabled
          ? { create: params.connectionIds.map((connectionId) => ({ connectionId })) }
          : undefined,
      },
    });
  });
}

/** Called right after a connection-scoped role's holder requests a brand
 * new ChannelConnection (see actions/segmentos/create-segmento.ts) — so
 * nobody loses access to what they just created. No-op for unrestricted
 * roles (connectionScopeEnabled false means "sees everything" already). */
export async function addConnectionToRoleScope(roleId: string, connectionId: string) {
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role?.connectionScopeEnabled) return;
  await prisma.roleConnectionScope.createMany({
    data: [{ roleId, connectionId }],
    skipDuplicates: true,
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
