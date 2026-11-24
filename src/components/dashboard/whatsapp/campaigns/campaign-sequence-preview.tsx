"use client";

import { FileText, Film, Mic, Timer } from "lucide-react";
import type { RenderedPart } from "@/lib/campaigns/sequence";
import { splitCaption } from "@/lib/campaigns/caption";

/** Balões "estilo WhatsApp" de uma sequência já montada (renderSequence)
 * — mostra a legenda dividida quando passa do limite, como sai de verdade. */
export function CampaignSequencePreview({
  parts,
  minGapSeconds,
  maxGapSeconds,
}: {
  parts: RenderedPart[];
  minGapSeconds: number;
  maxGapSeconds: number;
}) {
  return (
    <div className="max-w-sm space-y-2 rounded-md border bg-muted/40 p-3">
      {parts.map((part, i) => {
        const isMedia = part.type !== "text" && part.type !== "audio";
        const split = isMedia ? splitCaption(part.text) : { caption: part.text, rest: "" };
        return (
          <div key={i} className="space-y-2">
            {i > 0 && (
              <p className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
                <Timer className="size-3" />
                {minGapSeconds === maxGapSeconds ? `${minGapSeconds} s` : `${minGapSeconds}–${maxGapSeconds} s`}
              </p>
            )}
            <div className="overflow-hidden rounded-lg bg-background shadow-sm">
              {part.type === "image" &&
                (part.mediaUrl?.startsWith("https://") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={part.mediaUrl} alt={`Imagem da mensagem ${i + 1}`} className="max-h-56 w-full object-cover" />
                ) : (
                  <div className="flex h-24 items-center justify-center bg-muted text-xs text-muted-foreground">
                    Imagem (envie o arquivo ou cole a URL)
                  </div>
                ))}
              {(part.type === "video" || part.type === "document" || part.type === "audio") && (
                <div className="flex items-center gap-2 bg-muted px-3 py-2 text-xs text-muted-foreground">
                  {part.type === "video" ? (
                    <Film className="size-4" />
                  ) : part.type === "audio" ? (
                    <Mic className="size-4" />
                  ) : (
                    <FileText className="size-4" />
                  )}
                  {part.type === "document" ? part.fileName || "documento" : part.type === "video" ? "Vídeo" : "Áudio"}
                  {!part.mediaUrl && " — falta o arquivo"}
                </div>
              )}
              {part.type !== "audio" && (split.caption || part.type === "text") && (
                <p className="whitespace-pre-wrap p-3 text-sm">
                  {split.caption || <span className="text-muted-foreground">Digite a mensagem…</span>}
                </p>
              )}
            </div>
            {split.rest && (
              <div className="rounded-lg bg-background p-3 text-sm whitespace-pre-wrap shadow-sm">{split.rest}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
