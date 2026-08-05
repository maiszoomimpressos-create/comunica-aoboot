import { prisma } from "@/lib/db/prisma";

export async function getPlatformStats() {
  const [tenantCount, userCount, activeSubscriptions] = await Promise.all([
    prisma.organization.count(),
    prisma.user.count(),
    prisma.subscription.count({ where: { status: "ACTIVE" } }),
  ]);
  return { tenantCount, userCount, activeSubscriptions };
}

export async function listAllTenants() {
  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { members: true } },
      subscription: { include: { plan: true } },
    },
  });
  return orgs;
}

export async function getTenantDetail(tenantId: string) {
  return prisma.organization.findUnique({
    where: { id: tenantId },
    include: {
      members: { include: { user: true } },
      subscription: { include: { plan: true } },
      tenantModules: { include: { module: true } },
    },
  });
}

export function setTenantStatus(tenantId: string, status: "ACTIVE" | "SUSPENDED" | "CANCELED") {
  return prisma.organization.update({ where: { id: tenantId }, data: { status } });
}

export async function listAllUsers() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { members: true } } },
  });
  return users;
}
