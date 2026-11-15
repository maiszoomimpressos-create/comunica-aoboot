"use client";

import { useRef, useState } from "react";
import { Link2, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uploadMessageImageAction } from "@/actions/whatsapp/upload-message-image";

const MAX_SIDE = 1600;
const MAX_BYTES = 900 * 1024;

/** Reduz a imagem no navegador (JPEG, até 1600px) para caber no envio e
 * carregar rápido no celular do passageiro. PNG pequeno fica como está. */
async function prepareImage(file: File): Promise<File> {
  if (file.type === "image/png" && file.size <= MAX_BYTES) return file;
  if (file.type === "image/jpeg" && file.size <= MAX_BYTES) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Seu navegador não conseguiu preparar a imagem.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.85, 0.75, 0.6]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= MAX_BYTES) return new File([blob], "imagem.jpg", { type: "image/jpeg" });
  }
  throw new Error("Imagem grande demais mesmo depois de reduzir. Tente outra imagem.");
}

/**
 * Escolher imagem do computador (sobe para o storage do sistema) ou colar
 * um link. Mostra a miniatura do que está escolhido.
 */
export function MessageImageInput({
  tenantSlug,
  value,
  onChange,
  disabled,
}: {
  tenantSlug: string;
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLink, setShowLink] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Escolha um arquivo de imagem (JPG ou PNG).");
      return;
    }
    setUploading(true);
    try {
      const prepared = await prepareImage(file);
      const form = new FormData();
      form.append("file", prepared);
      const result = await uploadMessageImageAction(tenantSlug, form);
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      onChange(result.data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar a imagem.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      {value ? (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-background/60 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- miniatura de URL externa/Blob */}
          <img src={value} alt="Imagem escolhida" className="size-14 shrink-0 rounded-md object-cover" />
          <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={value}>
            {value}
          </p>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => onChange("")} disabled={disabled} aria-label="Remover imagem">
            <X className="size-4" />
          </Button>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={disabled || uploading}>
          {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
          {uploading ? "Enviando…" : value ? "Trocar imagem" : "Enviar imagem do computador"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setShowLink((v) => !v)} disabled={disabled}>
          <Link2 className="size-3.5" />
          Colar link
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>
      {showLink && (
        <Input
          placeholder="https://site.com/imagem.jpg"
          defaultValue={value}
          onBlur={(e) => onChange(e.target.value.trim())}
          disabled={disabled}
          className="h-8 text-xs"
        />
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-[11px] text-muted-foreground">JPG ou PNG. Imagens grandes são reduzidas automaticamente.</p>
    </div>
  );
}
