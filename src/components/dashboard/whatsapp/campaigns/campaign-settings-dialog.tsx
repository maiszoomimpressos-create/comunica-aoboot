"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { updateCampaignSettingsAction } from "@/actions/campaigns/update-campaign-settings";
import type { ConnectionCampaignSettingsRow } from "@/repositories/connection-campaign-settings.repository";

const formSchema = z
  .object({
    sendWindowStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido."),
    sendWindowEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido."),
    // Números via register(..., { valueAsNumber: true }) — não z.coerce,
    // que deixa o tipo de entrada do resolver como `unknown` e quebra o
    // generic do zodResolver (input/output precisam bater).
    batchSize: z.number().int().min(1, "Mínimo 1."),
    minMessageIntervalSeconds: z.number().int().min(1, "Mínimo 1."),
    maxMessageIntervalSeconds: z.number().int().min(1, "Mínimo 1."),
    minBatchPauseSeconds: z.number().int().min(0, "Mínimo 0."),
    maxBatchPauseSeconds: z.number().int().min(0, "Mínimo 0."),
    // Vazio = sem limite diário.
    dailyLimit: z.string(),
    maxConsecutiveErrors: z.number().int().min(1, "Mínimo 1."),
  })
  .refine((v) => v.sendWindowStart < v.sendWindowEnd, {
    message: "O início precisa ser antes do fim.",
    path: ["sendWindowEnd"],
  })
  .refine((v) => v.minMessageIntervalSeconds <= v.maxMessageIntervalSeconds, {
    message: "O mínimo não pode ser maior que o máximo.",
    path: ["maxMessageIntervalSeconds"],
  })
  .refine((v) => v.minBatchPauseSeconds <= v.maxBatchPauseSeconds, {
    message: "O mínimo não pode ser maior que o máximo.",
    path: ["maxBatchPauseSeconds"],
  });
type FormValues = z.infer<typeof formSchema>;

export function CampaignSettingsDialog({
  tenantSlug,
  connectionId,
  settings,
}: {
  tenantSlug: string;
  connectionId: string;
  settings: ConnectionCampaignSettingsRow;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      sendWindowStart: settings.sendWindowStart,
      sendWindowEnd: settings.sendWindowEnd,
      batchSize: settings.batchSize,
      minMessageIntervalSeconds: settings.minMessageIntervalSeconds,
      maxMessageIntervalSeconds: settings.maxMessageIntervalSeconds,
      minBatchPauseSeconds: settings.minBatchPauseSeconds,
      maxBatchPauseSeconds: settings.maxBatchPauseSeconds,
      dailyLimit: settings.dailyLimit?.toString() ?? "",
      maxConsecutiveErrors: settings.maxConsecutiveErrors,
    },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const dailyLimit = values.dailyLimit.trim() === "" ? null : Number(values.dailyLimit);
    const result = await updateCampaignSettingsAction(tenantSlug, {
      connectionId,
      sendWindowStart: values.sendWindowStart,
      sendWindowEnd: values.sendWindowEnd,
      batchSize: values.batchSize,
      minMessageIntervalSeconds: values.minMessageIntervalSeconds,
      maxMessageIntervalSeconds: values.maxMessageIntervalSeconds,
      minBatchPauseSeconds: values.minBatchPauseSeconds,
      maxBatchPauseSeconds: values.maxBatchPauseSeconds,
      dailyLimit,
      maxConsecutiveErrors: values.maxConsecutiveErrors,
    });
    if (!result.success) {
      setServerError(result.error.message);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setServerError(null);
          reset();
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Settings2 className="size-4" />
        Configurações de disparo
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configurações de disparo desta conexão</DialogTitle>
          <DialogDescription>
            Vale para todas as campanhas desta conexão (uma por vez). Horários no fuso de São Paulo.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <div className="grid grid-cols-2 gap-3">
              <Field data-invalid={!!errors.sendWindowStart}>
                <FieldLabel htmlFor="sendWindowStart">Início da janela</FieldLabel>
                <Input id="sendWindowStart" type="time" {...register("sendWindowStart")} />
                <FieldError errors={[errors.sendWindowStart]} />
              </Field>
              <Field data-invalid={!!errors.sendWindowEnd}>
                <FieldLabel htmlFor="sendWindowEnd">Fim da janela</FieldLabel>
                <Input id="sendWindowEnd" type="time" {...register("sendWindowEnd")} />
                <FieldError errors={[errors.sendWindowEnd]} />
              </Field>
            </div>

            <Field data-invalid={!!errors.batchSize}>
              <FieldLabel htmlFor="batchSize">Mensagens por lote</FieldLabel>
              <Input id="batchSize" type="number" min={1} {...register("batchSize", { valueAsNumber: true })} />
              <FieldError errors={[errors.batchSize]} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field data-invalid={!!errors.minMessageIntervalSeconds}>
                <FieldLabel htmlFor="minMessageIntervalSeconds">Intervalo mín. (s)</FieldLabel>
                <Input id="minMessageIntervalSeconds" type="number" min={1} {...register("minMessageIntervalSeconds", { valueAsNumber: true })} />
                <FieldError errors={[errors.minMessageIntervalSeconds]} />
              </Field>
              <Field data-invalid={!!errors.maxMessageIntervalSeconds}>
                <FieldLabel htmlFor="maxMessageIntervalSeconds">Intervalo máx. (s)</FieldLabel>
                <Input id="maxMessageIntervalSeconds" type="number" min={1} {...register("maxMessageIntervalSeconds", { valueAsNumber: true })} />
                <FieldError errors={[errors.maxMessageIntervalSeconds]} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field data-invalid={!!errors.minBatchPauseSeconds}>
                <FieldLabel htmlFor="minBatchPauseSeconds">Pausa entre lotes mín. (s)</FieldLabel>
                <Input id="minBatchPauseSeconds" type="number" min={0} {...register("minBatchPauseSeconds", { valueAsNumber: true })} />
                <FieldError errors={[errors.minBatchPauseSeconds]} />
              </Field>
              <Field data-invalid={!!errors.maxBatchPauseSeconds}>
                <FieldLabel htmlFor="maxBatchPauseSeconds">Pausa entre lotes máx. (s)</FieldLabel>
                <Input id="maxBatchPauseSeconds" type="number" min={0} {...register("maxBatchPauseSeconds", { valueAsNumber: true })} />
                <FieldError errors={[errors.maxBatchPauseSeconds]} />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="dailyLimit">Limite diário de envios</FieldLabel>
              <Input id="dailyLimit" type="number" min={1} placeholder="Sem limite" {...register("dailyLimit")} />
              <FieldDescription>Deixe em branco para não ter limite.</FieldDescription>
            </Field>

            <Field data-invalid={!!errors.maxConsecutiveErrors}>
              <FieldLabel htmlFor="maxConsecutiveErrors">Pausar após quantas falhas seguidas</FieldLabel>
              <Input id="maxConsecutiveErrors" type="number" min={1} {...register("maxConsecutiveErrors", { valueAsNumber: true })} />
              <FieldDescription>Proteção contra problema operacional (token inválido, instância caiu).</FieldDescription>
              <FieldError errors={[errors.maxConsecutiveErrors]} />
            </Field>

            {serverError && (
              <p role="alert" className="text-sm text-destructive">
                {serverError}
              </p>
            )}
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
