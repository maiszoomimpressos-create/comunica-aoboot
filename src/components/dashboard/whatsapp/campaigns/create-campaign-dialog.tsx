"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { upload } from "@vercel/blob/client";
import { ArrowDown, ArrowUp, Plus, Shuffle, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, FieldGroup, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { createCampaignAction } from "@/actions/campaigns/create-campaign";
import type { ContactListSummary } from "@/repositories/contact-list.repository";
import { CAMPAIGN_TEMPLATE_VARIABLES, findUnknownVariables } from "@/lib/campaigns/template";
import { CAMPAIGN_MEDIA_LIMITS, formatBytes, type CampaignMediaKind } from "@/config/campaign-media";
import { MEDIA_CAPTION_MAX } from "@/lib/campaigns/caption";
import {
  DEFAULT_PART_INTERVAL,
  MAX_CAMPAIGN_PARTS,
  PART_INTERVAL_LIMITS,
  PART_TEXT_MAX_LENGTH,
  renderSequence,
  validateParts,
  type CampaignPart,
  type CampaignPartType,
} from "@/lib/campaigns/sequence";
import { CONTACT_NAME_SOURCE_LABEL, isContactNameSource } from "@/lib/whatsapp/contact-name";
import { getListNamePreviewAction } from "@/actions/campaigns/get-list-name-preview";
import type { ListNamePreview } from "@/services/whatsapp-contacts.service";
import { CampaignSequencePreview } from "./campaign-sequence-preview";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ensureOptOutInstruction, firstMessageIdentifiesBusiness } from "@/lib/campaigns/cold-outreach";

const formSchema = z.object({
  name: z.string().min(1, "Informe um nome para a campanha."),
  listId: z.string().min(1, "Selecione uma lista."),
});
type FormValues = z.infer<typeof formSchema>;

/** Parte em edição (id só pra key/foco no React). */
interface DraftPart extends CampaignPart {
  id: string;
}

const PART_TYPE_LABEL: Record<CampaignPartType, string> = {
  text: "Texto",
  image: "Imagem (com legenda opcional)",
  video: "Vídeo (com legenda opcional)",
  document: "Documento (com legenda opcional)",
  audio: "Áudio",
};

const SAMPLE_CONTACT = { name: "Maria Silva", phone: "5511912345678", nameSource: null as string | null };

const NAME_SOURCE_ORDER = ["agenda", "whatsapp", "perfil", "csv", "manual", "google"] as const;

function nameSourceLabel(source: string | null): string {
  return isContactNameSource(source) ? CONTACT_NAME_SOURCE_LABEL[source] : "WhatsApp";
}

/** Gerador pseudoaleatório simples e determinístico (prévia da variação). */
function makeSeededRng(initialSeed: number): () => number {
  let seed = initialSeed * 9301 + 49297;
  return () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}

function newPart(type: CampaignPartType = "text"): DraftPart {
  return { id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, type, text: "", mediaUrl: "", fileName: "" };
}

/** Parte como vai pro servidor (campos que não se aplicam ao tipo = null). */
function toPayload(part: DraftPart): CampaignPart {
  return {
    type: part.type,
    text: part.type === "audio" ? null : part.text?.trim() || null,
    mediaUrl: part.type === "text" ? null : part.mediaUrl?.trim() || null,
    fileName: part.type === "document" ? part.fileName?.trim() || null : null,
  };
}

