"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUp, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  APP_PROMO_CAPTION_MAX_LENGTH,
  APP_PROMO_LINK_DESCRIPTION_MAX_LENGTH,
  APP_PROMO_LINK_TITLE_MAX_LENGTH,
  DEFAULT_APP_PROMO_CAPTION,
  DEFAULT_APP_PROMO_LINK_DESCRIPTION,
  DEFAULT_APP_PROMO_LINK_MESSAGE,
  DEFAULT_APP_PROMO_LINK_TITLE,
  renderAppPromoImageCaption,
  renderAppPromoLinkDescription,
  renderAppPromoLinkMessage,
  renderAppPromoLinkTitle,
} from "@/config/ride-receipt-app-promo";
import { SHORT_LINK_PATH_PREFIX, buildShortLinkUrl, normalizeShortLinkSlug } from "@/config/short-links";
import { updateAppPromoSettingsAction } from "@/actions/whatsapp/update-app-promo-settings";
import { uploadAppPromoImageAction } from "@/actions/whatsapp/upload-app-promo-image";

export interface AppPromoSettingsValues {
  enabled: boolean;
  imageUrl: string | null;
  playStoreUrl: string | null;
  caption: string | null;
  linkMessage?: string | null;
  linkTitle?: string | null;
  linkDescription?: string | null;
  linkImageUrl?: string | null;
  shortLinkSlug?: string | null;
  shortLinkUrl?: string | null;
}

/** Abaixo do limite de 1 MB do corpo de Server Action (com folga pro
 * overhead do multipart). */
const MAX_UPLOAD_BYTES = 950_000;
const MAX_IMAGE_SIDE = 1280;

/** Reduz a imagem no navegador (lado maior até 1280px, JPEG) quando ela não
 * cabe no limite — foto de celular costuma ter vários MB. */
