import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";

export function getSubscriptionForTenant(tenantId: string) {
  return prisma.subscription.findUnique({
    where: { tenantId },
    include: { plan: true },
  });
}

export function listActivePlans() {
  return prisma.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
}

// --- Platform admin (cross-tenant) ---------------------------------------

export function adminListAllPlans() {
  return prisma.plan.findMany({ orderBy: { sortOrder: "asc" } });
}

export interface UpsertPlanInput {
  name: string;
  slug: string;
  priceCents: number;
  interval: "MONTHLY" | "YEARLY";
  features: Prisma.InputJsonValue;
  isActive: boolean;
  sortOrder: number;
}

export function adminCreatePlan(data: UpsertPlanInput) {
  return prisma.plan.create({ data });
}

export function adminUpdatePlan(planId: string, data: Partial<UpsertPlanInput>) {
  return prisma.plan.update({ where: { id: planId }, data });
}

export async function changePlan(tenantId: string, planId: string) {
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return prisma.subscription.update({
    where: { tenantId },
    data: {
      planId,
      status: "ACTIVE",
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
    },
  });
}
