import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAnthropicSpendOverview } from "@/services/anthropic-spend.service";

export const metadata: Metadata = { title: "Gastos de IA · Admin" };

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

const tokenFormatter = new Intl.NumberFormat("pt-BR");

const DAY_OPTIONS = [7, 30, 90];

export default async function AdminIaPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { days: daysParam } = await searchParams;
  const days = DAY_OPTIONS.includes(Number(daysParam)) ? Number(daysParam) : 30;

  let overview: Awaited<ReturnType<typeof getAnthropicSpendOverview>> | null = null;
  let error: string | null = null;
  try {
    overview = await getAnthropicSpendOverview(days);
  } catch (err) {
    error = err instanceof Error ? err.message : "Erro desconhecido consultando a Anthropic.";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Gastos de IA</h1>
          <p className="text-muted-foreground">
            Todas as chaves de API da organização Anthropic — não só o que o MAIS ZAP gera.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {DAY_OPTIONS.map((d) => (
              <a
                key={d}
                href={`/admin/ia?days=${d}`}
                className={`rounded-md border border-border px-2.5 py-1 text-sm ${
                  d === days ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50"
                }`}
              >
                {d} dias
              </a>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            render={
              <a href="https://platform.claude.com/cost" target="_blank" rel="noopener noreferrer" />
            }
          >
            <ExternalLink className="size-4" />
            Ver saldo / adicionar no Console
          </Button>
        </div>
      </div>
      <p className="-mt-4 text-xs text-muted-foreground">
        A Anthropic não expõe o saldo restante por API — só dá pra ver no Console deles (botão acima).
        Aqui embaixo é só o que já foi gasto, não o que ainda resta.
      </p>

      {error && (
        <Card className="border-destructive/50 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      )}

      {overview && (
        <>
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription>Custo total — últimos {days} dias</CardDescription>
            </CardHeader>
            <CardTitle className="px-6 pb-6 text-2xl">{usdFormatter.format(overview.totalCostUsd)}</CardTitle>
          </Card>

          <div>
            <h2 className="mb-2 text-lg font-medium">Por workspace</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Workspace</TableHead>
                  <TableHead>Custo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.byWorkspace.map((w) => (
                  <TableRow key={w.id ?? "default"}>
                    <TableCell>
                      {w.name}
                      {w.isClaudeCodeWorkspace && (
                        <Badge variant="outline" className="ml-2">
                          Claude Code — não é o MAIS ZAP
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{usdFormatter.format(w.costUsd)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-medium">Por chave de API</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Chave</TableHead>
                  <TableHead>Workspace</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tokens entrada</TableHead>
                  <TableHead>Tokens saída</TableHead>
                  <TableHead>Modelos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.byApiKey.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell>
                      {k.name}
                      {k.isCurrentAppKey && (
                        <Badge className="ml-2">Usada pelo MAIS ZAP agora</Badge>
                      )}
                    </TableCell>
                    <TableCell>{k.workspaceName}</TableCell>
                    <TableCell>
                      {k.status === "active" ? (
                        <Badge variant="outline">Ativa</Badge>
                      ) : (
                        <Badge variant="secondary">Arquivada</Badge>
                      )}
                    </TableCell>
                    <TableCell>{tokenFormatter.format(k.inputTokens)}</TableCell>
                    <TableCell>{tokenFormatter.format(k.outputTokens)}</TableCell>
                    <TableCell>{k.models.join(", ") || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
