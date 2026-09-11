"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { addContactsToListAction } from "@/actions/campaigns/add-contacts-to-list";
import type { ContactRow } from "@/repositories/contact.repository";

export function AddContactsDialog({
  tenantSlug,
  listId,
  availableContacts,
}: {
  tenantSlug: string;
  listId: string;
  availableContacts: ContactRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => (checked ? [...prev, id] : prev.filter((v) => v !== id)));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    const result = await addContactsToListAction(tenantSlug, { listId, contactIds: selected });
    setSubmitting(false);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    setOpen(false);
    setSelected([]);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setSelected([]);
          setError(null);
        }
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-4" />
        Adicionar contatos
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar contatos à lista</DialogTitle>
          <DialogDescription>
            Só contatos ativos (não bloqueados) que ainda não estão nesta lista aparecem aqui.
          </DialogDescription>
        </DialogHeader>

        {availableContacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum contato disponível — todos já estão nesta lista ou não há contatos sincronizados.
          </p>
        ) : (
          <ScrollArea className="max-h-72 rounded-md border border-border">
            <div className="divide-y divide-border">
              {availableContacts.map((contact) => (
                <label
                  key={contact.id}
                  className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/50"
                >
                  <Checkbox
                    checked={selected.includes(contact.id)}
                    onCheckedChange={(value) => toggle(contact.id, value === true)}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{contact.name ?? contact.phone}</p>
                    {contact.name && <p className="text-xs text-muted-foreground">{contact.phone}</p>}
                  </div>
                </label>
              ))}
            </div>
          </ScrollArea>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter className="mt-2">
          <Button onClick={handleSubmit} disabled={submitting || selected.length === 0}>
            {submitting ? "Adicionando…" : `Adicionar (${selected.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
