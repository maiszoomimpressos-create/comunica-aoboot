"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { removeContactFromListAction } from "@/actions/campaigns/remove-contact-from-list";
import type { ListMemberRow } from "@/repositories/contact-list.repository";

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

  async function handleRemove(contactId: string) {
    setPendingId(contactId);
    await removeContactFromListAction(tenantSlug, { listId, contactId });
    setPendingId(null);
    router.refresh();
  }

  if (members.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum contato nesta lista ainda.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nome</TableHead>
          <TableHead>Telefone</TableHead>
          <TableHead>Status</TableHead>
          {canManage && <TableHead className="text-right">Ações</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((member) => (
          <TableRow key={member.contactId}>
            <TableCell>{member.name ?? <span className="text-muted-foreground">—</span>}</TableCell>
            <TableCell>{member.phone}</TableCell>
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
  );
}
