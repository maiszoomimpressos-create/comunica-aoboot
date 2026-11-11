"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { unpauseAutomaticReplyAction } from "@/actions/whatsapp/unpause-automatic-reply";
import type { PausedAutomaticReply } from "@/services/anti-loop.service";

function formatPausedAt(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PausedContactsPanel({
  tenantSlug,
  connectionId,
  canManage,
  items,
}: {
  tenantSlug: string;
  connectionId: string;
  canManage: boolean;
  items: PausedAutomaticReply[];
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function unpause(relaySessionId: string) {
    setPendingId(relaySessionId);
    setError(null);
    const result = await unpauseAutomaticReplyAction(tenantSlug, { connectionId, relaySessionId });
    setPendingId(null);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center gap-1.5 text-sm font-medium">
        <ShieldAlert className="size-4 text-muted-foreground" />
        Atendimento automático pausado
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Números em que o sistema identificou um robô ou um volume anormal e parou de
        responder sozinho. O desbloqueio reativa o fluxo e a IA só neste contato.
      </p>

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nenhum número pausado nesta conexão.</p>
      ) : (
        <ul className="mt-3 divide-y rounded-md border">
          {items.map((item) => (
            <li key={item.relaySessionId} className="flex items-start justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="font-medium tabular-nums">{item.contactPhoneMasked}</p>
                <p className="text-xs text-muted-foreground">{formatPausedAt(item.pausedAt)}</p>
                {item.reason ? (
                  <p className="mt-1 text-sm text-muted-foreground">{item.reason}</p>
                ) : null}
              </div>
              {canManage ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pendingId === item.relaySessionId}
                  onClick={() => unpause(item.relaySessionId)}
                >
                  {pendingId === item.relaySessionId ? "Desbloqueando..." : "Desbloquear"}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
