"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { requestPasswordReset } from "@/actions/auth/request-password-reset";

const formSchema = z.object({ email: z.string().email("E-mail inválido.") });
type FormValues = z.infer<typeof formSchema>;

export function RequestPasswordResetForm() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  async function onSubmit(values: FormValues) {
    await requestPasswordReset(values);
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Verifique seu e-mail</h1>
        <p className="text-sm text-muted-foreground">
          Se houver uma conta com esse e-mail, enviamos um link para redefinir a senha.
        </p>
        <Link href="/login" className="text-sm underline underline-offset-4">
          Voltar para o login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <div className="mb-2">
          <h1 className="text-2xl font-semibold tracking-tight">Recuperar senha</h1>
          <p className="text-sm text-muted-foreground">
            Informe seu e-mail e enviaremos um link de redefinição.
          </p>
        </div>

        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor="email">E-mail</FieldLabel>
          <Input id="email" type="email" placeholder="voce@empresa.com" {...register("email")} />
          <FieldError errors={[errors.email]} />
        </Field>

        <Field>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Enviando…" : "Enviar link"}
          </Button>
          <FieldDescription className="text-center">
            <Link href="/login" className="underline underline-offset-4">
              Voltar para o login
            </Link>
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  );
}
