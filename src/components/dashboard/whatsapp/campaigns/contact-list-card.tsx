"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, Users, Download, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { syncExtractedListAction } from "@/actions/campaigns/sync-extracted-list";
import { RenameListDialog } from "./rename-list-dialog";
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
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    await deleteContactListAction(tenantSlug, { listId: list.id });
    setDeleting(false);
    router.refresh();
  }

  async function handleSync() {
    setSyncing(true);
    setSyncError(null);
    const result = await syncExtractedListAction(tenantSlug, { listId: list.id });
    setSyncing(false);
    if (!result.success) {
      setSyncError(result.error.message);
      return;
    }
    router.refresh();
  }

  // Rota única de detalhe de lista, independente do número que a originou
  // (ou da ausência de um, no caso de uma lista montada).
  const listHref = `/app/${tenantSlug}/modulos/whatsapp/listas/${list.id}`;

  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between gap-4">
        <Link href={listHref} className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Users className="size-4 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {/* min-w-0: sem isso um nome sem espaço (grupo sem título vira
              o próprio id, tipo "12036...-group") não encolhe e estoura o
              card/modal. */}
              <p className="min-w-0 truncate font-medium">{list.name}</p>
              {list.type === "ASSEMBLED" && (
                <Badge variant="secondary" className="shrink-0">
                  Montada
                </Badge>
              )}
              {list.sourceGroupId && (
                <Badge variant="secondary" className="shrink-0">
                  Grupo
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {list.memberCount === 0 ? (
                "Sem contatos ainda — clique para adicionar"
              ) : (
                <>
                  {list.memberCount} contato(s)
                  {list.type === "EXTRACTED" ? ` · de ${list.originPhoneNumber}` : " · vários números"}
                </>
              )}
            </p>
          </div>
        </Link>

        <div className="flex shrink-0 items-center gap-1">
          {canManage && list.type === "EXTRACTED" && (
            <Button variant="ghost" size="sm" title="Sincronizar esta lista" onClick={handleSync} disabled={syncing}>
              <RefreshCw className={syncing ? "size-4 animate-spin" : "size-4"} />
            </Button>
          )}
          {canManage && <RenameListDialog tenantSlug={tenantSlug} listId={list.id} currentName={list.name} />}
          <Button
            variant="ghost"
            size="sm"
            title="Baixar lista"
            nativeButton={false}
            render={<a href={`${listHref}/export`} />}
          >
            <Download className="size-4" />
          </Button>
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
        </div>
      </div>

      {syncError && <p className="text-sm text-destructive">{syncError}</p>}
    </Card>
  );
}
