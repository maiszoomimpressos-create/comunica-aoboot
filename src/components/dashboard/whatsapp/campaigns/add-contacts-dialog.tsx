"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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

const COMBINING_MARKS = /[̀-ͯ]/g;

function normalize(value: string): string {
  // NFD decompõe "é" em "e" + acento combinante — remove o acento pra busca
  // ignorar acentuação.
  return value.toLowerCase().normalize("NFD").replace(COMBINING_MARKS, "");
}

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
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detecta se há mais de um número de origem entre os disponíveis — só aí
  // vale a pena mostrar o filtro "de qual número", que é como se "puxa"
  // toda uma lista extraída de uma vez pra dentro de uma lista montada.
  const hasMultipleOrigins = useMemo(
    () => new Set(availableContacts.map((c) => c.originPhoneNumber)).size > 1,
    [availableContacts]
  );

  const filtered = useMemo(() => {
    const query = normalize(search.trim());
    if (!query) return availableContacts;
    return availableContacts.filter(
      (c) =>
        normalize(c.name ?? "").includes(query) ||
        c.phone.includes(query) ||
        c.originPhoneNumber.includes(query)
    );
  }, [availableContacts, search]);

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => (checked ? [...prev, id] : prev.filter((v) => v !== id)));
  }

  function selectAllFiltered() {
    setSelected((prev) => Array.from(new Set([...prev, ...filtered.map((c) => c.id)])));
  }

  function clearSelection() {
    setSelected([]);
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
    setSearch("");
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setSelected([]);
          setSearch("");
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
            {hasMultipleOrigins && " Busque pelo número de origem pra pegar todo mundo de um número só."}
          </DialogDescription>
        </DialogHeader>

        {availableContacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum contato disponível — todos já estão nesta lista ou não há contatos sincronizados.
          </p>
        ) : (
          <>
            <Input
              placeholder="Buscar por nome, telefone ou número de origem…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {filtered.length} contato(s) {search && "encontrado(s)"}
              </span>
              <div className="flex gap-3">
                <button type="button" className="hover:text-foreground" onClick={selectAllFiltered}>
                  Selecionar {search ? "encontrados" : "todos"}
                </button>
                {selected.length > 0 && (
                  <button type="button" className="hover:text-foreground" onClick={clearSelection}>
                    Limpar seleção
                  </button>
                )}
              </div>
            </div>
            <ScrollArea className="max-h-72 min-w-0 rounded-md border border-border">
              <div className="divide-y divide-border">
                {filtered.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">Nenhum contato bate com a busca.</p>
                ) : (
                  filtered.map((contact) => (
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
                        <p className="text-xs text-muted-foreground">
                          {contact.name && `${contact.phone} · `}de {contact.originPhoneNumber}
                        </p>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </ScrollArea>
          </>
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
