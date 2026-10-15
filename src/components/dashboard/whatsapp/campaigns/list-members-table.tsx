"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { removeContactFromListAction } from "@/actions/campaigns/remove-contact-from-list";
import type { ListMemberRow } from "@/repositories/contact-list.repository";

/** Only digits — lets "46 9921-2387", "+55 46 99212387" etc. all match the
 * same search term regardless of how the user or the phone punctuates it. */
function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function ListMembersTable({
  tenantSlug,
  listId,
  members,
  canManage,
}: {
  tenantSlug: string;
  listId: string;
  members: ListMemberRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  async function handleRemove(contactId: string) {
    setPendingId(contactId);
    await removeContactFromListAction(tenantSlug, { listId, contactId });
    setPendingId(null);
    router.refresh();
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return members;
    const termDigits = digitsOnly(term);
    return members.filter((member) => {
      const nameMatch = !!member.name && member.name.toLowerCase().includes(term);
      const phoneMatch = termDigits.length > 0 && digitsOnly(member.phone).includes(termDigits);
      return nameMatch || phoneMatch;
    });
  }, [members, search]);

  if (members.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum contato nesta lista ainda.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou número…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum contato encontrado para &ldquo;{search}&rdquo;.</p>
      ) : (
        // Same fixed-height scroll container + sticky header as ContactsTable —
        // a list can also grow into the thousands once campaigns are big.
        <div className="max-h-[65vh] overflow-y-auto rounded-lg border border-border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Status</TableHead>
                {canManage && <TableHead className="text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((member) => (
                <TableRow key={member.contactId}>
                  <TableCell>{member.name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>{member.phone}</TableCell>
                  <TableCell className="text-muted-foreground">{member.originPhoneNumber}</TableCell>
                  <TableCell>
                    {member.optedOut ? (
                      <Badge variant="destructive">Opt-out</Badge>
                    ) : (
                      <Badge variant="secondary">Ativo</Badge>
                    )}
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pendingId === member.contactId}
                        onClick={() => handleRemove(member.contactId)}
                      >
                        <X className="size-4" />
                        Remover
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
