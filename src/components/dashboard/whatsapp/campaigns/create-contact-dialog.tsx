"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, FieldGroup, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { createManualContactAction } from "@/actions/campaigns/create-manual-contact";
import type { ContactListSummary } from "@/repositories/contact-list.repository";

const NO_LIST = "none";

/** Cadastro manual de um contato neste número, opcionalmente já numa lista
 * (montada, ou extraída deste mesmo número). */
export function CreateContactDialog({
  tenantSlug,
  connectionId,
  lists,
}: {
  tenantSlug: string;
  connectionId: string;
  lists: ContactListSummary[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [listId, setListId] = useState<string>(NO_LIST);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const eligibleLists = lists.filter((l) => l.type === "ASSEMBLED" || l.connectionId === connectionId);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!phone.trim()) {
      setError("Informe o telefone.");
      return;
    }
    setSubmitting(true);
    const result = await createManualContactAction(tenantSlug, {
      connectionId,
      phone,
      name: name.trim() || null,
      listId: listId === NO_LIST ? null : listId,
    });
    setSubmitting(false);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    router.refresh();
    if (result.data.optedOut) {
      setNotice(`Contato ${result.data.phone} salvo, mas está em opt-out — não entra em listas nem recebe campanhas.`);
      return;
    }
    setNotice(`Contato ${result.data.phone} salvo${result.data.addedToList ? " e adicionado à lista" : ""}.`);
    setPhone("");
    setName("");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setError(null);
          setNotice(null);
        }
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <UserPlus className="size-4" />
        Novo contato
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cadastrar contato</DialogTitle>
          <DialogDescription>
            Para quem não está na agenda do WhatsApp nem num CSV. Se o contato já existir e você digitar
            um nome, ele passa a valer (e a sincronização com a Z-API não troca mais).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="manual-contact-phone">Telefone</FieldLabel>
              <Input
                id="manual-contact-phone"
                inputMode="tel"
                placeholder="(11) 91234-5678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <FieldDescription>Com DDD. Sem o 55, assumimos Brasil.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="manual-contact-name">Nome (opcional)</FieldLabel>
              <Input id="manual-contact-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel>Adicionar à lista (opcional)</FieldLabel>
              <Select value={listId} onValueChange={(v) => setListId(v ?? NO_LIST)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_LIST}>Nenhuma</SelectItem>
                  {eligibleLists.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
            {error && <FieldError errors={[{ message: error }]} />}
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Salvando…" : "Salvar contato"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
