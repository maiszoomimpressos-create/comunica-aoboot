"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { RevealableInput } from "@/components/ui/revealable-input";
import { Field, FieldGroup, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { updateBusinessIntegrationAction } from "@/actions/admin/update-business-integration";
import type { AdminBusinessIntegrationRow } from "@/repositories/business-integration.repository";

/** Super Admin-only: configura a integração MAIS ZAP ↔ app de negócio
 * externo (hoje: MAI Drive) por conexão — ver docs/INTEGRACAO-MAIDRIVE.md.
 * A chave de API fica editável a qualquer momento (não só cadastrada uma
 * vez): o contrato com o app de negócio ainda está em construção do outro
 * lado, então provider/URL/chave vão mudar enquanto isso evolui. Deixar o
 * campo de chave em branco ao editar mantém a chave já salva — nunca
 * precisa reenviar o valor atual só pra trocar a URL, por exemplo (ver
 * upsertBusinessIntegration). */
export function BusinessIntegrationsManager({
  integrations,
}: {
  integrations: AdminBusinessIntegrationRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<AdminBusinessIntegrationRow | null>(null);
  const [provider, setProvider] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openConfigure(row: AdminBusinessIntegrationRow) {
    setTarget(row);
    setProvider(row.provider ?? "mai-drive");
    setBaseUrl(row.baseUrl ?? "");
    setApiKey("");
    setEnabled(row.enabled);
    setError(null);
    setOpen(true);
  }

  async function handleSave() {
    if (!target) return;
    if (!target.hasApiKey && !apiKey.trim()) {
      setError("Informe a chave de API — essa conexão ainda não tem uma salva.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await updateBusinessIntegrationAction({
      connectionId: target.connectionId,
      provider,
      baseUrl,
      apiKey: apiKey.trim() || undefined,
      enabled,
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
    <Card>
      <CardHeader>
        <CardTitle>Integração com apps de negócio</CardTitle>
        <CardDescription>
          Conecta o atendente de IA à API do app de negócio (ex: MAI Drive) pra consultar cidade
          atendida, cotação e disponibilidade real — MAIS ZAP nunca adivinha esses dados. Ver
          docs/INTEGRACAO-MAIDRIVE.md.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>Conexão</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>URL base</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {integrations.map((row) => (
              <TableRow key={row.connectionId}>
                <TableCell>
                  <p className="font-medium">{row.tenantName}</p>
                  <p className="text-xs text-muted-foreground">{row.tenantSlug}</p>
                </TableCell>
                <TableCell>{row.connectionName}</TableCell>
                <TableCell>{row.provider ?? "—"}</TableCell>
                <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                  {row.baseUrl ?? "—"}
                </TableCell>
                <TableCell>
                  {row.hasApiKey ? (
                    <Badge variant={row.enabled ? "default" : "secondary"}>
                      {row.enabled ? "Ativa" : "Desativada"}
                    </Badge>
                  ) : (
                    <Badge variant="outline">Não configurada</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" onClick={() => openConfigure(row)}>
                    Configurar
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {integrations.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Nenhuma conexão cadastrada ainda.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Integração com app de negócio</SheetTitle>
          </SheetHeader>
          {target && (
            <div className="space-y-4 px-4">
              <div className="rounded-lg border border-border p-3 text-sm">
                <p className="font-medium">{target.tenantName}</p>
                <p className="text-muted-foreground">{target.connectionName}</p>
              </div>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="integration-provider">Provider</FieldLabel>
                  <Input
                    id="integration-provider"
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    placeholder="mai-drive"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="integration-base-url">URL base da API</FieldLabel>
                  <Input
                    id="integration-base-url"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://maidrive.app/api/whatsapp/v1"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="integration-api-key">Chave de API (x-api-key)</FieldLabel>
                  <RevealableInput id="integration-api-key" value={apiKey} onChange={setApiKey} />
                  <FieldDescription>
                    {target.hasApiKey
                      ? "Deixe em branco pra manter a chave já salva — preencha só pra trocar."
                      : "Ainda não há chave salva pra essa conexão."}
                  </FieldDescription>
                </Field>
                <div className="flex items-center justify-between">
                  <FieldLabel htmlFor="integration-enabled">Integração ativa</FieldLabel>
                  <Switch id="integration-enabled" checked={enabled} onCheckedChange={setEnabled} />
                </div>
              </FieldGroup>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          )}
          <SheetFooter>
            <Button onClick={handleSave} disabled={saving || !provider.trim() || !baseUrl.trim()}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </Card>
  );
}
