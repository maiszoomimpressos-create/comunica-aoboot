"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ContactsTable } from "./contacts-table";
import type { ContactRow } from "@/repositories/contact.repository";

/** Um bloco por lista na aba Contatos — clica no cabeçalho pra mostrar os
 * contatos daquela lista, clica de novo pra esconder. Fechado por padrão
 * (a lista da agenda inteira pode ter milhares de linhas). */
export function CollapsibleContactsSection({
  title,
  isGroup,
  originLabel,
  contacts,
  tenantSlug,
  canManage,
}: {
  title: string;
  isGroup: boolean;
  originLabel: string;
  contacts: ContactRow[];
  tenantSlug: string;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 p-3 text-left hover:bg-muted/30"
      >
        <div className="flex min-w-0 items-center gap-2">
          <p className="min-w-0 truncate font-medium">{title}</p>
          {isGroup && (
            <Badge variant="secondary" className="shrink-0">
              Grupo
            </Badge>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {contacts.length} contato(s) · {originLabel}
          </span>
          <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </div>
      </button>
      {open && (
        <div className="border-t border-border p-3">
          <ContactsTable tenantSlug={tenantSlug} contacts={contacts} canManage={canManage} />
        </div>
      )}
    </div>
  );
}
