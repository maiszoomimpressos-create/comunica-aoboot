"use client";

import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendCustomNotificationPreviewTestAction } from "@/actions/whatsapp/send-custom-notification-preview-test";
import { lookupWhatsappContactNameAction } from "@/actions/whatsapp/lookup-whatsapp-contact-name";
import { parseBrazilianWhatsappNumber } from "@/lib/whatsapp/phone-format";
import type { CustomGreetingNameSource, CustomGreetingStyle } from "@/generated/prisma/client";
import type { CustomNotificationField } from "@/lib/notifications/custom-message";

const COOLDOWN_MS = 8000;
const LOOKUP_DEBOUNCE_MS = 600;

type LookupState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "found"; name: string }
  | { status: "missing" }
  | { status: "error"; message: string };

export function CustomNotificationTestSend({
  id,
  tenantSlug,
  connectionId,
  messageTemplate,
  fields,
  greetingStyle,
  greetingNameSource,
  details,
}: {
  id: string;
  tenantSlug: string;
  connectionId: string;
  messageTemplate: string;
  fields: CustomNotificationField[];
  greetingStyle: CustomGreetingStyle;
  greetingNameSource: CustomGreetingNameSource;
  details?: Record<string, string>;
}) {
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [cooling, setCooling] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [lookup, setLookup] = useState<LookupState>({ status: "idle" });

  useEffect(() => {
    const parsed = parseBrazilianWhatsappNumber(phone);
    if (!parsed.ok) {
      setLookup({ status: "idle" });
      return;
    }

    let cancelled = false;
    setLookup({ status: "loading" });
    const timer = window.setTimeout(() => {
      void lookupWhatsappContactNameAction(tenantSlug, {
        connectionId,
        to: parsed.e164,
      }).then((response) => {
        if (cancelled) return;
        if (!response.success) {
          setLookup({ status: "error", message: response.error.message });
          return;
        }
        if (response.data.name) {
          setLookup({ status: "found", name: response.data.name });
          return;
        }
        setLookup({ status: "missing" });
      });
    }, LOOKUP_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [phone, tenantSlug, connectionId]);

  async function handleSend() {
    const parsed = parseBrazilianWhatsappNumber(phone);
    if (!parsed.ok) {
      setStatus({ ok: false, message: parsed.error });
      return;
    }
    if (!messageTemplate.trim()) {
      setStatus({ ok: false, message: "Informe o texto da mensagem." });
      return;
    }
    if (!window.confirm(`Enviar mensagem de teste para ${parsed.display}?`)) {
      return;
    }

    setSending(true);
    setStatus(null);
    try {
      const response = await sendCustomNotificationPreviewTestAction(tenantSlug, {
        connectionId,
        to: parsed.e164,
        messageTemplate,
        fields,
        greetingStyle,
        greetingNameSource,
        details,
      });
      if (!response.success) {
        setStatus({ ok: false, message: response.error.message });
        return;
      }
      if (!response.data.ok) {
        setStatus({
          ok: false,
          message: `Erro no provedor WhatsApp: ${response.data.message || "Falha no envio."}`,
        });
        return;
      }
      setStatus({ ok: true, message: `Mensagem de teste enviada para ${parsed.display}.` });
    } finally {
      setSending(false);
      setCooling(true);
      window.setTimeout(() => setCooling(false), COOLDOWN_MS);
    }
  }

  const busy = sending || cooling;
  const inputId = `test-send-phone-${id}`;

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-3">
      <p className="text-sm font-medium text-foreground">Testar envio</p>
      <p className="text-xs text-muted-foreground">
        Envia o texto da prévia por esta conexão, com o prefixo [TESTE]. A saudação e o campo de
        nome usam o perfil do WhatsApp deste número, se encontrado — não o nome de exemplo. Só o
        texto é enviado (sem QR). Não usa a chave de API.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor={inputId} className="text-xs text-muted-foreground">
            Número de destino (Brasil)
          </Label>
          <Input
            id={inputId}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(11) 99999-9999"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={sending}
          />
        </div>
        <Button type="button" onClick={() => void handleSend()} disabled={busy} className="shrink-0 gap-2">
          <Send className="size-4" />
          {sending ? "Enviando…" : cooling ? "Aguarde…" : "Enviar teste"}
        </Button>
      </div>
      {lookup.status === "loading" && (
        <p className="text-xs text-muted-foreground">Buscando nome no WhatsApp…</p>
      )}
      {lookup.status === "found" && (
        <p className="text-xs text-foreground">Nome encontrado no WhatsApp: {lookup.name}</p>
      )}
      {lookup.status === "missing" && (
        <p className="text-xs text-muted-foreground">
          Não encontramos um nome no perfil WhatsApp deste número. A saudação vai como Olá! (ou Bom
          dia! / Boa tarde! / Boa noite!, conforme o estilo).
        </p>
      )}
      {lookup.status === "error" && <p className="text-xs text-destructive">{lookup.message}</p>}
      {status && (
        <p className={status.ok ? "text-sm text-success" : "text-sm text-destructive"} role="status">
          {status.message}
        </p>
      )}
    </div>
  );
}
