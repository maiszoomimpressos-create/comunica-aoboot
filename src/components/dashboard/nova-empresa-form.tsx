"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { createAdditionalTenant } from "@/actions/tenant/create-additional-tenant";

const formSchema = z.object({ companyName: z.string().min(2, "Informe o nome da empresa.") });
type FormValues = z.infer<typeof formSchema>;

export function NovaEmpresaForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const result = await createAdditionalTenant(values);
    if (!result.success) {
      setServerError(result.error.message);
      return;
    }
    router.push(`/app/${result.data.tenantSlug}/dashboard`);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <Field data-invalid={!!errors.companyName}>
          <FieldLabel htmlFor="companyName">Nome da empresa</FieldLabel>
          <Input id="companyName" placeholder="Acme Inc." {...register("companyName")} />
          <FieldError errors={[errors.companyName]} />
        </Field>

        {serverError && (
          <p role="alert" className="text-sm text-destructive">
            {serverError}
          </p>
        )}

        <Field>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Criando…" : "Criar empresa"}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
