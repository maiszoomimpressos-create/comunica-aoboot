"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
import { SetorFormDialog } from "./setor-form-dialog";
import { setSetorActiveAction } from "@/actions/whatsapp/set-setor-active";
import { deleteSetorAction } from "@/actions/whatsapp/delete-setor";
import type { Setor, SetorAttendant } from "@/generated/prisma/client";

type SetorWithAttendants = Setor & { attendants: SetorAttendant[] };

/** Tenant-facing: gestão dos setores (departamentos) usados pela IA pra
 * escolher a quem repassar um atendimento (ver escalarParaHumano em
 * bot-attendant.service.ts) — cada setor tem um pool de um ou mais
 * atendentes que recebem o broadcast quando a IA escala pra ali. */
export function SetoresManager({
  tenantSlug,
  connectionId,
  setores,
}: {
  tenantSlug: string;
  connectionId: string;
  setores: SetorWithAttendants[];
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {setores.length === 0
            ? "Nenhum setor configurado — sem setor, a transferência pra humano só registra o pedido, sem avisar ninguém."
            : `${setores.length} setor(es) configurado(s).`}
        </p>
        <SetorFormDialog mode="create" tenantSlug={tenantSlug} connectionId={connectionId} />
      </div>

      {setores.length > 0 && (
        <div className="space-y-3">
          {setores.map((setor) => (
            <SetorRow key={setor.id} tenantSlug={tenantSlug} setor={setor} />
          ))}
        </div>
      )}
    </div>
  );
}

function SetorRow({ tenantSlug, setor }: { tenantSlug: string; setor: SetorWithAttendants }) {
  const router = useRouter();
  const [active, setActive] = useState(setor.active);
  const [togglingActive, setTogglingActive] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleActiveChange(next: boolean) {
    setActive(next);
    setTogglingActive(true);
    const result = await setSetorActiveAction(tenantSlug, { setorId: setor.id, active: next });
    setTogglingActive(false);
    if (!result.success) {
      setActive(!next); // reverte o optimistic update
      return;
    }
    router.refresh();
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    const result = await deleteSetorAction(tenantSlug, { setorId: setor.id });
    setDeleting(false);
    if (!result.success) {
      setDeleteError(result.error.message);
      return;
    }
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 py-4">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <p className="font-medium">{setor.name}</p>
            <span className="text-xs text-muted-foreground">
              {setor.attendants.length} atendente{setor.attendants.length === 1 ? "" : "s"}
            </span>
          </div>
          {setor.description && <p className="text-sm text-muted-foreground">{setor.description}</p>}
          <p className="text-xs text-muted-foreground">
            {setor.attendants.map((a) => a.label || a.phone).join(", ")}
          </p>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Switch checked={active} disabled={togglingActive} onCheckedChange={handleActiveChange} />
          <SetorFormDialog
            mode="edit"
            tenantSlug={tenantSlug}
            setorId={setor.id}
            defaultValues={{
              name: setor.name,
              description: setor.description,
              attendants: setor.attendants.map((a) => ({ phone: a.phone, label: a.label })),
            }}
          />
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="ghost" size="icon-sm" disabled={deleting} />}>
              <Trash2 className="size-4" />
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir {setor.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  A IA deixa de poder transferir atendimentos pra esse setor. Não é possível excluir se
                  houver um atendimento em andamento.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
