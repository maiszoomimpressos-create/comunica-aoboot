import { prisma } from "@/lib/db/prisma";
import { ConflictError, NotFoundError } from "@/lib/server/errors";

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

/** Apaga a empresa e tudo em cascata (conexões, campanhas, contatos,
 * papéis, membros, etc. — ver `onDelete: Cascade` em cada relação de
 * Organization no schema.prisma). Irreversível, por isso só é permitido a
 * partir do status CANCELED: força o admin a passar pelo "Cancelar" antes,
 * em vez de apagar uma empresa ainda ativa num clique só. */
export async function deleteTenant(tenantId: string) {
  const tenant = await prisma.organization.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new NotFoundError("Empresa não encontrada.");
  if (tenant.status !== "CANCELED") {
    throw new ConflictError("Cancele a empresa antes de excluí-la definitivamente.");
  }
  await prisma.organization.delete({ where: { id: tenantId } });
}

export async function listAllUsers() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { members: true } } },
  });
  return users;
}
