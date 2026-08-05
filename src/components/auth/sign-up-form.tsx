"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
  FieldDescription,
} from "@/components/ui/field";
import { signUp } from "@/actions/auth/sign-up";

const formSchema = z.object({
  companyName: z.string().min(2, "Informe o nome da empresa."),
  userName: z.string().min(2, "Informe seu nome."),
  email: z.string().email("E-mail inválido."),
  password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres."),
});

type FormValues = z.infer<typeof formSchema>;

export function SignUpForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const result = await signUp(values);
    if (!result.success) {
      setServerError(result.error.message);
      return;
    }
    router.push(`/app/${result.data.tenantSlug}/dashboard`);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <div className="mb-2">
          <h1 className="text-2xl font-semibold tracking-tight">Criar sua conta</h1>
          <p className="text-sm text-muted-foreground">
            Comece agora — sem cartão de crédito.
          </p>
        </div>

        <Field data-invalid={!!errors.companyName}>
          <FieldLabel htmlFor="companyName">Nome da empresa</FieldLabel>
          <Input id="companyName" placeholder="Acme Inc." {...register("companyName")} />
          <FieldError errors={[errors.companyName]} />
        </Field>

        <Field data-invalid={!!errors.userName}>
          <FieldLabel htmlFor="userName">Seu nome</FieldLabel>
          <Input id="userName" placeholder="Maria Silva" {...register("userName")} />
          <FieldError errors={[errors.userName]} />
        </Field>

        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor="email">E-mail</FieldLabel>
          <Input id="email" type="email" placeholder="voce@empresa.com" {...register("email")} />
          <FieldError errors={[errors.email]} />
        </Field>

        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor="password">Senha</FieldLabel>
          <Input id="password" type="password" placeholder="••••••••" {...register("password")} />
          <FieldDescription>Mínimo de 8 caracteres.</FieldDescription>
          <FieldError errors={[errors.password]} />
        </Field>

        {serverError && (
          <p role="alert" className="text-sm text-destructive">
            {serverError}
          </p>
        )}

        <Field>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Criando conta…" : "Criar conta"}
          </Button>
          <FieldDescription className="text-center">
            Já tem uma conta?{" "}
            <Link href="/login" className="underline underline-offset-4">
              Entrar
            </Link>
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  );
}
