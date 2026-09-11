import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle, QrCode, KeyRound, Code2, ArrowLeft } from "lucide-react";
import { getRequestContext } from "@/lib/server/request-context";
import { requirePermission } from "@/lib/rbac/require-permission";
import { getSubscriptionForTenant, listActivePlans } from "@/repositories/subscription.repository";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WhatsappApiDocs } from "@/components/dashboard/whatsapp/whatsapp-api-docs";

// Dedicated route for the WhatsApp integration card (takes priority over the
// generic `[provider]/page.tsx` placeholder). This is the "what am I
// contracting and how do I use it" page — sales pitch + full API docs +
// pricing, meant to be readable before the tenant ever connects anything.
// Actual connection management lives at /modulos/whatsapp.
export const metadata: Metadata = { title: "WhatsApp" };

function formatPrice(cents: number) {
  if (cents === 0) return "Grátis";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

const STEPS = [
  {
    icon: QrCode,
    title: "1. Conecte o WhatsApp da empresa",
    description: "Escaneie um QR code com o celular que vai enviar as mensagens. Leva menos de um minuto.",
  },
  {
    icon: KeyRound,
    title: "2. Gere sua chave de API",
    description: "Depois de conectado, gere uma chave — é ela que autoriza seu sistema a disparar mensagens por aqui.",
  },
  {
    icon: Code2,
    title: "3. Chame nossa API do seu sistema",
    description:
      "Sempre que algo acontecer (uma compra, um ingresso, um agendamento), seu sistema chama nossa API com essa chave e a gente envia a mensagem pro cliente.",
  },
];

export default async function WhatsappIntegrationPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const ctx = await getRequestContext(tenantSlug);
  requirePermission(ctx, "integrations.view");

  const [subscription, plans] = await Promise.all([
    getSubscriptionForTenant(ctx.tenantId),
    listActivePlans(),
  ]);
  // Cheapest active plan drives the "a partir de" price shown here — this
  // page isn't plan-specific, it just needs to show a real, current value
  // instead of a hardcoded one that drifts from what /admin/planos has.
  const cheapestPlan = plans.length > 0 ? plans.reduce((a, b) => (a.priceCents <= b.priceCents ? a : b)) : null;
  const alreadySubscribed = !!subscription && subscription.status === "ACTIVE";

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href={`/app/${tenantSlug}/integracoes`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Integrações
      </Link>

      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
          <MessageCircle className="size-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">WhatsApp</h1>
          <p className="text-muted-foreground">Confirmação automática de ações via WhatsApp.</p>
        </div>
      </div>

      <Card className="p-6">
        <h2 className="font-medium">O que é</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Avise seus clientes por WhatsApp assim que algo acontecer no seu sistema — compra
          aprovada, ingresso emitido, comprovante de estacionamento, agendamento confirmado, entre
          outros. Seu site ou sistema chama nossa API com um resumo do que aconteceu; a gente
          escreve e envia a mensagem certa pelo WhatsApp da sua empresa.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.title} className="rounded-lg border border-border bg-muted/40 p-4">
              <step.icon className="size-5 text-primary" />
              <p className="mt-2 text-sm font-medium">{step.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-medium">Como implementar no seu sistema</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Referência completa da chamada — o formato não muda entre planos, só o que já vier
          liberado na sua conexão.
        </p>
        <div className="mt-4">
          <WhatsappApiDocs />
        </div>
      </Card>

      <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <h2 className="font-medium">
            {alreadySubscribed ? "Você já tem acesso" : "Pronto pra contratar?"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {alreadySubscribed ? (
              <>Sua assinatura ({subscription!.plan.name}) já dá acesso a este módulo.</>
            ) : cheapestPlan ? (
              <>
                A partir de{" "}
                <span className="font-medium text-foreground">
                  {formatPrice(cheapestPlan.priceCents)}
                  {cheapestPlan.priceCents > 0 && "/mês"}
                </span>{" "}
                no plano {cheapestPlan.name}.
              </>
            ) : (
              "Fale com a gente pra ver os planos disponíveis."
            )}
          </p>
        </div>
        <Button nativeButton={false} render={<Link href={`/app/${tenantSlug}/assinatura`} />}>
          {alreadySubscribed ? "Ver assinatura" : "Assinar agora"}
        </Button>
      </Card>
    </div>
  );
}
