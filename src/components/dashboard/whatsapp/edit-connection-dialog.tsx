"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { updateWhatsappConnectionAction } from "@/actions/whatsapp/update-connection";

const formSchema = z.object({
  connectionName: z.string().min(1, "Informe o nome da conexão."),
  phoneNumber: z.string().min(1, "Informe o número do WhatsApp."),
});
type FormValues = z.infer<typeof formSchema>;

/** Tenant-facing edit: name/phone-number only — never touches Z-API
 * credentials (apiUrl/token stay admin-only, see /admin/whatsapp). */
export function EditConnectionDialog({
  tenantSlug,
  connectionId,
  defaultValues,
}: {
  tenantSlug: string;
  connectionId: string;
  defaultValues: { connectionName: string; phoneNumber: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const result = await updateWhatsappConnectionAction(tenantSlug, { connectionId, ...values });
    if (!result.success) {
      setServerError(result.error.message);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setServerError(null);
          reset(defaultValues);
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Pencil className="size-4" />
        Editar
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar conexão</DialogTitle>
          <DialogDescription>
            Só o nome e o número do WhatsApp — as credenciais técnicas continuam sob
            responsabilidade da nossa equipe.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field data-invalid={!!errors.connectionName}>
              <FieldLabel htmlFor="connectionName">Nome da conexão</FieldLabel>
              <Input id="connectionName" {...register("connectionName")} />
              <FieldError errors={[errors.connectionName]} />
            </Field>
            <Field data-invalid={!!errors.phoneNumber}>
              <FieldLabel htmlFor="phoneNumber">Número do WhatsApp</FieldLabel>
              <Input id="phoneNumber" placeholder="5511999999999" {...register("phoneNumber")} />
              <FieldDescription>
                Só números, sem espaço, traço ou parênteses: código do país + DDD + número.
              </FieldDescription>
              <FieldError errors={[errors.phoneNumber]} />
            </Field>
            {serverError && (
              <p role="alert" className="text-sm text-destructive">
                {serverError}
              </p>
            )}
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Salvando…" : "Salvar alterações"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
