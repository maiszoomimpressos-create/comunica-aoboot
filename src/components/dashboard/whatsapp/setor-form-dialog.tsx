"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { createSetorAction } from "@/actions/whatsapp/create-setor";
import { updateSetorAction } from "@/actions/whatsapp/update-setor";

const PHONE_REGEX = /^\d{10,}$/;

const formSchema = z.object({
  name: z.string().min(1, "Informe o nome do setor."),
  description: z.string().optional(),
  attendants: z
    .array(
      z.object({
        phone: z.string().regex(PHONE_REGEX, "Só dígitos, DDI + DDD + número."),
        label: z.string().optional(),
      })
    )
    .min(1, "Adicione ao menos um número."),
});
type FormValues = z.infer<typeof formSchema>;

type SetorFormDialogProps =
  | { mode: "create"; tenantSlug: string; connectionId: string }
  | {
      mode: "edit";
      tenantSlug: string;
      setorId: string;
      defaultValues: { name: string; description: string | null; attendants: { phone: string; label: string | null }[] };
    };

/** Cria ou edita um setor (nome + descrição pra IA + pool de atendentes) —
 * primeiro uso de `useFieldArray` no código, pro pool sem limite de
 * números (ver whatsapp-attendant-handoff-mechanism na memória do projeto:
 * "pode ter um ou mais"). */
export function SetorFormDialog(props: SetorFormDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const defaultValues: FormValues =
    props.mode === "edit"
      ? {
          name: props.defaultValues.name,
          description: props.defaultValues.description ?? "",
          attendants: props.defaultValues.attendants.map((a) => ({ phone: a.phone, label: a.label ?? "" })),
        }
      : { name: "", description: "", attendants: [{ phone: "", label: "" }] };

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues });
  const { fields, append, remove } = useFieldArray({ control, name: "attendants" });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const attendants = values.attendants.map((a) => ({ phone: a.phone.trim(), label: a.label?.trim() || undefined }));
    const result =
      props.mode === "create"
        ? await createSetorAction(props.tenantSlug, {
            connectionId: props.connectionId,
            name: values.name,
            description: values.description,
            attendants,
          })
        : await updateSetorAction(props.tenantSlug, {
            setorId: props.setorId,
            name: values.name,
            description: values.description,
            attendants,
          });
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
      <DialogTrigger render={<Button variant={props.mode === "create" ? "outline" : "ghost"} size="sm" />}>
        {props.mode === "create" ? (
          <>
            <Plus className="size-4" />
            Novo setor
          </>
        ) : (
          "Editar"
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{props.mode === "create" ? "Novo setor" : "Editar setor"}</DialogTitle>
          <DialogDescription>
            O setor aparece pra IA escolher quando ela decide transferir pra um atendente humano — ela
            escolhe sozinha pelo que o cliente pediu, sem perguntar.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="setor-name">Nome</FieldLabel>
              <Input id="setor-name" placeholder="ex: Financeiro" {...register("name")} />
              <FieldError errors={[errors.name]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="setor-description">Descrição (opcional)</FieldLabel>
              <Textarea
                id="setor-description"
                rows={2}
                placeholder="ex: Dúvidas sobre cobrança, reembolso, nota fiscal"
                {...register("description")}
              />
              <FieldDescription>
                Ajuda a IA a escolher o setor certo pelo significado, não só pelo nome.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Atendentes</FieldLabel>
              <div className="space-y-2">
                {fields.map((field, i) => (
                  <div key={field.id} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Input placeholder="5511999999999" {...register(`attendants.${i}.phone`)} />
                      <Input
                        placeholder="Nome (opcional)"
                        className="max-w-[9rem]"
                        {...register(`attendants.${i}.label`)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={fields.length === 1}
                        onClick={() => remove(i)}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                    <FieldError errors={[errors.attendants?.[i]?.phone]} />
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => append({ phone: "", label: "" })}>
                <Plus className="size-4" />
                Adicionar número
              </Button>
              <FieldDescription>
                Só números, sem espaço, traço ou parênteses: código do país + DDD + número.
              </FieldDescription>
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
