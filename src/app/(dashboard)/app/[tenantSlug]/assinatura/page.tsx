import type { Metadata } from "next";
import { getRequestContext } from "@/lib/server/request-context";
import { requirePermission } from "@/lib/rbac/require-permission";
import { getSubscriptionForTenant, listActivePlans } from "@/repositories/subscription.repository";
import { Badge } from "@/components/ui/badge";
import { PlanCard } from "@/components/dashboard/assinatura/plan-card";

export const metadata: Metadata = { title: "Assinatura" };

const STATUS_LABEL: Record<string, string> = {
  TRIALING: "Em teste",
  ACTIVE: "Ativa",
  PAST_DUE: "Pagamento pendente",
  CANCELED: "Cancelada",
  EXPIRED: "Expirada",
};

export default async function AssinaturaPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const ctx = await getRequestContext(tenantSlug);
  requirePermission(ctx, "billing.view");

  const [subscription, plans] = await Promise.all([
    getSubscriptionForTenant(ctx.tenantId),
    listActivePlans(),
  ]);
  const canManage = ctx.permissions.includes("billing.manage");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Minha Assinatura</h1>
        <p className="text-muted-foreground">Gerencie o plano da sua empresa.</p>
      </div>

      {subscription && (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
          <div>
            <p className="text-sm text-muted-foreground">Plano atual</p>
            <p className="font-medium">{subscription.plan.name}</p>
          </div>
          <Badge variant={subscription.status === "ACTIVE" ? "default" : "secondary"}>
            {STATUS_LABEL[subscription.status] ?? subscription.status}
          </Badge>
          <div className="ml-auto text-sm text-muted-foreground">
            Renova em{" "}
            {new Intl.DateTimeFormat("pt-BR").format(new Date(subscription.currentPeriodEnd))}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            tenantSlug={tenantSlug}
            plan={plan}
            isCurrent={subscription?.planId === plan.id}
            canManage={canManage}
          />
        ))}
      </div>
    </div>
  );
}
