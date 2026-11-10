"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Download, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  API_KEY_PLACEHOLDER,
  PURCHASE_CONFIRMATION_PATH,
  buildDeveloperCurlExample,
  buildDeveloperExamplePayload,
  buildDeveloperInstructionsMarkdown,
  fieldFormatHint,
  isFieldRequired,
  purchaseConfirmationEndpoint,
  resolveFieldType,
} from "@/lib/notifications/developer-instructions";
import type { CustomNotificationField } from "@/lib/notifications/custom-message";

export function CustomNotificationDeveloperInstructions({
  typeKey,
  typeLabel,
  fields,
  requiresQr,
}: {
  typeKey: string;
  typeLabel?: string;
  fields: CustomNotificationField[];
  requiresQr: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const [baseUrl, setBaseUrl] = useState(
    () => process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "") ?? ""
  );
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_APP_URL?.trim()) {
      setBaseUrl(window.location.origin);
    }
  }, []);
  const endpoint = purchaseConfirmationEndpoint(baseUrl);
  const payload = useMemo(
    () => buildDeveloperExamplePayload({ typeKey, fields, requiresQr }),
    [typeKey, fields, requiresQr]
  );
  const payloadJson = useMemo(() => JSON.stringify(payload, null, 2), [payload]);
  const curl = useMemo(() => buildDeveloperCurlExample(endpoint, payload), [endpoint, payload]);
  const markdown = useMemo(
    () =>
      buildDeveloperInstructionsMarkdown({
        typeKey,
        typeLabel,
        fields,
        requiresQr,
        baseUrl,
      }),
    [typeKey, typeLabel, fields, requiresQr, baseUrl]
  );
  const fileKey = (typeKey.trim() || "funcao").replace(/[^\w.-]+/g, "_");
  const documentedFields = fields.filter((field) => field.key.trim());

  async function copyInstructions() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  function downloadMarkdown() {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `instrucoes-${fileKey}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setOpen(true)}>
        <Share2 className="size-4" />
        Enviar para meu desenvolvedor
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85vh] w-full flex-col sm:max-w-3xl lg:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Instruções para o desenvolvedor</DialogTitle>
            <DialogDescription>
              Pacote para o sistema de fora chamar esta função. A mensagem é montada no MAIS ZAP; o
              outro sistema só envia os dados. A chave real nunca aparece aqui. Envie este conteúdo
              (copiar ou baixar o .md) para quem for integrar — esta tela não dispara e-mail.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => void copyInstructions()}>
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? "Copiado." : "Copiar instruções"}
          </Button>
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={downloadMarkdown}>
            <Download className="size-3.5" />
            Baixar .md
          </Button>
        </div>

        <section className="space-y-1">
          <p className="text-xs font-medium text-foreground">Endpoint</p>
          <p className="text-xs text-muted-foreground">
            Método <code className="text-foreground">POST</code>
          </p>
          <pre className="overflow-x-auto rounded-md bg-muted p-2 text-xs text-muted-foreground">
            {endpoint || PURCHASE_CONFIRMATION_PATH}
          </pre>
        </section>

        <section className="space-y-1">
          <p className="text-xs font-medium text-foreground">Autenticação</p>
          <pre className="overflow-x-auto rounded-md bg-muted p-2 text-xs text-muted-foreground">
            Authorization: Bearer {API_KEY_PLACEHOLDER}
          </pre>
          <p className="text-xs text-muted-foreground">
            Gere a chave no card da conexão, na seção <strong className="text-foreground">Chave de API</strong>.
            O texto puro aparece somente uma vez, na hora de criar. Guarde em um lugar seguro. Se
            perder, gere outra — a anterior deixa de valer. Esta tela nunca mostra a chave real.
          </p>
        </section>

        <section className="space-y-1">
          <p className="text-xs font-medium text-foreground">Campos do JSON</p>
          <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
            <li>
              <code className="text-foreground">to</code> — obrigatório. Só dígitos, DDI + DDD +
              número. Ex.: <code className="text-foreground">5511999999999</code>.
            </li>
            <li>
              <code className="text-foreground">type</code> — use exatamente{" "}
              <code className="text-foreground">{typeKey.trim() || "identificador_da_funcao"}</code>.
            </li>
            <li>
              <code className="text-foreground">recipientName</code> — obrigatório. Nome enviado pelo
              sistema cliente (ex.: nome do passageiro).
            </li>
            <li>
              <code className="text-foreground">details</code> — objeto com os campos abaixo. Um
              campo de link (identificador ou rótulo contendo “link”) recebe a URL completa que o
              sistema de fora devolve; o MAIS ZAP não busca esse link.
            </li>
            {requiresQr && (
              <li>
                <code className="text-foreground">qrData</code> — obrigatório nesta função. Texto que
                vira o QR code.
              </li>
            )}
          </ul>
        </section>

        <section className="space-y-2">
          <p className="text-xs font-medium text-foreground">Campos em details</p>
          {documentedFields.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum campo configurado ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-1 pr-2 font-medium">Identificador</th>
                    <th className="py-1 pr-2 font-medium">Rótulo</th>
                    <th className="py-1 pr-2 font-medium">Tipo</th>
                    <th className="py-1 pr-2 font-medium">Obrigatório</th>
                    <th className="py-1 font-medium">Formato / exemplo</th>
                  </tr>
                </thead>
                <tbody>
                  {documentedFields.map((field) => (
                    <tr key={field.key} className="border-b border-border/60 align-top">
                      <td className="py-1.5 pr-2 font-mono text-foreground">{field.key}</td>
                      <td className="py-1.5 pr-2 text-foreground">{field.label || field.key}</td>
                      <td className="py-1.5 pr-2 text-muted-foreground">{resolveFieldType(field)}</td>
                      <td className="py-1.5 pr-2 text-muted-foreground">
                        {isFieldRequired(field) ? "Sim" : "Opcional"}
                      </td>
                      <td className="py-1.5 text-muted-foreground">{fieldFormatHint(field)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="space-y-1">
          <p className="text-xs font-medium text-foreground">Exemplo de payload</p>
          <pre className="max-h-64 overflow-auto rounded-md bg-muted p-2 text-xs text-muted-foreground">
            {payloadJson}
          </pre>
        </section>

        <section className="space-y-1">
          <p className="text-xs font-medium text-foreground">Exemplo curl</p>
          <pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 text-xs text-muted-foreground">
            {curl}
          </pre>
        </section>

        <section className="space-y-1">
          <p className="text-xs font-medium text-foreground">Respostas da API</p>
          <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
            <li>
              <code className="text-foreground">200</code> — enviado. Corpo:{" "}
              <code className="text-foreground">{`{ "success": true, "data": { "ok": true, "message": "..." } }`}</code>.
            </li>
            <li>
              <code className="text-foreground">401 UNAUTHORIZED</code> — chave ausente ou inválida
              (“Chave de API inválida.”).
            </li>
            <li>
              <code className="text-foreground">403 FORBIDDEN</code> — esta função não está habilitada
              nesta conexão.
            </li>
            <li>
              <code className="text-foreground">409 CONFLICT</code> — conexão desconectada (“Esta
              conexão não está ativa no momento.”) ou ainda não configurada.
            </li>
            <li>
              <code className="text-foreground">422 VALIDATION_ERROR</code> — corpo inválido, tipo
              desconhecido, campos obrigatórios faltando, <code className="text-foreground">qrData</code>{" "}
              ausente quando exigido, ou número em formato inválido. Este endpoint não responde 400;
              validação retorna 422.
            </li>
            <li>
              <code className="text-foreground">500 INTERNAL_ERROR</code> — erro inesperado no
              servidor.
            </li>
          </ul>
        </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
