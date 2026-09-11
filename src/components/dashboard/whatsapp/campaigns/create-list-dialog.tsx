"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus } from "lucide-react";
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
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { createContactListAction } from "@/actions/campaigns/create-list";

const formSchema = z.object({ name: z.string().min(1, "Informe um nome para a lista.") });
type FormValues = z.infer<typeof formSchema>;

export function CreateListDialog({ tenantSlug, connectionId }: { tenantSlug: string; connectionId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { name: "" } });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const result = await createContactListAction(tenantSlug, { connectionId, ...values });
    if (!result.success) {
      setServerError(result.error.message);
      return;
    }
    setOpen(false);
    reset();
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setServerError(null);
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-4" />
        Nova lista
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova lista de contatos</DialogTitle>
          <DialogDescription>Dá pra adicionar contatos a ela depois de criada.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="name">Nome da lista</FieldLabel>
              <Input id="name" placeholder="Clientes ativos" {...register("name")} />
              <FieldError errors={[errors.name]} />
            </Field>
            {serverError && (
              <p role="alert" className="text-sm text-destructive">
                {serverError}
              </p>
            )}
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Criando…" : "Criar lista"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
