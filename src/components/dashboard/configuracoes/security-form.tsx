"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { changePassword } from "@/actions/account/change-password";

const formSchema = z.object({
  currentPassword: z.string().min(1, "Informe sua senha atual."),
  newPassword: z.string().min(8, "A nova senha precisa ter pelo menos 8 caracteres."),
});
type FormValues = z.infer<typeof formSchema>;

export function SecurityForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    setSaved(false);
    const result = await changePassword(values);
    if (!result.success) {
      setServerError(result.error.message);
      return;
    }
    setSaved(true);
    reset();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="max-w-sm">
      <FieldGroup>
        <Field data-invalid={!!errors.currentPassword}>
          <FieldLabel htmlFor="currentPassword">Senha atual</FieldLabel>
          <Input id="currentPassword" type="password" {...register("currentPassword")} />
          <FieldError errors={[errors.currentPassword]} />
        </Field>

        <Field data-invalid={!!errors.newPassword}>
          <FieldLabel htmlFor="newPassword">Nova senha</FieldLabel>
          <Input id="newPassword" type="password" {...register("newPassword")} />
          <FieldDescription>Mínimo de 8 caracteres. Outras sessões serão encerradas.</FieldDescription>
          <FieldError errors={[errors.newPassword]} />
        </Field>

        {serverError && (
          <p role="alert" className="text-sm text-destructive">
            {serverError}
          </p>
        )}
        {saved && <p className="text-sm text-success">Senha alterada.</p>}

        <Field>
          <Button type="submit" disabled={isSubmitting} className="w-fit">
            {isSubmitting ? "Salvando…" : "Alterar senha"}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
