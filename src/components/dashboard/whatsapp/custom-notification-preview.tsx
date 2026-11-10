"use client";

import { useMemo, useState, type DragEvent } from "react";
import type { CustomGreetingNameSource, CustomGreetingStyle, NotificationFieldBlock } from "@/generated/prisma/client";
import { Input } from "@/components/ui/input";
import { CustomNotificationTestSend } from "./custom-notification-test-send";
import { CustomNotificationDeveloperInstructions } from "./custom-notification-developer-instructions";
import {
  buildCustomMessagePreview,
  buildSampleDetails,
  type CustomNotificationField,
  SAMPLE_BUSINESS_NAME,
  SAMPLE_RECIPIENT_NAME,
  SAMPLE_WHATSAPP_NAME,
} from "@/lib/notifications/custom-message";

export function CustomNotificationPreview({
  typeKey,
  fields,
  messageTemplate,
  greetingStyle,
  greetingNameSource,
  requiresQr,
  tenantSlug,
  connectionId,
}: {
  typeKey: string;
  fields: CustomNotificationField[];
  messageTemplate: string;
  greetingStyle: CustomGreetingStyle;
  greetingNameSource: CustomGreetingNameSource;
  requiresQr: boolean;
  tenantSlug: string;
  connectionId: string;
}) {
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const sampleDetails = useMemo(() => ({ ...buildSampleDetails(fields), ...overrides }), [fields, overrides]);
  const preview = useMemo(
    () =>
      buildCustomMessagePreview({
        messageTemplate,
        fields,
        details: sampleDetails,
        businessName: SAMPLE_BUSINESS_NAME,
        greetingStyle,
        greetingNameSource,
        whatsappName: SAMPLE_WHATSAPP_NAME,
        recipientName: SAMPLE_RECIPIENT_NAME,
      }),
    [messageTemplate, fields, sampleDetails, greetingStyle, greetingNameSource]
  );

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-dashed border-border bg-muted/40 p-3">
        <p className="text-xs font-medium text-foreground">Prévia de exemplo — não é uma mensagem real</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Os valores abaixo são só para você conferir o texto. No envio de verdade, o sistema de fora manda os
          dados pela API. Use Testar envio abaixo para mandar esta prévia a um número seu.
        </p>
        <div className="mt-3 rounded-lg bg-[#efeae2] p-3 sm:p-4">
          <div
            className="w-full max-w-[28rem] whitespace-pre-wrap break-words rounded-lg rounded-tl-sm bg-[#d9fdd3] px-3 py-2 text-sm leading-relaxed text-[#111b21] shadow-sm [overflow-wrap:break-word]"
          >
            {preview || " "}
          </div>
        </div>
        {requiresQr && (
          <p className="mt-2 text-xs text-muted-foreground">
            No envio real, um QR code gerado a partir de <code>qrData</code> acompanha este texto. Esta prévia
            mostra só a mensagem.
          </p>
        )}
        {fields.some((f) => f.key.trim()) && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
              Ajustar dados de exemplo
            </summary>
            <div className="mt-2 space-y-2">
              {fields
                .filter((f) => f.key.trim())
                .map((field) => (
                  <div key={field.key} className="flex items-center gap-2">
                    <span className="w-1/3 truncate text-xs text-muted-foreground">{field.label || field.key}</span>
                    <Input
                      value={sampleDetails[field.key] ?? ""}
                      onChange={(e) => setOverrides((prev) => ({ ...prev, [field.key]: e.target.value }))}
                      className="h-8 text-xs"
                    />
                  </div>
                ))}
            </div>
          </details>
        )}
      </div>

      <CustomNotificationDeveloperInstructions
        typeKey={typeKey}
        fields={fields}
        requiresQr={requiresQr}
      />

      <CustomNotificationTestSend
        id={`preview-${typeKey || "rascunho"}`}
        tenantSlug={tenantSlug}
        connectionId={connectionId}
        messageTemplate={messageTemplate}
        fields={fields}
        greetingStyle={greetingStyle}
        greetingNameSource={greetingNameSource}
        details={sampleDetails}
      />
    </div>
  );
}

export function TemplatePlaceholderToolbar({
  fields,
  fieldBlocks,
  onInsert,
  onAddBlock,
}: {
  fields: CustomNotificationField[];
  fieldBlocks?: NotificationFieldBlock[];
  onInsert: (token: string) => void;
  onAddBlock?: (block: NotificationFieldBlock) => void;
}) {
  const usedKeys = new Set(fields.map((f) => f.key));
  const unusedBlocks = (fieldBlocks ?? []).filter((b) => !usedKeys.has(b.key));

  function handleDragStart(event: DragEvent<HTMLButtonElement>, token: string) {
    event.dataTransfer.setData("text/plain", token);
    event.dataTransfer.effectAllowed = "copy";
  }

  return (
    <div className="mt-1 space-y-2">
      <p className="text-xs text-muted-foreground">
        Clique para inserir no texto, ou arraste até o campo da mensagem. Use {"{{nome_empresa}}"} para o nome do
        negócio — é preenchido automaticamente.
      </p>
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          draggable
          onDragStart={(e) => handleDragStart(e, "{{nome_empresa}}")}
          onClick={() => onInsert("{{nome_empresa}}")}
          className="rounded-md border border-border bg-background px-2 py-0.5 font-mono text-xs hover:bg-muted"
        >
          {"{{nome_empresa}}"}
        </button>
        {fields
          .filter((f) => f.key.trim())
          .map((field) => {
            const token = `{{${field.key}}}`;
            return (
              <button
                key={field.key}
                type="button"
                draggable
                onDragStart={(e) => handleDragStart(e, token)}
                onClick={() => onInsert(token)}
                className="rounded-md border border-border bg-background px-2 py-0.5 font-mono text-xs hover:bg-muted"
                title={field.label}
              >
                {token}
              </button>
            );
          })}
      </div>
      {onAddBlock && unusedBlocks.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Peças prontas que ainda não estão nesta função</p>
          <div className="flex flex-wrap gap-1">
            {unusedBlocks.map((block) => (
              <button
                key={block.id}
                type="button"
                onClick={() => onAddBlock(block)}
                className="rounded-md border border-dashed border-border px-2 py-0.5 text-xs hover:bg-muted"
              >
                + {block.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}