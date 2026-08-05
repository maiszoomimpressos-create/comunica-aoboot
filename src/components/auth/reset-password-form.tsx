"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { resetPassword } from "@/actions/auth/reset-password";

const formSchema = z.object({
  newPassword: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres."),
});
type FormValues = z.infer<typeof formSchema>;

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const result = await resetPassword({ token, newPassword: values.newPassword });
    if (!result.success) {
      setServerError(result.error.message);
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/login"), 1500);
  }

  if (done) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Senha redefinida</h1>
        <p className="text-sm text-muted-foreground">Redirecionando para o login…</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <div className="mb-2">
          <h1 className="text-2xl font-semibold tracking-tight">Definir nova senha</h1>
        </div>

        <Field data-invalid={!!errors.newPassword}>
          <FieldLabel htmlFor="newPassword">Nova senha</FieldLabel>
          <Input id="newPassword" type="password" placeholder="••••••••" {...register("newPassword")} />
          <FieldDescription>Mínimo de 8 caracteres.</FieldDescription>
          <FieldError errors={[errors.newPassword]} />
        </Field>

        {serverError && (
          <p role="alert" className="text-sm text-destructive">
            {serverError}
          </p>
        )}

        <Field>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Salvando…" : "Salvar nova senha"}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
