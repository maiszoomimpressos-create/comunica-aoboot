"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { updateProfile } from "@/actions/account/update-profile";

const formSchema = z.object({ name: z.string().min(2, "Informe seu nome.") });
type FormValues = z.infer<typeof formSchema>;

export function ProfileForm({
  defaultValues,
  email,
}: {
  defaultValues: { name: string };
  email: string;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    setSaved(false);
    const result = await updateProfile(values);
    if (!result.success) {
      setServerError(result.error.message);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="max-w-sm">
      <FieldGroup>
        <Field>
          <FieldLabel>E-mail</FieldLabel>
          <Input value={email} disabled />
        </Field>

        <Field data-invalid={!!errors.name}>
          <FieldLabel htmlFor="name">Nome</FieldLabel>
          <Input id="name" {...register("name")} />
          <FieldError errors={[errors.name]} />
        </Field>

        {serverError && (
          <p role="alert" className="text-sm text-destructive">
            {serverError}
          </p>
        )}
        {saved && <p className="text-sm text-success">Perfil atualizado.</p>}

        <Field>
          <Button type="submit" disabled={isSubmitting} className="w-fit">
            {isSubmitting ? "Salvando…" : "Salvar"}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
