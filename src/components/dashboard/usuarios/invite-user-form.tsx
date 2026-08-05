"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inviteUserAction } from "@/actions/users/invite-user";

const formSchema = z.object({
  email: z.string().email("E-mail inválido."),
  role: z.string().min(1, "Selecione um papel."),
});
type FormValues = z.infer<typeof formSchema>;

export function InviteUserForm({
  tenantSlug,
  roles,
}: {
  tenantSlug: string;
  roles: { key: string; name: string }[];
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { role: roles.find((r) => r.key === "member")?.key ?? roles[0]?.key },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const result = await inviteUserAction(tenantSlug, values);
    if (!result.success) {
      setServerError(result.error.message);
      return;
    }
    router.push(`/app/${tenantSlug}/usuarios`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="max-w-sm">
      <FieldGroup>
        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor="email">E-mail</FieldLabel>
          <Input id="email" type="email" placeholder="pessoa@empresa.com" {...register("email")} />
          <FieldError errors={[errors.email]} />
        </Field>

        <Field data-invalid={!!errors.role}>
          <FieldLabel>Papel</FieldLabel>
          <Controller
            name="role"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione um papel" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.key} value={role.key}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError errors={[errors.role]} />
        </Field>

        {serverError && (
          <p role="alert" className="text-sm text-destructive">
            {serverError}
          </p>
        )}

        <Field>
          <Button type="submit" disabled={isSubmitting} className="w-fit">
            {isSubmitting ? "Convidando…" : "Enviar convite"}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
