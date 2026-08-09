"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { rotateWhatsappApiKeyAction } from "@/actions/whatsapp/rotate-api-key";
import { revokeWhatsappApiKeyAction } from "@/actions/whatsapp/revoke-api-key";
import { NOTIFICATION_TYPES } from "@/config/whatsapp-notification-types";

function formatDate(date: Date | string | null) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(date)
  );
}

/** Lets a tenant generate/revoke the API key that lets an external system
 * (e.g. the e-commerce site that processed the sale) call
 * POST /api/v1/whatsapp/purchase-confirmation for this connection, without
 * a dashboard session. Shown inside ConnectionCard, manage-only. */
export function ApiKeySection({
  tenantSlug,
  connectionId,
  apiKeyPrefix,
  apiKeyCreatedAt,
  apiKeyLastUsedAt,
}: {
  tenantSlug: string;
  connectionId: string;
  apiKeyPrefix: string | null;
  apiKeyCreatedAt: Date | string | null;
  apiKeyLastUsedAt: Date | string | null;
}) {
  const router = useRouter();
  const [rotating, setRotating] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showDocs, setShowDocs] = useState(false);

  async function handleRotate() {
    setRotating(true);
    const result = await rotateWhatsappApiKeyAction(tenantSlug, { connectionId });
    setRotating(false);
    if (result.success) {
      setNewKey(result.data.apiKey);
      router.refresh();
    }
  }

  async function handleRevoke() {
    setRevoking(true);
    await revokeWhatsappApiKeyAction(tenantSlug, { connectionId });
    setRevoking(false);
    router.refresh();
  }

  async function handleCopy() {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="flex items-center gap-1.5 text-sm font-medium">
        <KeyRound className="size-4 text-muted-foreground" />
        Chave de API
      </div>

      {apiKeyPrefix ? (
        <div className="mt-2 space-y-1 text-sm text-muted-foreground">
          <p>
            <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">
              {apiKeyPrefix}••••••••
            </code>
          </p>
          <p>Criada em {formatDate(apiKeyCreatedAt)}</p>
          <p>Último uso: {apiKeyLastUsedAt ? formatDate(apiKeyLastUsedAt) : "nunca"}</p>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Nenhuma chave de API gerada. Gere uma pra permitir que um sistema externo dispare
          mensagens por esta conexão.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="outline" size="sm" disabled={rotating} />}>
            {apiKeyPrefix ? "Gerar nova chave" : "Gerar chave de API"}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {apiKeyPrefix ? "Gerar uma nova chave?" : "Gerar chave de API?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {apiKeyPrefix
                  ? "A chave atual deixa de funcionar imediatamente. Sistemas externos que ainda usam a chave antiga vão parar de conseguir enviar mensagens até serem atualizados com a nova."
                  : "Essa chave permite que um sistema externo (ex: o site de vendas) dispare mensagens por esta conexão, sem precisar fazer login na plataforma."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleRotate}>
                {apiKeyPrefix ? "Gerar nova chave" : "Gerar chave"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {apiKeyPrefix && (
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="ghost" size="sm" disabled={revoking} />}>
              Revogar
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Revogar a chave de API?</AlertDialogTitle>
                <AlertDialogDescription>
                  Sistemas externos que usam essa chave vão parar de conseguir enviar mensagens
                  imediatamente.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleRevoke}>Revogar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        <Button variant="ghost" size="sm" onClick={() => setShowDocs((v) => !v)}>
          {showDocs ? "Fechar" : "Como integrar"}
        </Button>
      </div>

      {showDocs && (
        <div className="mt-3 space-y-2 rounded-lg border border-border bg-muted p-3 text-xs">
          <p className="font-medium text-foreground">
            POST /api/v1/whatsapp/purchase-confirmation
          </p>
          <p className="text-muted-foreground">
            Header: <code className="text-foreground">Authorization: Bearer &lt;sua chave&gt;</code>
          </p>
          <pre className="overflow-x-auto rounded-md bg-background p-2 text-foreground">
{`{
  "to": "5511999999999",
  "type": "ingresso_emitido",
  "recipientName": "Maria Oliveira",
  "details": {},
  "qrData": "texto ou código a virar QR code"
}`}
          </pre>
          <p className="text-muted-foreground">
            <code className="text-foreground">to</code>: só números, sem espaço/traço/parênteses —
            código do país + DDD + número (ex: 55 11 999999999 → 5511999999999).
          </p>
          <p className="text-muted-foreground">
            <code className="text-foreground">recipientName</code>: o nome cadastrado no seu
            sistema pra essa pessoa — não precisa ser igual ao nome do perfil de WhatsApp de quem
            recebe.
          </p>
          <p className="text-muted-foreground">
            <code className="text-foreground">type</code> (opcional, padrão{" "}
            <code className="text-foreground">compra_confirmada</code>): define o texto da
            mensagem e se <code className="text-foreground">qrData</code> é obrigatório.
          </p>
          <ul className="ml-4 list-disc space-y-0.5 text-muted-foreground">
            {NOTIFICATION_TYPES.map((t) => (
              <li key={t.key}>
                <code className="text-foreground">{t.key}</code> — {t.label}
                {t.requiresQr && " (exige qrData)"}
                {t.requiredDetailKeys.length > 0 &&
                  ` (details obrigatório: ${t.requiredDetailKeys.join(", ")})`}
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground">
            O texto da mensagem é sempre montado por nós a partir do <code className="text-foreground">type</code>: cumprimenta pelo
            nome do WhatsApp de quem recebe (quando existir) e sempre cita{" "}
            <code className="text-foreground">recipientName</code> e o nome do seu negócio
            (configurável em Minha Empresa). Quando <code className="text-foreground">qrData</code>{" "}
            é enviado, geramos o QR code e mandamos como imagem; sem ele, vai como texto.
          </p>
          <p className="text-muted-foreground">
            <code className="text-foreground">note</code> (opcional, até 500 caracteres): uma
            linha de texto livre sua, adicionada no final da mensagem — ex: &ldquo;Apresente esse
            ingresso na portaria do evento, não perca&rdquo;. Complementa, nunca substitui o texto
            montado por nós.
          </p>
        </div>
      )}

      <Dialog open={!!newKey} onOpenChange={(open) => !open && setNewKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chave de API gerada</DialogTitle>
            <DialogDescription>
              Copie e guarde essa chave agora — por segurança, ela não será mostrada novamente.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted p-2">
            <code className="flex-1 overflow-x-auto text-xs">{newKey}</code>
            <Button variant="outline" size="icon-sm" onClick={handleCopy}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewKey(null)}>Entendi, já copiei</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
