import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bot, Users2, Workflow, BookOpen, ChevronRight } from "lucide-react";
import { getRequestContext } from "@/lib/server/request-context";
import { requirePermission } from "@/lib/rbac/require-permission";
import { getConnectionSummary } from "@/repositories/channel-connection.repository";
import { getBotConfig } from "@/repositories/bot.repository";
import { listSetores } from "@/services/setor.service";
import { listFlows } from "@/services/flow.service";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Atendimento" };

/** Hub for everything related to how this connection attends customers —
 * AI attendant status (config itself still lives on the connection card,
 * see bot-attendant-section.tsx), Setores (handoff pools), and Fluxos
 * (visual flow builder). Base de Conhecimento (AI training) is planned but
 * not built yet — shown as "em breve" so the nav entry point exists ahead
 * of the feature itself. */
export default async function AtendimentoConnectionPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; connectionId: string }>;
}) {
  const { tenantSlug, connectionId } = await params;

  const ctx = await getRequestContext(tenantSlug);
  requirePermission(ctx, "whatsapp.view");

  const connection = await getConnectionSummary(ctx.tenantId, connectionId);
  if (!connection) notFound();

  const [botConfig, setores, flows] = await Promise.all([
    getBotConfig(connectionId),
    listSetores(connectionId),
    listFlows(connectionId),
  ]);
  const activeSetores = setores.filter((s) => s.active).length;
  const publishedFlow = flows.find((f) => f.status === "PUBLISHED");

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href={`/app/${tenantSlug}/modulos/whatsapp/atendimento`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Atendimento
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Atendimento</h1>
        <p className="text-muted-foreground">
          {connection.connectionName} · {connection.phoneNumber}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href={`/app/${tenantSlug}/modulos/whatsapp`}>
          <Card className="flex items-center gap-3 p-4 hover:bg-muted/50">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Bot className="size-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium">Atendente de IA</p>
              <p className="text-sm text-muted-foreground">
                {publishedFlow
                  ? "Desativado automaticamente — um fluxo está publicado"
                  : botConfig?.enabled
                    ? "Ativado"
                    : "Desativado"}
              </p>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Card>
        </Link>

        <Link href={`/app/${tenantSlug}/modulos/whatsapp/setores/${connectionId}`}>
          <Card className="flex items-center gap-3 p-4 hover:bg-muted/50">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Users2 className="size-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium">Setores</p>
              <p className="text-sm text-muted-foreground">
                {activeSetores} setor{activeSetores === 1 ? "" : "es"} ativo{activeSetores === 1 ? "" : "s"}
              </p>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Card>
        </Link>

        <Link href={`/app/${tenantSlug}/modulos/whatsapp/fluxos/${connectionId}`}>
          <Card className="flex items-center gap-3 p-4 hover:bg-muted/50">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Workflow className="size-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium">Fluxos</p>
              <p className="text-sm text-muted-foreground">
                {publishedFlow ? `Publicado: ${publishedFlow.name}` : `${flows.length} fluxo${flows.length === 1 ? "" : "s"}`}
              </p>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Card>
        </Link>

        <Card className="flex items-center gap-3 p-4 opacity-60">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
            <BookOpen className="size-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium">Base de Conhecimento</p>
            <p className="text-sm text-muted-foreground">Em breve — treine o atendente de IA</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
