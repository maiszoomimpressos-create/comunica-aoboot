import { prisma } from "@/lib/db/prisma";

export interface UserMembership {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  roleKey: string;
}

export async function listMembershipsForUser(userId: string): Promise<UserMembership[]> {
  const memberships = await prisma.member.findMany({
    where: { userId },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  });

  return memberships.map((m) => ({
    tenantId: m.organizationId,
    tenantSlug: m.organization.slug,
    tenantName: m.organization.name,
    roleKey: m.role,
  }));
}

export interface TenantMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  image: string | null;
  roleKey: string;
  createdAt: Date;
}

export async function listMembersForTenant(tenantId: string): Promise<TenantMember[]> {
  const members = await prisma.member.findMany({
    where: { organizationId: tenantId },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
  return members.map((m) => ({
    id: m.id,
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
    image: m.user.image,
    roleKey: m.role,
    createdAt: m.createdAt,
  }));
}

export async function countOwners(tenantId: string): Promise<number> {
  return prisma.member.count({ where: { organizationId: tenantId, role: "owner" } });
}

export async function getMemberById(tenantId: string, memberId: string) {
  return prisma.member.findFirst({ where: { id: memberId, organizationId: tenantId } });
}

export function removeMember(tenantId: string, memberId: string) {
  return prisma.member.deleteMany({ where: { id: memberId, organizationId: tenantId } });
}

export function updateMemberRole(tenantId: string, memberId: string, roleKey: string) {
  return prisma.member.updateMany({
    where: { id: memberId, organizationId: tenantId },
    data: { role: roleKey },
  });
}
