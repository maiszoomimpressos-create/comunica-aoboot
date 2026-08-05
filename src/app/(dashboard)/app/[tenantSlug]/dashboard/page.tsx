import type { Metadata } from "next";
import { Users, CreditCard, LayoutGrid } from "lucide-react";
import { getRequestContext } from "@/lib/server/request-context";
import { prisma } from "@/lib/db/prisma";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const ctx = await getRequestContext(tenantSlug);

  const [organization, memberCount, subscription, installedModuleCount] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: ctx.tenantId } }),
    prisma.member.count({ where: { organizationId: ctx.tenantId } }),
    prisma.subscription.findUnique({
      where: { tenantId: ctx.tenantId },
      include: { plan: true },
    }),
    prisma.tenantModule.count({
      where: { tenantId: ctx.tenantId, status: "INSTALLED" },
    }),
  ]);

  const stats = [
    {
      label: "Usuários",
      value: memberCount,
      icon: Users,
    },
    {
      label: "Plano atual",
      value: subscription?.plan.name ?? "—",
      icon: CreditCard,
    },
    {
      label: "Módulos instalados",
      value: installedModuleCount,
      icon: LayoutGrid,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Olá, bem-vindo(a) à {organization.name}
        </h1>
        <p className="text-muted-foreground">
          Visão geral da sua empresa nesta plataforma.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription>{stat.label}</CardDescription>
              <stat.icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardTitle className="px-6 pb-6 text-2xl">{stat.value}</CardTitle>
          </Card>
        ))}
      </div>
    </div>
  );
}
