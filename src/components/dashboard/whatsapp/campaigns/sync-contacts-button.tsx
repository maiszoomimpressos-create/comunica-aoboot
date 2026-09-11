"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { syncContactsAction } from "@/actions/campaigns/sync-contacts";

export function SyncContactsButton({
  tenantSlug,
  connectionId,
}: {
  tenantSlug: string;
  connectionId: string;
}) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSync() {
    setSyncing(true);
    setError(null);
    setMessage(null);
    const result = await syncContactsAction(tenantSlug, { connectionId });
    setSyncing(false);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    setMessage(
      `${result.data.total} contato(s) encontrado(s) — ${result.data.created} novo(s), ${result.data.updated} atualizado(s).`
    );
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
        <RefreshCw className={cn("size-4", syncing && "animate-spin")} />
        {syncing ? "Sincronizando…" : "Sincronizar contatos"}
      </Button>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
