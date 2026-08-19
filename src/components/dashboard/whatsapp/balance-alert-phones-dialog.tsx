"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BellRing } from "lucide-react";
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
import { updateBalanceAlertPhonesAction } from "@/actions/whatsapp/update-balance-alert-phones";

const PHONE_REGEX = /^\d{10,}$/;

const formSchema = z.object({
  phone1: z.string().regex(PHONE_REGEX, "Só dígitos, DDI + DDD + número.").or(z.literal("")),
  phone2: z.string().regex(PHONE_REGEX, "Só dígitos, DDI + DDD + número.").or(z.literal("")),
  phone3: z.string().regex(PHONE_REGEX, "Só dígitos, DDI + DDD + número.").or(z.literal("")),
});
type FormValues = z.infer<typeof formSchema>;

function toFormValues(phones: string[]): FormValues {
  return { phone1: phones[0] ?? "", phone2: phones[1] ?? "", phone3: phones[2] ?? "" };
}

/**
 * Tenant-facing: registers up to 3 fixed phone numbers that receive the
 * balance-alert message when the tenant's own external system calls
 * POST /api/v1/whatsapp/balance-alert. Deliberately separate from
 * EditConnectionDialog — different concern (who gets alerted, not the
 * connection's own identity).
 */
export function BalanceAlertPhonesDialog({
  tenantSlug,
  connectionId,
  defaultPhones,
}: {
  tenantSlug: string;
  connectionId: string;
  defaultPhones: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const defaultValues = toFormValues(defaultPhones);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const phones = [values.phone1, values.phone2, values.phone3].map((p) => p.trim()).filter(Boolean);
    const result = await updateBalanceAlertPhonesAction(tenantSlug, { connectionId, phones });
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
        <BellRing className="size-4" />
        Alertas de saldo
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Alertas de saldo baixo</DialogTitle>
          <DialogDescription>
            Números que recebem um aviso por WhatsApp quando seu sistema externo reporta saldo
            baixo. Deixe em branco os que não usar.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            {(["phone1", "phone2", "phone3"] as const).map((name, i) => (
              <Field key={name} data-invalid={!!errors[name]}>
                <FieldLabel htmlFor={name}>Número {i + 1}</FieldLabel>
                <Input id={name} placeholder="5511999999999" {...register(name)} />
                <FieldError errors={[errors[name]]} />
              </Field>
            ))}
            <FieldDescription>
              Só números, sem espaço, traço ou parênteses: código do país + DDD + número.
            </FieldDescription>
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
