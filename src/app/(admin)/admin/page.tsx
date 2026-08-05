import type { Metadata } from "next";
import { Building2, Users, CreditCard } from "lucide-react";
import { getPlatformStats } from "@/repositories/admin.repository";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const metadata: Metadata = { title: "Visão geral · Admin" };

export default async function AdminOverviewPage() {
  const stats = await getPlatformStats();

  const cards = [
    { label: "Empresas", value: stats.tenantCount, icon: Building2 },
    { label: "Usuários", value: stats.userCount, icon: Users },
    { label: "Assinaturas ativas", value: stats.activeSubscriptions, icon: CreditCard },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Visão geral da plataforma</h1>
        <p className="text-muted-foreground">Métricas globais, fora do contexto de qualquer empresa.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription>{card.label}</CardDescription>
              <card.icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardTitle className="px-6 pb-6 text-2xl">{card.value}</CardTitle>
          </Card>
        ))}
      </div>
    </div>
  );
}
