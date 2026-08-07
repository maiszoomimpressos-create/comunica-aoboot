"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { sendTestMessageAction } from "@/actions/whatsapp/send-test-message";

const formSchema = z.object({
  to: z.string().min(8, "Informe um número válido (DDI + DDD + número)."),
  message: z.string().min(1, "Informe a mensagem."),
});
type FormValues = z.infer<typeof formSchema>;

/** Reused both on the connection management list and right after the
 * connect wizard finishes — sends one message, shows the raw provider
 * response, never persists any history (out of scope for this phase). */
export function SendTestMessageForm({
  tenantSlug,
  connectionId,
}: {
  tenantSlug: string;
  connectionId: string;
}) {
  const [result, setResult] = useState<{ ok: boolean; message: string; raw?: unknown } | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  async function onSubmit(values: FormValues) {
    setResult(null);
    const response = await sendTestMessageAction(tenantSlug, { connectionId, ...values });
    if (!response.success) {
      setResult({ ok: false, message: response.error.message });
      return;
    }
    setResult(response.data);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <FieldGroup>
        <Field data-invalid={!!errors.to}>
          <FieldLabel htmlFor={`to-${connectionId}`}>Número de destino</FieldLabel>
          <Input id={`to-${connectionId}`} placeholder="5511999999999" {...register("to")} />
          <FieldDescription>
            Só números, sem espaço, traço ou parênteses: código do país + DDD + número. Exemplo
            para (11) 99999-9999 → <strong className="text-foreground">5511999999999</strong>.
          </FieldDescription>
          <FieldError errors={[errors.to]} />
        </Field>
        <Field data-invalid={!!errors.message}>
          <FieldLabel htmlFor={`message-${connectionId}`}>Mensagem</FieldLabel>
          <Textarea
            id={`message-${connectionId}`}
            rows={3}
            placeholder="Mensagem de teste enviada pela Boot Whats."
            {...register("message")}
          />
          <FieldError errors={[errors.message]} />
        </Field>
        <Field>
          <Button type="submit" disabled={isSubmitting} className="w-fit">
            {isSubmitting ? "Enviando…" : "Enviar mensagem de teste"}
          </Button>
        </Field>
      </FieldGroup>

      {result && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <p className={result.ok ? "text-sm text-success" : "text-sm text-destructive"}>
            {result.ok ? "Enviado com sucesso." : `Erro de envio: ${result.message}`}
          </p>
          {result.raw !== undefined && (
            <pre className="max-h-40 overflow-auto rounded-md bg-muted p-2 text-xs text-muted-foreground">
              {JSON.stringify(result.raw, null, 2)}
            </pre>
          )}
        </div>
      )}
    </form>
  );
}
