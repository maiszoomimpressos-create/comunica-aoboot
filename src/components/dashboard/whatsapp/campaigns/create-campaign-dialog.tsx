"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus } from "lucide-react";
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

const NO_MEDIA = "none";

const formSchema = z
  .object({
    name: z.string().min(1, "Informe um nome para a campanha."),
    messageText: z.string().min(1, "Informe o texto da mensagem."),
    listId: z.string().min(1, "Selecione uma lista."),
    mediaType: z.enum([NO_MEDIA, "image", "video"]),
    mediaUrl: z.string(),
  })
  .refine((v) => v.mediaType === NO_MEDIA || v.mediaUrl.trim().length > 0, {
    message: "Informe a URL da mídia.",
    path: ["mediaUrl"],
  });
type FormValues = z.infer<typeof formSchema>;

export function CreateCampaignDialog({
  tenantSlug,
  connectionId,
  lists,
}: {
  tenantSlug: string;
  connectionId: string;
  lists: ContactListSummary[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", messageText: "", listId: "", mediaType: NO_MEDIA, mediaUrl: "" },
  });
  const mediaType = useWatch({ control, name: "mediaType" });
  const eligibleLists = lists.filter((l) => l.memberCount > 0);

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const result = await createCampaignAction(tenantSlug, {
      connectionId,
      listId: values.listId,
      name: values.name,
      messageText: values.messageText,
      mediaType: values.mediaType === NO_MEDIA ? null : values.mediaType,
      mediaUrl: values.mediaType === NO_MEDIA ? null : values.mediaUrl,
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
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setServerError(null);
      }}
    >
      <DialogTrigger render={<Button size="sm" disabled={eligibleLists.length === 0} />}>
        <Plus className="size-4" />
        Nova campanha
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova campanha</DialogTitle>
          <DialogDescription>
            Cria a campanha como rascunho, com um destinatário por contato ativo da lista escolhida
            neste momento — o ritmo de envio usa a configuração de disparo da conexão.
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
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione uma lista" />
                    </SelectTrigger>
                    <SelectContent>
                      {eligibleLists.map((list) => (
                        <SelectItem key={list.id} value={list.id}>
                          {list.name} ({list.memberCount})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[errors.listId]} />
            </Field>

            <Field data-invalid={!!errors.messageText}>
              <FieldLabel htmlFor="campaign-message">Mensagem</FieldLabel>
              <Textarea id="campaign-message" rows={4} {...register("messageText")} />
              <FieldError errors={[errors.messageText]} />
            </Field>

            <Field>
              <FieldLabel>Mídia (opcional)</FieldLabel>
              <Controller
                name="mediaType"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_MEDIA}>Nenhuma — só texto</SelectItem>
                      <SelectItem value="image">Imagem</SelectItem>
                      <SelectItem value="video">Vídeo</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>

            {mediaType !== NO_MEDIA && (
              <Field data-invalid={!!errors.mediaUrl}>
                <FieldLabel htmlFor="campaign-media-url">URL da mídia</FieldLabel>
                <Input id="campaign-media-url" placeholder="https://…" {...register("mediaUrl")} />
                <FieldDescription>A mensagem acima vira a legenda.</FieldDescription>
                <FieldError errors={[errors.mediaUrl]} />
              </Field>
            )}

            {serverError && (
              <p role="alert" className="text-sm text-destructive">
                {serverError}
              </p>
            )}
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Criando…" : "Criar campanha"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
