"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getWhatsappQrCodeAction } from "@/actions/whatsapp/get-qr-code";

/** Shown while a connection is AWAITING_QR_SCAN — the credentials are
 * valid, but pairing the WhatsApp session to a phone can only be done by
 * whoever physically has that phone (never the platform admin who
 * provisioned the credentials). */
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

  async function handleFetch() {
    setLoading(true);
    setError(null);
    const result = await getWhatsappQrCodeAction(tenantSlug, { connectionId });
    setLoading(false);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    if (!result.data.ok || !result.data.image) {
      setError(result.data.message);
      return;
    }
    setImage(result.data.image);
  }

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

      <Button variant="outline" size="sm" onClick={handleFetch} disabled={loading}>
        <RefreshCw className={cn("size-4", loading && "animate-spin")} />
        {loading ? "Carregando…" : image ? "Atualizar QR Code" : "Ver QR Code"}
      </Button>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
