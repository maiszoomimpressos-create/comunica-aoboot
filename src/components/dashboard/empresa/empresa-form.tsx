"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { updateTenantAction } from "@/actions/tenant/update-tenant";

const formSchema = z.object({
  name: z.string().min(2, "Informe o nome da empresa."),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use um hexadecimal, ex: #6d28d9.")
    .optional()
    .or(z.literal("")),
});
type FormValues = z.infer<typeof formSchema>;

export function EmpresaForm({
  tenantSlug,
  canEdit,
  defaultValues,
}: {
  tenantSlug: string;
  canEdit: boolean;
  defaultValues: { name: string; primaryColor: string };
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
    const result = await updateTenantAction(tenantSlug, values);
    if (!result.success) {
      setServerError(result.error.message);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="max-w-md">
      <FieldGroup>
        <Field data-invalid={!!errors.name}>
          <FieldLabel htmlFor="name">Nome da empresa</FieldLabel>
          <Input id="name" disabled={!canEdit} {...register("name")} />
          <FieldError errors={[errors.name]} />
        </Field>

        <Field data-invalid={!!errors.primaryColor}>
          <FieldLabel htmlFor="primaryColor">Cor de marca</FieldLabel>
          <Input id="primaryColor" placeholder="#6d28d9" disabled={!canEdit} {...register("primaryColor")} />
          <FieldDescription>Usada em elementos de destaque no futuro.</FieldDescription>
          <FieldError errors={[errors.primaryColor]} />
        </Field>

        {serverError && (
          <p role="alert" className="text-sm text-destructive">
            {serverError}
          </p>
        )}
        {saved && <p className="text-sm text-success">Alterações salvas.</p>}

        {canEdit && (
          <Field>
            <Button type="submit" disabled={isSubmitting} className="w-fit">
              {isSubmitting ? "Salvando…" : "Salvar alterações"}
            </Button>
          </Field>
        )}
      </FieldGroup>
    </form>
  );
}
