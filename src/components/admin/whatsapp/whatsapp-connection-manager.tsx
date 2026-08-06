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
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { provisionWhatsappConnectionAction } from "@/actions/admin/provision-whatsapp-connection";
import type { AdminChannelConnectionRow } from "@/repositories/channel-connection.repository";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "secondary",
  CONNECTING: "outline",
  CONNECTED: "default",
  AUTH_ERROR: "destructive",
  UNAVAILABLE: "destructive",
  INVALID_TOKEN: "destructive",
  ERROR: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendente",
  CONNECTING: "Conectando",
  CONNECTED: "Conectado",
  AUTH_ERROR: "Erro de autenticação",
  UNAVAILABLE: "Instância indisponível",
  INVALID_TOKEN: "Token inválido",
  ERROR: "Erro",
};

export function WhatsappConnectionManager({
  connections,
}: {
  connections: AdminChannelConnectionRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<AdminChannelConnectionRow | null>(null);
  const [apiUrl, setApiUrl] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openConfigure(row: AdminChannelConnectionRow) {
    setTarget(row);
    setApiUrl("");
    setApiToken("");
    setError(null);
    setOpen(true);
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
              <TableCell className="text-right">
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
              <TableCell colSpan={6} className="text-center text-muted-foreground">
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
                  <FieldLabel>URL da instância</FieldLabel>
                  <Input
                    placeholder="https://api.z-api.io/instances/xxxx/token/yyyy"
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel>Token da API</FieldLabel>
                  <Input
                    type="password"
                    value={apiToken}
                    onChange={(e) => setApiToken(e.target.value)}
                  />
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
    </>
  );
}
