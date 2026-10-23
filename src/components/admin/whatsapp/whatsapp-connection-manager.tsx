"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RevealableInput } from "@/components/ui/revealable-input";
import { Field, FieldGroup, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { provisionWhatsappConnectionAction } from "@/actions/admin/provision-whatsapp-connection";
import { getConnectionAiUsageAction } from "@/actions/admin/get-connection-ai-usage";
import type { AdminChannelConnectionRow } from "@/repositories/channel-connection.repository";
import type { AiUsageDetail, AiUsageTotal } from "@/repositories/ai-usage.repository";

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

function formatUsd(value: number | null | undefined): string {
  if (value == null) return "—";
  return usdFormatter.format(value);
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "secondary",
  CONNECTING: "outline",
  AWAITING_QR_SCAN: "outline",
  CONNECTED: "default",
  AUTH_ERROR: "destructive",
  UNAVAILABLE: "destructive",
  INVALID_TOKEN: "destructive",
  ERROR: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendente",
  CONNECTING: "Conectando",
  AWAITING_QR_SCAN: "Aguardando QR Code",
  CONNECTED: "Conectado",
  AUTH_ERROR: "Erro de autenticação",
  UNAVAILABLE: "Instância indisponível",
  INVALID_TOKEN: "Token inválido",
  ERROR: "Erro",
};

export function WhatsappConnectionManager({
  connections,
  aiUsageTotals,
}: {
  connections: AdminChannelConnectionRow[];
  aiUsageTotals: Record<string, AiUsageTotal>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<AdminChannelConnectionRow | null>(null);
  const [apiUrl, setApiUrl] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [usageOpen, setUsageOpen] = useState(false);
  const [usageTarget, setUsageTarget] = useState<AdminChannelConnectionRow | null>(null);
  const [usageDetail, setUsageDetail] = useState<AiUsageDetail | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);

  function openConfigure(row: AdminChannelConnectionRow) {
    setTarget(row);
    setApiUrl("");
    setApiToken("");
    setError(null);
    setOpen(true);
  }

  async function openUsage(row: AdminChannelConnectionRow) {
    setUsageTarget(row);
    setUsageDetail(null);
    setUsageOpen(true);
    setUsageLoading(true);
    const result = await getConnectionAiUsageAction({ connectionId: row.id });
    setUsageLoading(false);
    if (result.success) setUsageDetail(result.data);
  }

  async function handleSave() {
    if (!target) return;
    setSaving(true);
    setError(null);
    const result = await provisionWhatsappConnectionAction({
      tenantId: target.tenantId,
      connectionId: target.id,
      apiUrl,
      apiToken,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Empresa</TableHead>
            <TableHead>Conexão</TableHead>
            <TableHead>Número</TableHead>
            <TableHead>Provedor</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Gasto IA</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {connections.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <p className="font-medium">{row.tenantName}</p>
                <p className="text-xs text-muted-foreground">{row.tenantSlug}</p>
              </TableCell>
              <TableCell>{row.connectionName}</TableCell>
              <TableCell>{row.phoneNumber}</TableCell>
              <TableCell>{row.providerName}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[row.status] ?? "outline"}>
                  {STATUS_LABEL[row.status] ?? row.status}
                </Badge>
              </TableCell>
              <TableCell>
                <p>{formatUsd(aiUsageTotals[row.id]?.totalCostUsd)}</p>
                <p className="text-xs text-muted-foreground">
                  {aiUsageTotals[row.id]?.messageCount ?? 0} respostas
                </p>
              </TableCell>
              <TableCell className="text-right space-x-2">
                <Button variant="ghost" size="sm" onClick={() => openUsage(row)}>
                  Ver gastos
                </Button>
                {row.status === "PENDING" && (
                  <Button variant="outline" size="sm" onClick={() => openConfigure(row)}>
                    Configurar
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
          {connections.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                Nenhuma conexão solicitada ainda.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Configurar conexão</SheetTitle>
          </SheetHeader>
          {target && (
            <div className="space-y-4 px-4">
              <div className="rounded-lg border border-border p-3 text-sm">
                <p className="font-medium">{target.tenantName}</p>
                <p className="text-muted-foreground">
                  {target.connectionName} · {target.phoneNumber}
                </p>
              </div>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="apiUrl">URL da instância</FieldLabel>
                  <RevealableInput
                    id="apiUrl"
                    placeholder="https://api.z-api.io/instances/xxxx/token/yyyy"
                    value={apiUrl}
                    onChange={setApiUrl}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="apiToken">Token da API</FieldLabel>
                  <RevealableInput id="apiToken" value={apiToken} onChange={setApiToken} />
                  <FieldDescription>
                    Client-Token de segurança da conta Z-API, se ativado.
                  </FieldDescription>
                </Field>
              </FieldGroup>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          )}
          <SheetFooter>
            <Button onClick={handleSave} disabled={saving || !apiUrl}>
              {saving ? "Testando e salvando…" : "Testar e salvar"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={usageOpen} onOpenChange={setUsageOpen}>
        <SheetContent className="w-full max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Gasto de IA</SheetTitle>
          </SheetHeader>
          {usageTarget && (
            <div className="space-y-4 px-4">
              <div className="rounded-lg border border-border p-3 text-sm">
                <p className="font-medium">{usageTarget.tenantName}</p>
                <p className="text-muted-foreground">
                  {usageTarget.connectionName} · {usageTarget.phoneNumber}
                </p>
              </div>

              {usageLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

              {!usageLoading && usageDetail && (
                <>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="rounded-lg border border-border p-3">
                      <p className="text-xs text-muted-foreground">Custo total</p>
                      <p className="font-medium">{formatUsd(usageDetail.totalCostUsd)}</p>
                    </div>
                    <div className="rounded-lg border border-border p-3">
                      <p className="text-xs text-muted-foreground">Respostas</p>
                      <p className="font-medium">{usageDetail.messageCount}</p>
                    </div>
                    <div className="rounded-lg border border-border p-3">
                      <p className="text-xs text-muted-foreground">Tokens (in/out)</p>
                      <p className="font-medium">
                        {usageDetail.totalInputTokens}/{usageDetail.totalOutputTokens}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-sm font-medium">Últimas respostas</p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Modelo</TableHead>
                          <TableHead>Tokens</TableHead>
                          <TableHead className="text-right">Custo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {usageDetail.recent.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell className="text-xs">
                              {entry.createdAt.toLocaleString("pt-BR")}
                            </TableCell>
                            <TableCell className="text-xs">{entry.model}</TableCell>
                            <TableCell className="text-xs">
                              {entry.inputTokens ?? "—"}/{entry.outputTokens ?? "—"}
                            </TableCell>
                            <TableCell className="text-right text-xs">
                              {formatUsd(entry.costUsd)}
                            </TableCell>
                          </TableRow>
                        ))}
                        {usageDetail.recent.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground">
                              Nenhuma resposta de IA registrada ainda.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
