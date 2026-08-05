"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { changePassword } from "@/actions/account/change-password";
import { passwordSchema } from "@/lib/auth/password-policy";
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter";

const formSchema = z.object({
  currentPassword: z.string().min(1, "Informe sua senha atual."),
  newPassword: passwordSchema,
});
type FormValues = z.infer<typeof formSchema>;

export function SecurityForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });
  const newPassword = useWatch({ control, name: "newPassword" });

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
          <PasswordStrengthMeter password={newPassword ?? ""} />
          <FieldDescription>Outras sessões serão encerradas.</FieldDescription>
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
