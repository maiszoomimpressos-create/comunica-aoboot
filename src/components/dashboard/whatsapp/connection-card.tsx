"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { ConnectionStatusBadge } from "./connection-status-badge";
import { SendTestMessageForm } from "./send-test-message-form";
import { ApiKeySection } from "./api-key-section";
import { retestWhatsappConnectionAction } from "@/actions/whatsapp/retest-connection";
import { deleteWhatsappConnectionAction } from "@/actions/whatsapp/delete-connection";
import type { ChannelConnectionSummary } from "@/repositories/channel-connection.repository";

function formatDate(date: Date | string | null) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(date)
  );
}

export function ConnectionCard({
  tenantSlug,
  connection,
  canManage,
}: {
  tenantSlug: string;
  connection: ChannelConnectionSummary;
  canManage: boolean;
}) {
  const router = useRouter();
  const [showSend, setShowSend] = useState(false);
  const [retesting, setRetesting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleRetest() {
    setRetesting(true);
    await retestWhatsappConnectionAction(tenantSlug, { connectionId: connection.id });
    setRetesting(false);
    router.refresh();
  }

  async function handleDelete() {
    setDeleting(true);
    await deleteWhatsappConnectionAction(tenantSlug, { connectionId: connection.id });
    setDeleting(false);
    router.refresh();
  }

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-medium">{connection.connectionName}</h3>
          <p className="text-sm text-muted-foreground">{connection.phoneNumber}</p>
        </div>
        <ConnectionStatusBadge status={connection.status} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-muted-foreground">Provedor</dt>
          <dd>{connection.provider.name}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Última validação</dt>
          <dd>{formatDate(connection.lastValidation)}</dd>
        </div>
      </dl>
      {connection.lastError && connection.status !== "CONNECTED" && (
        <p className="mt-2 text-sm text-destructive">{connection.lastError}</p>
      )}

      {canManage && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowSend((v) => !v)}>
              {showSend ? "Fechar" : "Enviar mensagem de teste"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleRetest} disabled={retesting}>
              <RefreshCw className={cn("size-4", retesting && "animate-spin")} />
              {retesting ? "Testando…" : "Testar novamente"}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger render={<Button variant="ghost" size="sm" disabled={deleting} />}>
                <Trash2 className="size-4" />
                Remover
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remover {connection.connectionName}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    A empresa deixará de conseguir enviar mensagens por este número até que uma nova
                    conexão seja criada.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>Remover</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {showSend && (
            <div className="mt-4 border-t border-border pt-4">
              <SendTestMessageForm tenantSlug={tenantSlug} connectionId={connection.id} />
            </div>
          )}

          <ApiKeySection
            tenantSlug={tenantSlug}
            connectionId={connection.id}
            apiKeyPrefix={connection.apiKeyPrefix}
            apiKeyCreatedAt={connection.apiKeyCreatedAt}
            apiKeyLastUsedAt={connection.apiKeyLastUsedAt}
          />
        </>
      )}
    </Card>
  );
}
