"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { deleteContactListAction } from "@/actions/campaigns/delete-list";
import type { ContactListSummary } from "@/repositories/contact-list.repository";

export function ContactListCard({
  tenantSlug,
  list,
  canManage,
}: {
  tenantSlug: string;
  list: ContactListSummary;
  canManage: boolean;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    await deleteContactListAction(tenantSlug, { listId: list.id });
    setDeleting(false);
    router.refresh();
  }

  return (
    <Card className="flex items-center justify-between gap-4 p-4">
      <Link
        href={`/app/${tenantSlug}/modulos/whatsapp/campanhas/${list.connectionId}/listas/${list.id}`}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Users className="size-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium">{list.name}</p>
          <p className="text-sm text-muted-foreground">{list.memberCount} contato(s)</p>
        </div>
      </Link>
      {canManage && (
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="ghost" size="sm" disabled={deleting} />}>
            <Trash2 className="size-4" />
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir lista &ldquo;{list.name}&rdquo;?</AlertDialogTitle>
              <AlertDialogDescription>
                Os contatos continuam salvos — só a lista e os vínculos com ela são removidos. Não é
                possível excluir uma lista já usada por alguma campanha.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Card>
  );
}
