"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller, useWatch, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
import { DEFAULT_OPT_OUT_FOOTER } from "@/config/whatsapp-campaign-defaults";
import { COLD_LIMITS } from "@/lib/campaigns/cold-outreach";

const formSchema = z
  .object({
    sendWindowStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido."),
    sendWindowEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido."),
    // Números via register(..., { valueAsNumber: true }) — não z.coerce,
    // que deixa o tipo de entrada do resolver como `unknown` e quebra o
    // generic do zodResolver (input/output precisam bater).
    batchSize: z.number().int().min(1, "Mínimo 1."),
    minMessageIntervalSeconds: z.number().int().min(5, "Mínimo 5 s."),
    maxMessageIntervalSeconds: z.number().int().min(5, "Mínimo 5 s."),
    minBatchPauseSeconds: z.number().int().min(0, "Mínimo 0."),
    maxBatchPauseSeconds: z.number().int().min(0, "Mínimo 0."),
    // Vazio = sem limite diário.
    dailyLimit: z.string(),
    maxConsecutiveErrors: z.number().int().min(1, "Mínimo 1."),
    maxAttempts: z.number().int().min(1, "Mínimo 1.").max(10, "Máximo 10."),
    campaignsEnabled: z.boolean(),
    warmupEnabled: z.boolean(),
    verifyNumbersBeforeSend: z.boolean(),
    optOutFooterEnabled: z.boolean(),
    optOutFooterText: z.string().max(200, "No máximo 200 caracteres."),
    coldDailyLimit: z.number().int().min(1, "Mínimo 1.").max(COLD_LIMITS.dailyLimitMax, `Máximo ${COLD_LIMITS.dailyLimitMax}.`),
    coldMinMessageIntervalSeconds: z.number().int().min(COLD_LIMITS.minIntervalFloor, `Mínimo ${COLD_LIMITS.minIntervalFloor} s.`),
    coldMaxMessageIntervalSeconds: z.number().int().min(COLD_LIMITS.minIntervalFloor, `Mínimo ${COLD_LIMITS.minIntervalFloor} s.`),
  })
  .refine((v) => v.coldMinMessageIntervalSeconds <= v.coldMaxMessageIntervalSeconds, {
    message: "O mínimo não pode ser maior que o máximo.",
    path: ["coldMaxMessageIntervalSeconds"],
  })
  .refine((v) => !v.optOutFooterText.trim() || /\bSAIR\b/i.test(v.optOutFooterText), {
    message: 'O rodapé precisa mencionar a palavra "SAIR".',
    path: ["optOutFooterText"],
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

function ToggleField({
  control,
  name,
  label,
  description,
}: {
  control: Control<FormValues>;
  name: "campaignsEnabled" | "warmupEnabled" | "verifyNumbersBeforeSend" | "optOutFooterEnabled";
  label: string;
  description: string;
}) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <Label className="flex items-start gap-2 text-sm font-normal">
          <Checkbox className="mt-0.5" checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
          <span>
            <span className="font-medium">{label}</span>
            <span className="block text-muted-foreground">{description}</span>
          </span>
        </Label>
      )}
    />
  );
}

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
    control,
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
      maxAttempts: settings.maxAttempts,
      campaignsEnabled: settings.campaignsEnabled,
      warmupEnabled: settings.warmupEnabled,
      verifyNumbersBeforeSend: settings.verifyNumbersBeforeSend,
      optOutFooterEnabled: settings.optOutFooterEnabled,
      optOutFooterText: settings.optOutFooterText ?? "",
      coldDailyLimit: settings.coldDailyLimit,
      coldMinMessageIntervalSeconds: settings.coldMinMessageIntervalSeconds,
      coldMaxMessageIntervalSeconds: settings.coldMaxMessageIntervalSeconds,
    },
  });

  const footerEnabled = useWatch({ control, name: "optOutFooterEnabled" });

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
      maxAttempts: values.maxAttempts,
      campaignsEnabled: values.campaignsEnabled,
      warmupEnabled: values.warmupEnabled,
      verifyNumbersBeforeSend: values.verifyNumbersBeforeSend,
      optOutFooterEnabled: values.optOutFooterEnabled,
      optOutFooterText: values.optOutFooterText.trim() || null,
      coldDailyLimit: values.coldDailyLimit,
      coldMinMessageIntervalSeconds: values.coldMinMessageIntervalSeconds,
      coldMaxMessageIntervalSeconds: values.coldMaxMessageIntervalSeconds,
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
      <DialogContent className="max-h-[90vh] overflow-y-auto">
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
                <Input id="minMessageIntervalSeconds" type="number" min={5} {...register("minMessageIntervalSeconds", { valueAsNumber: true })} />
                <FieldError errors={[errors.minMessageIntervalSeconds]} />
              </Field>
              <Field data-invalid={!!errors.maxMessageIntervalSeconds}>
                <FieldLabel htmlFor="maxMessageIntervalSeconds">Intervalo máx. (s)</FieldLabel>
                <Input id="maxMessageIntervalSeconds" type="number" min={5} {...register("maxMessageIntervalSeconds", { valueAsNumber: true })} />
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
              <FieldDescription>
                Padrão 200. Deixe em branco para não ter limite (não recomendado). Números novos ainda
                seguem o aquecimento abaixo, mesmo com limite maior.
              </FieldDescription>
            </Field>

            <Field data-invalid={!!errors.maxConsecutiveErrors}>
              <FieldLabel htmlFor="maxConsecutiveErrors">Pausar após quantas falhas seguidas</FieldLabel>
              <Input id="maxConsecutiveErrors" type="number" min={1} {...register("maxConsecutiveErrors", { valueAsNumber: true })} />
              <FieldDescription>Proteção contra problema operacional (token inválido, instância caiu).</FieldDescription>
              <FieldError errors={[errors.maxConsecutiveErrors]} />
            </Field>

            <Field data-invalid={!!errors.maxAttempts}>
              <FieldLabel htmlFor="maxAttempts">Tentativas por contato</FieldLabel>
              <Input id="maxAttempts" type="number" min={1} max={10} {...register("maxAttempts", { valueAsNumber: true })} />
              <FieldDescription>
                Só erros temporários (instância fora do ar, limite da API, timeout) são tentados de novo, com
                espera crescente. Erro definitivo falha na hora.
              </FieldDescription>
              <FieldError errors={[errors.maxAttempts]} />
            </Field>

            <div className="space-y-3">
              <ToggleField
                control={control}
                name="campaignsEnabled"
                label="Campanhas ligadas neste número"
                description="Desligado, nenhuma campanha deste número envia (as em andamento param na próxima mensagem)."
              />
              <ToggleField
                control={control}
                name="warmupEnabled"
                label="Aquecimento de número novo"
                description="Nos primeiros 10 dias de envio o limite diário sobe aos poucos (30, 50, 80… 650)."
              />
              <ToggleField
                control={control}
                name="verifyNumbersBeforeSend"
                label="Verificar se o número tem WhatsApp antes de enviar"
                description="Números sem WhatsApp são marcados e não recebem — lista ruim pausa a campanha sozinha."
              />
              <ToggleField
                control={control}
                name="optOutFooterEnabled"
                label="Rodapé de descadastro"
                description="Acrescenta uma linha dizendo como sair. Quem responder SAIR (ou PARAR) nunca mais recebe campanhas da empresa. Em campanhas com contatos frios (captados do Google) o rodapé é obrigatório e vai mesmo desligado aqui."
              />
            </div>

            {footerEnabled && (
              <Field data-invalid={!!errors.optOutFooterText}>
                <FieldLabel htmlFor="optOutFooterText">Texto do rodapé</FieldLabel>
                <Input id="optOutFooterText" placeholder={DEFAULT_OPT_OUT_FOOTER} {...register("optOutFooterText")} />
                <FieldDescription>Em branco usa o padrão. Precisa conter &ldquo;SAIR&rdquo;.</FieldDescription>
                <FieldError errors={[errors.optOutFooterText]} />
              </Field>
            )}

            <div className="space-y-3 rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Contatos frios (captados do Google)</p>
                <p className="text-xs text-muted-foreground">
                  Valem para campanhas cujas listas têm contato captado do Google: teto diário próprio (além do
                  limite diário e do aquecimento acima — vale o menor), intervalo maior entre contatos e rodapé
                  de SAIR sempre ligado.
                </p>
              </div>
              <Field data-invalid={!!errors.coldDailyLimit}>
                <FieldLabel htmlFor="coldDailyLimit">Contatos frios por dia</FieldLabel>
                <Input
                  id="coldDailyLimit"
                  type="number"
                  min={1}
                  max={COLD_LIMITS.dailyLimitMax}
                  {...register("coldDailyLimit", { valueAsNumber: true })}
                />
                <FieldError errors={[errors.coldDailyLimit]} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field data-invalid={!!errors.coldMinMessageIntervalSeconds}>
                  <FieldLabel htmlFor="coldMin">Intervalo mín. (s)</FieldLabel>
                  <Input
                    id="coldMin"
                    type="number"
                    min={COLD_LIMITS.minIntervalFloor}
                    {...register("coldMinMessageIntervalSeconds", { valueAsNumber: true })}
                  />
                  <FieldError errors={[errors.coldMinMessageIntervalSeconds]} />
                </Field>
                <Field data-invalid={!!errors.coldMaxMessageIntervalSeconds}>
                  <FieldLabel htmlFor="coldMax">Intervalo máx. (s)</FieldLabel>
                  <Input
                    id="coldMax"
                    type="number"
                    min={COLD_LIMITS.minIntervalFloor}
                    {...register("coldMaxMessageIntervalSeconds", { valueAsNumber: true })}
                  />
                  <FieldError errors={[errors.coldMaxMessageIntervalSeconds]} />
                </Field>
              </div>
            </div>

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