async function prepareImageForUpload(file: File): Promise<File> {
  if (file.size <= MAX_UPLOAD_BYTES && ["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return file;
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível processar a imagem neste navegador.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  for (const quality of [0.85, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= MAX_UPLOAD_BYTES) {
      return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
    }
  }
  throw new Error("Imagem muito grande mesmo depois de reduzida — use uma imagem menor.");
}

/**
 * Tenant-facing: imagem com o link do app na Play Store que o MAIS ZAP
 * manda pro passageiro 3 a 5 minutos depois do recibo "Corrida concluída"
 * (ver ride-receipt-follow-up.service.ts). Um card por conexão na página
 * Funções, logo abaixo do painel de tipos de mensagem.
 */
export function AppPromoSettingsCard({
  tenantSlug,
  connectionId,
  businessName,
  receiptTypeEnabled,
  initial,
  publicOrigin,
}: {
  tenantSlug: string;
  connectionId: string;
  /** Só pra pré-visualizar a legenda com o nome certo. */
  businessName: string;
  /** "Corrida concluída" está marcado nas funções desta conexão? */
  receiptTypeEnabled: boolean;
  initial: AppPromoSettingsValues | null;
  /** Domínio do painel, pra mostrar a URL curta (/l/<slug>). */
  publicOrigin: string;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [enabled, setEnabled] = useState(initial?.enabled ?? false);
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [playStoreUrl, setPlayStoreUrl] = useState(initial?.playStoreUrl ?? "");
  const [caption, setCaption] = useState(initial?.caption ?? "");
  const [linkMessage, setLinkMessage] = useState(initial?.linkMessage ?? "");
  const [linkTitle, setLinkTitle] = useState(initial?.linkTitle ?? "");
  const [linkDescription, setLinkDescription] = useState(initial?.linkDescription ?? "");
  const [linkImageUrl, setLinkImageUrl] = useState(initial?.linkImageUrl ?? "");
  const [shortLinkSlug, setShortLinkSlug] = useState(initial?.shortLinkSlug ?? "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const normalizedSlug = normalizeShortLinkSlug(shortLinkSlug);
  const shortUrlPreview = normalizedSlug ? buildShortLinkUrl(publicOrigin, normalizedSlug) : null;
  const previewLink = shortUrlPreview || playStoreUrl.trim() || "https://play.google.com/store/apps/details?id=…";
  const preview = renderAppPromoImageCaption(caption, { businessName, link: playStoreUrl.trim() || undefined });
  const linkPreview = renderAppPromoLinkMessage(linkMessage, { link: previewLink, businessName });
  const linkPreviewTitle = renderAppPromoLinkTitle(linkTitle, businessName);
  const linkPreviewDescription = renderAppPromoLinkDescription(linkDescription, businessName);
  const linkPreviewImage = linkImageUrl.trim() || imageUrl.trim();

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setSaved(false);
    setUploading(true);
    try {
      const prepared = await prepareImageForUpload(file);
      const formData = new FormData();
      formData.set("connectionId", connectionId);
      formData.set("file", prepared);
      const result = await uploadAppPromoImageAction(tenantSlug, formData);
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      setImageUrl(result.data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar a imagem.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    setError(null);
    setSaved(false);
    setSaving(true);
    const result = await updateAppPromoSettingsAction(tenantSlug, {
      connectionId,
      enabled,
      imageUrl: imageUrl.trim() || null,
      playStoreUrl: playStoreUrl.trim() || null,
      caption: caption.trim() || null,
      linkMessage: linkMessage.trim() || null,
      linkTitle: linkTitle.trim() || null,
      linkDescription: linkDescription.trim() || null,
      linkImageUrl: linkImageUrl.trim() || null,
      shortLinkSlug: normalizedSlug,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Smartphone className="mt-0.5 size-5 text-muted-foreground" />
          <div>
            <h3 className="font-medium">Divulgar o app depois da corrida</h3>
            <p className="text-sm text-muted-foreground">
              Entre 3 e 5 minutos depois do recibo da corrida (<strong>Corrida concluída</strong> ou a função
              <strong> corrida_mai_drive</strong>), o passageiro recebe duas
              mensagens: a imagem com uma legenda curta e, segundos depois, o convite com o link da Play Store
              (com prévia). Corridas pedidas pelo próprio app do passageiro não
              recebem (ele já tem o app).
            </p>
          </div>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(checked) => {
            setSaved(false);
            setEnabled(checked);
          }}
          aria-label="Ligar envio da imagem do app"
        />
      </div>

      {!receiptTypeEnabled && (
        <p className="mt-3 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
          Marque &quot;Corrida concluída&quot; (ou a função corrida_mai_drive) nas funções acima — a imagem só
          vai depois desse recibo. Com a imagem ligada, as Publicidades não saem depois do recibo da corrida
          (pra o passageiro não receber duas divulgações).
        </p>
      )}

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={`app-promo-image-${connectionId}`}>Imagem</Label>
            <div className="flex gap-2">
              <Input
                id={`app-promo-image-${connectionId}`}
                value={imageUrl}
                onChange={(e) => {
                  setSaved(false);
                  setImageUrl(e.target.value);
                }}
                placeholder="https://… (ou envie um arquivo)"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <ImageUp className="size-4" />
                {uploading ? "Enviando…" : "Enviar"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFile}
              />
            </div>
            <p className="text-xs text-muted-foreground">JPG, PNG ou WEBP. Imagens grandes são reduzidas automaticamente.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`app-promo-link-${connectionId}`}>Link do app na Play Store</Label>
            <Input
              id={`app-promo-link-${connectionId}`}
              value={playStoreUrl}
              onChange={(e) => {
                setSaved(false);
                setPlayStoreUrl(e.target.value);
              }}
              placeholder="https://play.google.com/store/apps/details?id=…"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`app-promo-caption-${connectionId}`}>Legenda da imagem (opcional)</Label>
            <Textarea
              id={`app-promo-caption-${connectionId}`}
              rows={5}
              maxLength={APP_PROMO_CAPTION_MAX_LENGTH}
              value={caption}
              onChange={(e) => {
                setSaved(false);
                setCaption(e.target.value);
              }}
              placeholder={DEFAULT_APP_PROMO_CAPTION}
            />
            <p className="text-xs text-muted-foreground">
              Em branco usa o texto padrão. {"{{nome_empresa}}"} vira o nome do negócio. A legenda não leva link —
              ele vai na mensagem seguinte.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`app-promo-link-message-${connectionId}`}>Mensagem com o link (opcional)</Label>
            <Textarea
              id={`app-promo-link-message-${connectionId}`}
              rows={2}
              maxLength={APP_PROMO_CAPTION_MAX_LENGTH}
              value={linkMessage}
              onChange={(e) => {
                setSaved(false);
                setLinkMessage(e.target.value);
              }}
              placeholder={DEFAULT_APP_PROMO_LINK_MESSAGE}
            />
            <p className="text-xs text-muted-foreground">Sai 3 a 6 segundos depois da imagem; o link vai sempre no final.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`app-promo-link-title-${connectionId}`}>Título da prévia</Label>
              <Input
                id={`app-promo-link-title-${connectionId}`}
                maxLength={APP_PROMO_LINK_TITLE_MAX_LENGTH}
                value={linkTitle}
                onChange={(e) => {
                  setSaved(false);
                  setLinkTitle(e.target.value);
                }}
                placeholder={DEFAULT_APP_PROMO_LINK_TITLE}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`app-promo-link-description-${connectionId}`}>Descrição da prévia</Label>
              <Input
                id={`app-promo-link-description-${connectionId}`}
                maxLength={APP_PROMO_LINK_DESCRIPTION_MAX_LENGTH}
                value={linkDescription}
                onChange={(e) => {
                  setSaved(false);
                  setLinkDescription(e.target.value);
                }}
                placeholder={DEFAULT_APP_PROMO_LINK_DESCRIPTION}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`app-promo-short-link-${connectionId}`}>Link curto (opcional)</Label>
            <div className="flex items-center gap-1">
              <span className="shrink-0 text-sm text-muted-foreground">
                {publicOrigin.replace(/^https?:\/\//, "")}
                {SHORT_LINK_PATH_PREFIX}
              </span>
              <Input
                id={`app-promo-short-link-${connectionId}`}
                value={shortLinkSlug}
                onChange={(e) => {
                  setSaved(false);
                  setShortLinkSlug(e.target.value);
                }}
                placeholder="app"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Com um nome aqui, a mensagem leva o link curto no lugar do link comprido da Play Store (ele aparece também
              em Links curtos, com o contador de cliques). Em branco, usa o link da Play Store.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`app-promo-link-image-${connectionId}`}>Miniatura da prévia (ícone do app, opcional)</Label>
            <Input
              id={`app-promo-link-image-${connectionId}`}
              value={linkImageUrl}
              onChange={(e) => {
                setSaved(false);
                setLinkImageUrl(e.target.value);
              }}
              placeholder="https://… (em branco usa a imagem acima)"
            />
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-xs font-medium text-muted-foreground">Prévia</p>
          {imageUrl.trim() ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL externa/Blob arbitrária, só pré-visualização
            <img src={imageUrl.trim()} alt="Imagem do app" className="max-h-64 w-full rounded-md object-contain" />
          ) : (
            <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
              Sem imagem
            </div>
          )}
          <p className="whitespace-pre-wrap break-words text-sm text-foreground">{preview}</p>
          <div className="mt-3 space-y-2 rounded-md border border-border bg-background p-3">
            <div className="flex items-center gap-3 rounded-md bg-muted/50 p-2">
              {linkPreviewImage ? (
                // eslint-disable-next-line @next/next/no-img-element -- URL externa arbitrária, só pré-visualização
                <img src={linkPreviewImage} alt="" className="size-12 rounded object-cover" />
              ) : null}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{linkPreviewTitle}</p>
                <p className="truncate text-xs text-muted-foreground">{linkPreviewDescription}</p>
              </div>
            </div>
            <p className="whitespace-pre-wrap break-words text-sm text-foreground">{linkPreview}</p>
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <Button onClick={handleSave} disabled={saving || uploading}>
          {saving ? "Salvando…" : "Salvar"}
        </Button>
        {saved && !error && <p className="text-sm text-muted-foreground">Salvo.</p>}
      </div>
    </Card>
  );
}
