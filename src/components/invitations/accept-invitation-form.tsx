"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import {
  acceptInvitationAsExistingUser,
  acceptInvitationAsNewUser,
} from "@/actions/invitations/accept-invitation";

const formSchema = z.object({
  name: z.string().min(2, "Informe seu nome."),
  password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres."),
});
type FormValues = z.infer<typeof formSchema>;

export function AcceptInvitationForm({
  invitationId,
  email,
  tenantName,
  mode,
}: {
  invitationId: string;
  email: string;
  tenantName: string;
  mode: "new-user" | "existing-user-signed-in" | "existing-user-needs-login";
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  async function onSubmitNewUser(values: FormValues) {
    setServerError(null);
    const result = await acceptInvitationAsNewUser({ invitationId, ...values });
    if (!result.success) {
      setServerError(result.error.message);
      return;
    }
    router.push(`/app/${result.data.tenantSlug}/dashboard`);
  }

  async function handleAcceptSignedIn() {
    setServerError(null);
    setLoading(true);
    const result = await acceptInvitationAsExistingUser(invitationId);
    setLoading(false);
    if (!result.success) {
      setServerError(result.error.message);
      return;
    }
    router.push(`/app/${result.data.tenantSlug}/dashboard`);
  }

  if (mode === "existing-user-needs-login") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Já existe uma conta com o e-mail <strong>{email}</strong>. Faça login para aceitar o
          convite para <strong>{tenantName}</strong>.
        </p>
        <Button nativeButton={false} render={<Link href={`/login?next=/convite/${invitationId}`} />}>
          Entrar para aceitar
        </Button>
      </div>
    );
  }

  if (mode === "existing-user-signed-in") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Você foi convidado(a) para <strong>{tenantName}</strong>.
        </p>
        {serverError && <p className="text-sm text-destructive">{serverError}</p>}
        <Button onClick={handleAcceptSignedIn} disabled={loading}>
          {loading ? "Entrando…" : "Aceitar convite"}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmitNewUser)} noValidate>
      <FieldGroup>
        <p className="text-sm text-muted-foreground">
          Você foi convidado(a) para <strong>{tenantName}</strong>. Crie sua senha para entrar.
        </p>

        <Field>
          <FieldLabel>E-mail</FieldLabel>
          <Input value={email} disabled />
        </Field>

        <Field data-invalid={!!errors.name}>
          <FieldLabel htmlFor="name">Seu nome</FieldLabel>
          <Input id="name" {...register("name")} />
          <FieldError errors={[errors.name]} />
        </Field>

        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor="password">Senha</FieldLabel>
          <Input id="password" type="password" {...register("password")} />
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
            {isSubmitting ? "Entrando…" : "Aceitar e criar conta"}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
