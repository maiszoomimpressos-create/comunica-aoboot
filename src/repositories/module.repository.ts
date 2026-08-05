import { prisma } from "@/lib/db/prisma";

export interface ModuleWithTenantStatus {
  id: string;
  key: string;
  name: string;
  description: string;
  category: string;
  isComingSoon: boolean;
  status: "NOT_INSTALLED" | "INSTALLED" | "COMING_SOON";
}

export async function listModulesWithTenantStatus(
  tenantId: string
): Promise<ModuleWithTenantStatus[]> {
  const modules = await prisma.module.findMany({
    orderBy: { sortOrder: "asc" },
    include: { tenantModules: { where: { tenantId } } },
  });

  return modules.map((m) => ({
    id: m.id,
    key: m.key,
    name: m.name,
    description: m.description,
    category: m.category,
    isComingSoon: m.isComingSoon,
    status: m.isComingSoon ? "COMING_SOON" : m.tenantModules[0]?.status ?? "NOT_INSTALLED",
  }));
}

// --- Platform admin (cross-tenant) ---------------------------------------

export function adminListModules() {
  return prisma.module.findMany({ orderBy: { sortOrder: "asc" } });
}

export interface UpsertModuleInput {
  key: string;
  name: string;
  description: string;
  category: string;
  isComingSoon: boolean;
  sortOrder: number;
}

export function adminCreateModule(data: UpsertModuleInput) {
  return prisma.module.create({ data });
}

export function adminUpdateModule(moduleId: string, data: Partial<UpsertModuleInput>) {
  return prisma.module.update({ where: { id: moduleId }, data });
}

export async function setModuleInstalled(tenantId: string, moduleId: string, installed: boolean) {
  return prisma.tenantModule.upsert({
    where: { tenantId_moduleId: { tenantId, moduleId } },
    create: {
      tenantId,
      moduleId,
      status: installed ? "INSTALLED" : "NOT_INSTALLED",
      installedAt: installed ? new Date() : null,
    },
    update: {
      status: installed ? "INSTALLED" : "NOT_INSTALLED",
      installedAt: installed ? new Date() : null,
    },
  });
}
