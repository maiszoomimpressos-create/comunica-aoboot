"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getWhatsappQrCodeAction } from "@/actions/whatsapp/get-qr-code";

/** WhatsApp Web-style pairing QR codes are short-lived (tens of seconds) —
 * refreshing on this cadence means whoever's about to scan always sees a
 * live one, instead of scanning a dead code and getting WhatsApp's own
 * generic "não foi possível conectar, tente novamente mais tarde" on the
 * phone with no indication *why* it failed. */
const AUTO_REFRESH_MS = 20_000;

/** Shown while a connection is AWAITING_QR_SCAN — the credentials are
 * valid, but pairing the WhatsApp session to a phone can only be done by
 * whoever physically has that phone (never the platform admin who
 * provisioned the credentials). Fetches immediately on mount and keeps
 * itself fresh every AUTO_REFRESH_MS for as long as it stays mounted. */
export function QrCodeSection({
  tenantSlug,
  connectionId,
}: {
  tenantSlug: string;
  connectionId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Guards against a slow response landing after a newer one already did —
  // only the latest in-flight fetch is allowed to write to state.
  const requestIdRef = useRef(0);

  const handleFetch = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    const result = await getWhatsappQrCodeAction(tenantSlug, { connectionId });
    if (requestId !== requestIdRef.current) return; // superseded by a newer fetch

    setLoading(false);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    if (!result.data.ok || !result.data.image) {
      setError(result.data.message);
      return;
    }
    setError(null);
    setImage(result.data.image);
  }, [tenantSlug, connectionId]);

  useEffect(() => {
    handleFetch();
    const interval = setInterval(handleFetch, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [handleFetch]);

  return (
    <div className="mt-4 space-y-3 rounded-lg border border-warning/30 bg-warning/5 p-4">
      <div>
        <p className="text-sm font-medium">Falta parear o WhatsApp</p>
        <p className="text-sm text-muted-foreground">
          Abra o WhatsApp no celular que vai usar esse número, vá em Aparelhos conectados e
          escaneie o QR Code abaixo.
        </p>
      </div>

      {image && (
        // eslint-disable-next-line @next/next/no-img-element -- small data-URI QR code, next/image adds no value here
        <img
          src={image}
          alt="QR Code para parear o WhatsApp"
          className="size-48 rounded-lg border border-border"
        />
      )}

      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={handleFetch} disabled={loading}>
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          {loading ? "Carregando…" : image ? "Atualizar agora" : "Ver QR Code"}
        </Button>
        {image && (
          <p className="text-xs text-muted-foreground">Atualiza sozinho a cada 20s — não escaneie um QR parado.</p>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