export function CreateCampaignDialog({
  tenantSlug,
  connectionId,
  lists,
  businessName,
  optOutFooter,
  coldOptOutFooter,
}: {
  tenantSlug: string;
  connectionId: string;
  lists: ContactListSummary[];
  /** Valor de {{empresa}} na prévia. */
  businessName: string;
  /** Rodapé de opt-out que o dispatcher acrescenta (null = desligado). */
  optOutFooter: string | null;
  /** Rodapé usado quando a lista tem contato frio (sempre com SAIR). */
  coldOptOutFooter: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [partsError, setPartsError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<{ partId: string; pct: number } | null>(null);
  const [uploadError, setUploadError] = useState<{ partId: string; message: string } | null>(null);
  const [previewSeed, setPreviewSeed] = useState(1);
  const [namePreview, setNamePreview] = useState<ListNamePreview | null>(null);
  const [parts, setParts] = useState<DraftPart[]>(() => [newPart("text")]);
  const [minGap, setMinGap] = useState<number>(DEFAULT_PART_INTERVAL.min);
  const [maxGap, setMaxGap] = useState<number>(DEFAULT_PART_INTERVAL.max);
  const [coldConfirmed, setColdConfirmed] = useState(false);
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", listId: "" },
  });
  const eligibleLists = lists.filter((l) => l.memberCount > 0);

  // Contato da prévia: o primeiro com nome da lista escolhida (mostra de
  // onde o nome veio); sem lista/sem nomes, um exemplo fixo.
  const previewContact = namePreview?.samples[0] ?? SAMPLE_CONTACT;
  // Lista com contato frio (captado do Google): SAIR obrigatório, aviso e
  // confirmação (mesmas regras do dispatcher — cold-outreach.ts).
  const coldCount = namePreview?.coldCount ?? 0;
  const isCold = coldCount > 0;
  const effectiveFooter = isCold ? coldOptOutFooter : optOutFooter;
  const preview = useMemo(() => {
    // RNG determinístico por "semente" — o botão de sortear mostra outra
    // combinação da variação {a|b} sem mudar a cada tecla.
    const rendered = renderSequence(
      parts.map(toPayload),
      { name: previewContact.name, phone: previewContact.phone, businessName },
      effectiveFooter,
      makeSeededRng(previewSeed)
    );
    return isCold && effectiveFooter ? ensureOptOutInstruction(rendered, effectiveFooter) : rendered;
  }, [parts, businessName, effectiveFooter, isCold, previewSeed, previewContact.name, previewContact.phone]);
  const identifiesBusiness = firstMessageIdentifiesBusiness(parts.map(toPayload), businessName);

  async function loadNamePreview(listId: string) {
    setNamePreview(null);
    if (!listId) return;
    const result = await getListNamePreviewAction(tenantSlug, { listId });
    if (result.success) setNamePreview(result.data);
  }

  function updatePart(id: string, patch: Partial<DraftPart>) {
    setParts((current) => current.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    setPartsError(null);
  }

  function movePart(index: number, delta: -1 | 1) {
    setParts((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removePart(id: string) {
    setParts((current) => (current.length <= 1 ? current : current.filter((p) => p.id !== id)));
  }

  function insertAtCursor(part: DraftPart, snippet: string) {
    const el = document.getElementById(`campaign-part-text-${part.id}`) as HTMLTextAreaElement | null;
    const current = part.text ?? "";
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    updatePart(part.id, { text: current.slice(0, start) + snippet + current.slice(end) });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + snippet.length, start + snippet.length);
    });
  }

  async function handleFile(part: DraftPart, file: File, input: HTMLInputElement) {
    if (part.type === "text") return;
    const kind = part.type as CampaignMediaKind;
    const limits = CAMPAIGN_MEDIA_LIMITS[kind];
    setUploadError(null);
    if (file.size > limits.maxBytes) {
      setUploadError({
        partId: part.id,
        message: `Arquivo grande demais — máximo ${formatBytes(limits.maxBytes)} para ${limits.label.toLowerCase()}.`,
      });
      return;
    }
    setUploading({ partId: part.id, pct: 0 });
    try {
      const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-80) || "arquivo";
      const blob = await upload(`campaign-media/${tenantSlug}/${safeName}`, file, {
        access: "public",
        handleUploadUrl: "/api/campaigns/media-upload",
        clientPayload: JSON.stringify({ tenantSlug, connectionId, kind }),
        multipart: file.size > 8 * 1024 * 1024,
        onUploadProgress: ({ percentage }) => setUploading({ partId: part.id, pct: Math.round(percentage) }),
      });
      updatePart(part.id, {
        mediaUrl: blob.url,
        ...(kind === "document" && !part.fileName?.trim() ? { fileName: file.name.slice(-200) } : {}),
      });
    } catch (err) {
      setUploadError({ partId: part.id, message: err instanceof Error ? err.message : "Falha no upload." });
    } finally {
      setUploading(null);
      input.value = "";
    }
  }

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const payload = parts.map(toPayload);
    const invalid = validateParts(payload);
    if (invalid) {
      setPartsError(invalid);
      return;
    }
    if (minGap > maxGap) {
      setPartsError("O intervalo mínimo entre mensagens não pode ser maior que o máximo.");
      return;
    }
    if (isCold && !coldConfirmed) {
      setServerError("Confirme o aviso de contatos frios antes de criar a campanha.");
      return;
    }
    const result = await createCampaignAction(tenantSlug, {
      connectionId,
      listId: values.listId,
      name: values.name,
      parts: payload,
      minPartIntervalSeconds: minGap,
      maxPartIntervalSeconds: maxGap,
      coldOutreachConfirmed: isCold && coldConfirmed,
      overrides: {
        batchSize: null,
        minMessageIntervalSeconds: null,
        maxMessageIntervalSeconds: null,
        minBatchPauseSeconds: null,
        maxBatchPauseSeconds: null,
      },
    });
    if (!result.success) {
      setServerError(result.error.message);
      return;
    }
    setOpen(false);
    reset();
    setParts([newPart("text")]);
    setMinGap(DEFAULT_PART_INTERVAL.min);
    setMaxGap(DEFAULT_PART_INTERVAL.max);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setServerError(null);
          setUploadError(null);
          setPartsError(null);
          setNamePreview(null);
          setColdConfirmed(false);
        }
      }}
    >
      <DialogTrigger render={<Button size="sm" disabled={eligibleLists.length === 0} />}>
        <Plus className="size-4" />
        Nova campanha
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Nova campanha</DialogTitle>
          <DialogDescription>
            Cria a campanha como rascunho, com um destinatário por contato ativo da lista escolhida neste
            momento (contatos em opt-out na empresa ficam de fora). O envio sempre sai por este número, no
            ritmo da configuração de disparo desta conexão. Cada contato recebe a sequência inteira, na ordem,
            antes do próximo.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="campaign-name">Nome da campanha</FieldLabel>
              <Input id="campaign-name" placeholder="Promoção de setembro" {...register("name")} />
              <FieldError errors={[errors.name]} />
            </Field>

            <Field data-invalid={!!errors.listId}>
              <FieldLabel>Lista de contatos</FieldLabel>
              <Controller
                name="listId"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(v) => {
                      field.onChange(v);
                      void loadNamePreview(typeof v === "string" ? v : "");
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione uma lista" />
                    </SelectTrigger>
                    <SelectContent>
                      {eligibleLists.map((list) => (
                        <SelectItem key={list.id} value={list.id}>
                          {list.name} ({list.memberCount})
                          {list.type === "EXTRACTED" ? ` · de ${list.originPhoneNumber}` : " · montada"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[errors.listId]} />
            </Field>

            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">
                  Mensagens ({parts.length}/{MAX_CAMPAIGN_PARTS}) — enviadas nesta ordem
                </p>
                <p className="text-xs text-muted-foreground">
                  Variáveis trocam pelo dado de cada contato (<code>{"{{nome|cliente}}"}</code> usa
                  &ldquo;cliente&rdquo; quando o nome estiver vazio). <code>{"{Olá|Oi}"}</code> sorteia uma opção
                  por contato — variar o texto reduz o risco de bloqueio. Legenda de mídia passando de{" "}
                  {MEDIA_CAPTION_MAX} caracteres: o restante vai numa mensagem de texto logo depois.
                </p>
              </div>

              {parts.map((part, index) => {
                const limits = part.type !== "text" ? CAMPAIGN_MEDIA_LIMITS[part.type as CampaignMediaKind] : null;
                const unknown = findUnknownVariables(part.text ?? "");
                const isUploading = uploading?.partId === part.id;
                return (
                  <div key={part.id} className="space-y-3 rounded-md border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">Mensagem {index + 1}</span>
                      <div className="min-w-48 flex-1">
                        <Select
                          value={part.type}
                          onValueChange={(v) => {
                            if (typeof v !== "string") return;
                            updatePart(part.id, { type: v as CampaignPartType, mediaUrl: "", fileName: "" });
                            setUploadError(null);
                          }}
                        >
                          <SelectTrigger className="w-full" aria-label={`Tipo da mensagem ${index + 1}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(PART_TYPE_LABEL) as CampaignPartType[]).map((t) => (
                              <SelectItem key={t} value={t}>
                                {PART_TYPE_LABEL[t]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        title="Subir"
                        aria-label={`Subir mensagem ${index + 1}`}
                        disabled={index === 0}
                        onClick={() => movePart(index, -1)}
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        title="Descer"
                        aria-label={`Descer mensagem ${index + 1}`}
                        disabled={index === parts.length - 1}
                        onClick={() => movePart(index, 1)}
                      >
                        <ArrowDown className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        title="Remover"
                        aria-label={`Remover mensagem ${index + 1}`}
                        disabled={parts.length <= 1}
                        onClick={() => removePart(part.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>

                    {limits && (
                      <Field data-invalid={uploadError?.partId === part.id}>
                        <FieldLabel htmlFor={`campaign-part-url-${part.id}`}>Arquivo</FieldLabel>
                        <div className="flex gap-2">
                          <Input
                            id={`campaign-part-url-${part.id}`}
                            placeholder="https://… (ou envie um arquivo)"
                            value={part.mediaUrl ?? ""}
                            onChange={(e) => updatePart(part.id, { mediaUrl: e.target.value })}
                          />
                          <input
                            id={`campaign-part-file-${part.id}`}
                            type="file"
                            accept={limits.accept}
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) void handleFile(part, file, e.target);
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            disabled={uploading !== null}
                            onClick={() => document.getElementById(`campaign-part-file-${part.id}`)?.click()}
                          >
                            <Upload className="size-4" />
                            {isUploading ? `${uploading.pct}%` : "Enviar"}
                          </Button>
                        </div>
                        <FieldDescription>
                          {limits.label} até {formatBytes(limits.maxBytes)}.
                          {part.type === "audio" && " Áudio não tem legenda — use uma mensagem de texto antes ou depois."}
                        </FieldDescription>
                        {uploadError?.partId === part.id && (
                          <p className="text-sm text-destructive">{uploadError.message}</p>
                        )}
                      </Field>
                    )}

                    {part.type === "document" && (
                      <Field>
                        <FieldLabel htmlFor={`campaign-part-filename-${part.id}`}>
                          Nome do arquivo (como o contato vê)
                        </FieldLabel>
                        <Input
                          id={`campaign-part-filename-${part.id}`}
                          placeholder="catalogo.pdf"
                          value={part.fileName ?? ""}
                          onChange={(e) => updatePart(part.id, { fileName: e.target.value })}
                        />
                      </Field>
                    )}

                    {part.type !== "audio" && (
                      <Field>
                        <FieldLabel htmlFor={`campaign-part-text-${part.id}`}>
                          {part.type === "text" ? "Texto" : "Legenda (opcional)"}
                        </FieldLabel>
                        <div className="flex flex-wrap gap-1">
                          {CAMPAIGN_TEMPLATE_VARIABLES.map((v) => (
                            <Button
                              key={v.key}
                              type="button"
                              size="sm"
                              variant="outline"
                              title={v.description}
                              onClick={() => insertAtCursor(part, `{{${v.key}}}`)}
                            >
                              {`{{${v.key}}}`}
                            </Button>
                          ))}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => insertAtCursor(part, "{Olá|Oi|Tudo bem}")}
                          >
                            {"{variação}"}
                          </Button>
                        </div>
                        <Textarea
                          id={`campaign-part-text-${part.id}`}
                          rows={part.type === "text" ? 4 : 3}
                          maxLength={PART_TEXT_MAX_LENGTH}
                          value={part.text ?? ""}
                          onChange={(e) => updatePart(part.id, { text: e.target.value })}
                        />
                        {unknown.length > 0 && (
                          <p className="text-sm text-destructive">
                            Variável desconhecida: {unknown.map((v) => `{{${v}}}`).join(", ")}
                          </p>
                        )}
                      </Field>
                    )}
                  </div>
                );
              })}

              <div className="flex flex-wrap gap-2">
                {parts.length < MAX_CAMPAIGN_PARTS && (
                  <>
                    <Button type="button" size="sm" variant="outline" onClick={() => setParts((c) => [...c, newPart("text")])}>
                      <Plus className="size-4" />
                      Texto
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setParts((c) => [...c, newPart("image")])}>
                      <Plus className="size-4" />
                      Imagem
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setParts((c) => [...c, newPart("video")])}>
                      <Plus className="size-4" />
                      Vídeo
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setParts((c) => [...c, newPart("document")])}
                    >
                      <Plus className="size-4" />
                      Documento
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setParts((c) => [...c, newPart("audio")])}>
                      <Plus className="size-4" />
                      Áudio
                    </Button>
                  </>
                )}
              </div>

              {parts.length > 1 && (
                <div className="flex flex-wrap items-end gap-3">
                  <Field className="w-40">
                    <FieldLabel htmlFor="campaign-part-min">Intervalo mín. (s)</FieldLabel>
                    <Input
                      id="campaign-part-min"
                      type="number"
                      min={PART_INTERVAL_LIMITS.min}
                      max={PART_INTERVAL_LIMITS.max}
                      value={minGap}
                      onChange={(e) => setMinGap(Number(e.target.value))}
                    />
                  </Field>
                  <Field className="w-40">
                    <FieldLabel htmlFor="campaign-part-max">Intervalo máx. (s)</FieldLabel>
                    <Input
                      id="campaign-part-max"
                      type="number"
                      min={PART_INTERVAL_LIMITS.min}
                      max={PART_INTERVAL_LIMITS.max}
                      value={maxGap}
                      onChange={(e) => setMaxGap(Number(e.target.value))}
                    />
                  </Field>
                  <p className="pb-2 text-xs text-muted-foreground">
                    Espera aleatória entre uma mensagem e a próxima do mesmo contato (o intervalo entre contatos
                    continua o da configuração de disparo).
                  </p>
                </div>
              )}

              {partsError && (
                <p role="alert" className="text-sm text-destructive">
                  {partsError}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  Prévia para {previewContact.name}
                  <span className="font-normal text-muted-foreground">
                    {namePreview?.samples[0]
                      ? ` — nome vindo do(a) ${nameSourceLabel(previewContact.nameSource)}`
                      : " (contato de exemplo)"}
                  </span>
                </p>
                <Button type="button" size="sm" variant="ghost" onClick={() => setPreviewSeed((s) => s + 1)}>
                  <Shuffle className="size-4" />
                  Outra variação
                </Button>
              </div>

              <CampaignSequencePreview parts={preview} minGapSeconds={minGap} maxGapSeconds={maxGap} />

              {namePreview && (
                <p className="text-xs text-muted-foreground">
                  Nomes nesta lista ({namePreview.total} ativos):{" "}
                  {[
                    ...NAME_SOURCE_ORDER.filter((k) => (namePreview.bySource[k] ?? 0) > 0).map(
                      (k) => `${namePreview.bySource[k]} da ${CONTACT_NAME_SOURCE_LABEL[k]}`
                    ),
                    (namePreview.bySource.sem_nome ?? 0) > 0 ? `${namePreview.bySource.sem_nome} sem nome` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  .
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                <code>{"{{nome}}"}</code> usa o nome que a Z-API entrega: o salvo na agenda do WhatsApp deste
                número e, sem ele, o nome do perfil da pessoa (nome de CSV ou digitado à mão nunca é trocado).
                Contato sem nome: buscamos na Z-API na hora do envio; se ela também não tiver, vale o fallback{" "}
                <code>{"{{nome|cliente}}"}</code>.
              </p>
              {effectiveFooter && (
                <p className="text-xs text-muted-foreground">
                  {isCold
                    ? "Lista com contatos frios: a instrução de SAIR vai sempre, mesmo com o rodapé desligado nas Configurações de disparo."
                    : "O rodapé de descadastro é acrescentado automaticamente (configurável em Configurações de disparo)."}
                </p>
              )}
            </div>

            {isCold && (
              <div className="space-y-3 rounded-md border border-amber-500/50 bg-amber-500/5 p-3 text-sm">
                <p className="font-medium">
                  Atenção: {coldCount} contato(s) desta lista foram captados do Google (contato frio)
                </p>
                <p className="text-muted-foreground">
                  São empresas e profissionais que nunca falaram com você. Mensagem não solicitada é a principal
                  causa de denúncia e bloqueio do número. Por isso esta campanha terá: instrução de SAIR obrigatória,
                  limite diário de contatos frios e intervalo maior entre contatos (Configurações de disparo). Pela
                  LGPD, o envio se apoia no <strong>legítimo interesse</strong>: a oferta precisa ter relação com o
                  negócio de quem recebe, identificar a sua empresa e respeitar na hora quem pedir para sair.
                </p>
                {!identifiesBusiness && (
                  <p className="text-amber-700 dark:text-amber-400">
                    A primeira mensagem não identifica a sua empresa — inclua <code>{"{{empresa}}"}</code> (ex.:
                    &ldquo;Olá, aqui é da {"{{empresa}}"}…&rdquo;).
                  </p>
                )}
                <Label className="flex items-start gap-2 font-normal">
                  <Checkbox className="mt-0.5" checked={coldConfirmed} onCheckedChange={(v) => setColdConfirmed(v === true)} />
                  <span>
                    Confirmo que a mensagem é relevante para o negócio desses destinatários e identifica a minha
                    empresa como remetente.
                  </span>
                </Label>
              </div>
            )}

            {serverError && (
              <p role="alert" className="text-sm text-destructive">
                {serverError}
              </p>
            )}
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button type="submit" disabled={isSubmitting || uploading !== null || (isCold && !coldConfirmed)}>
              {isSubmitting ? "Criando…" : "Criar campanha"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
