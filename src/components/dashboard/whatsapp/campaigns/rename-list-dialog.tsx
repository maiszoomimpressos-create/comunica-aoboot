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
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { renameContactListAction } from "@/actions/campaigns/rename-list";

const formSchema = z.object({ name: z.string().min(1, "Informe um nome para a lista.") });
type FormValues = z.infer<typeof formSchema>;

export function RenameListDialog({
  tenantSlug,
  listId,
  currentName,
}: {
  tenantSlug: string;
  listId: string;
  currentName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { name: currentName } });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const result = await renameContactListAction(tenantSlug, { listId, ...values });
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
          reset({ name: currentName });
        }
      }}
    >
      <DialogTrigger render={<Button variant="ghost" size="sm" title="Renomear lista" />}>
        <Pencil className="size-4" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Renomear lista</DialogTitle>
          <DialogDescription>O número de origem dos contatos não muda — só o nome da lista.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="rename-list-name">Nome da lista</FieldLabel>
              <Input id="rename-list-name" {...register("name")} />
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
              {isSubmitting ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
