"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, RotateCcw } from "lucide-react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { setContactOptOutAction } from "@/actions/campaigns/set-contact-opt-out";
import type { ContactRow } from "@/repositories/contact.repository";

export function ContactsTable({
  tenantSlug,
  contacts,
  canManage,
}: {
  tenantSlug: string;
  contacts: ContactRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function toggleOptOut(contact: ContactRow) {
    setPendingId(contact.id);
    await setContactOptOutAction(tenantSlug, { contactId: contact.id, optedOut: !contact.optedOut });
    setPendingId(null);
    router.refresh();
  }

  if (contacts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum contato sincronizado ainda — clique em &ldquo;Sincronizar contatos&rdquo;.
      </p>
    );
  }

  return (
    // Own scroll container (fixed height) instead of letting a list of
    // thousands of contacts push the whole page — the sticky header keeps
    // the column labels in view while scrolling, like a frozen Excel row.
    <div className="max-h-[65vh] overflow-y-auto rounded-lg border border-border">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Telefone</TableHead>
            <TableHead>Status</TableHead>
            {canManage && <TableHead className="text-right">Ações</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {contacts.map((contact) => (
            <TableRow key={contact.id}>
              <TableCell>{contact.name ?? <span className="text-muted-foreground">—</span>}</TableCell>
              <TableCell>{contact.phone}</TableCell>
              <TableCell>
                {contact.optedOut ? (
                  <Badge variant="destructive">
                    Opt-out {contact.optedOutSource === "keyword" ? "(palavra-chave)" : "(manual)"}
                  </Badge>
                ) : (
                  <Badge variant="secondary">Ativo</Badge>
                )}
              </TableCell>
              {canManage && (
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pendingId === contact.id}
                    onClick={() => toggleOptOut(contact)}
                  >
                    {contact.optedOut ? (
                      <>
                        <RotateCcw className="size-4" />
                        Reativar
                      </>
                    ) : (
                      <>
                        <Ban className="size-4" />
                        Bloquear
                      </>
                    )}
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
