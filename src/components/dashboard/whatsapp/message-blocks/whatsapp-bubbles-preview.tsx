"use client";

import { Fragment, useState, type ReactNode } from "react";
import { ExternalLink, ImageOff, Info } from "lucide-react";
import type { MessageDelivery } from "@/lib/notifications/message-blocks";

/** *negrito*, _itálico_ e ~riscado~ como o WhatsApp mostra. */
function renderWhatsappFormatting(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = re.exec(text))) {
    if (match.index > last) parts.push(<Fragment key={i++}>{text.slice(last, match.index)}</Fragment>);
    const token = match[0];
    const inner = token.slice(1, -1);
    if (token.startsWith("*")) parts.push(<strong key={i++}>{inner}</strong>);
    else if (token.startsWith("_")) parts.push(<em key={i++}>{inner}</em>);
    else parts.push(<s key={i++}>{inner}</s>);
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(<Fragment key={i++}>{text.slice(last)}</Fragment>);
  return parts;
}

function BubbleImage({ src }: { src: string }) {
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  if (brokenSrc === src) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-black/5 p-4 text-xs text-[#54656f]">
        <ImageOff className="size-4" /> Não foi possível abrir esta imagem.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-md bg-black/5">
      {/* eslint-disable-next-line @next/next/no-img-element -- prévia de URL externa/Blob, sem otimização */}
      <img src={src} alt="Imagem da mensagem" className="max-h-72 w-full object-cover" onError={() => setBrokenSrc(src)} />
    </div>
  );
}

/**
 * Prévia fiel de como as mensagens chegam no WhatsApp: um balão por envio,
 * imagem em cima, texto, e os botões de link embaixo do balão.
 */
export function WhatsappBubblesPreview({
  deliveries,
  warnings,
  emptyText = "Nada para mostrar ainda.",
  time = "14:32",
}: {
  deliveries: MessageDelivery[];
  warnings?: string[];
  emptyText?: string;
  time?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="rounded-xl bg-[#efeae2] p-3 sm:p-4">
        {deliveries.length === 0 ? (
          <p className="py-6 text-center text-xs text-[#54656f]">{emptyText}</p>
        ) : (
          <div className="space-y-2">
            {deliveries.map((delivery, index) => (
              <div key={index} className="w-full max-w-[22rem]">
                <div className="relative rounded-lg rounded-tl-sm bg-white p-1 text-sm leading-relaxed text-[#111b21] shadow-sm">
                  {deliveries.length > 1 && (
                    <span className="absolute -left-2 -top-2 flex size-5 items-center justify-center rounded-full bg-[#25d366] text-[10px] font-semibold text-white shadow">
                      {index + 1}
                    </span>
                  )}
                  {delivery.image && <BubbleImage src={delivery.image} />}
                  {delivery.text && (
                    <p className="whitespace-pre-wrap break-words px-2 pb-1 pt-1.5 [overflow-wrap:anywhere]">
                      {renderWhatsappFormatting(delivery.text)}
                    </p>
                  )}
                  <p className="px-2 pb-0.5 text-right text-[10px] text-[#667781]">{time}</p>
                  {delivery.buttons && delivery.buttons.length > 0 && (
                    <div className="mt-0.5 divide-y divide-[#e9edef] border-t border-[#e9edef]">
                      {delivery.buttons.map((button) => (
                        <a
                          key={button.id}
                          href={button.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-center gap-1.5 py-2 text-sm font-medium text-[#027eb5] hover:bg-black/5"
                        >
                          <ExternalLink className="size-3.5" />
                          {button.label}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {warnings && warnings.length > 0 && (
        <ul className="space-y-1">
          {warnings.map((warning) => (
            <li key={warning} className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              {warning}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
