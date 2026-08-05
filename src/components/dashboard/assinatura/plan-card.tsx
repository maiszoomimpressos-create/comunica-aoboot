"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { changePlanAction } from "@/actions/tenant/change-plan";

function formatPrice(cents: number) {
  if (cents === 0) return "Grátis";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export function PlanCard({
  tenantSlug,
  plan,
  isCurrent,
  canManage,
}: {
  tenantSlug: string;
  plan: { id: string; name: string; priceCents: number; features: unknown };
  isCurrent: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const features = plan.features as Record<string, unknown>;

  async function handleChange() {
    setLoading(true);
    await changePlanAction(tenantSlug, { planId: plan.id });
    setLoading(false);
    router.refresh();
  }

  return (
    <Card className={cn("p-6", isCurrent && "border-primary")}>
      <h3 className="font-medium">{plan.name}</h3>
      <p className="mt-2 text-2xl font-semibold">
        {formatPrice(plan.priceCents)}
        {plan.priceCents > 0 && <span className="text-sm font-normal text-muted-foreground">/mês</span>}
      </p>
      <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
        <li className="flex items-center gap-2">
          <Check className="size-4 text-primary" />
          {features.users ? `Até ${features.users} usuários` : "Usuários ilimitados"}
        </li>
        <li className="flex items-center gap-2">
          <Check className="size-4 text-primary" />
          {features.modules ? `${features.modules} módulos inclusos` : "Módulos ilimitados"}
        </li>
      </ul>

      <div className="mt-6">
        {isCurrent ? (
          <Button variant="outline" disabled className="w-full">
            Plano atual
          </Button>
        ) : (
          canManage && (
            <Button onClick={handleChange} disabled={loading} className="w-full">
              {loading ? "Alterando…" : "Selecionar"}
            </Button>
          )
        )}
      </div>
    </Card>
  );
}
