import Link from "next/link";
import { Check } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatPrice(cents: number) {
  if (cents === 0) return "Grátis";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100
  );
}

export async function PricingTeaser() {
  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  return (
    <section id="precos" className="mx-auto max-w-6xl px-6 py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-semibold tracking-tight">Planos para cada fase</h2>
        <p className="mt-4 text-muted-foreground">
          Comece grátis. Faça upgrade quando sua operação crescer.
        </p>
      </div>

      <div className="mt-14 grid gap-6 sm:grid-cols-3">
        {plans.map((plan, index) => {
          const features = plan.features as Record<string, unknown>;
          const highlighted = index === 1;
          return (
            <div
              key={plan.id}
              className={cn(
                "flex flex-col rounded-xl border p-6",
                highlighted ? "border-primary bg-card shadow-lg shadow-primary/10" : "border-border bg-card"
              )}
            >
              <h3 className="font-medium">{plan.name}</h3>
              <p className="mt-2 text-3xl font-semibold">
                {formatPrice(plan.priceCents)}
                {plan.priceCents > 0 && (
                  <span className="text-sm font-normal text-muted-foreground">/mês</span>
                )}
              </p>
              <ul className="mt-6 flex-1 space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Check className="size-4 text-primary" />
                  {features.users ? `Até ${features.users} usuários` : "Usuários ilimitados"}
                </li>
                <li className="flex items-center gap-2">
                  <Check className="size-4 text-primary" />
                  {features.modules ? `${features.modules} módulos inclusos` : "Módulos ilimitados"}
                </li>
                <li className="flex items-center gap-2">
                  <Check className="size-4 text-primary" />
                  Suporte {features.support === "priority" ? "prioritário" : features.support === "email" ? "por e-mail" : "via comunidade"}
                </li>
              </ul>
              <Button
                className="mt-6"
                variant={highlighted ? "default" : "outline"}
                render={<Link href="/cadastro" />}
              >
                Começar
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
