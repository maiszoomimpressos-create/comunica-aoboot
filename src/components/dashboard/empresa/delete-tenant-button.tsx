"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { deleteTenantAction } from "@/actions/tenant/delete-tenant";

/** Só renderizada pro Owner (ver empresa/page.tsx) — exclusão em cascata e
 * irreversível, mesma salvaguarda de digitar o slug que o fluxo admin usa
 * (components/admin/empresas/delete-tenant-button.tsx), mas sem exigir
 * status CANCELED primeiro: um tenant comum não tem como mudar o próprio
 * status. */
export function DeleteTenantButton({ tenantSlug, slug }: { tenantSlug: string; slug: string }) {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState("");
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    const result = await deleteTenantAction(tenantSlug, { confirmSlug: confirmText });
    if (!result.success) {
      setDeleting(false);
      setError(result.error.message);
      return;
    }
    router.push("/app");
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setConfirmText("");
          setError(null);
        }
      }}
    >
      <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
        Excluir empresa
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir &ldquo;{slug}&rdquo; para sempre?</AlertDialogTitle>
          <AlertDialogDescription>
            Isso apaga a empresa e tudo que pertence a ela — conexões de WhatsApp, campanhas,
            contatos, papéis, membros — sem volta. Digite <strong>{slug}</strong> para confirmar.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 px-1">
          <Label htmlFor="confirm-slug-self">Identificador da empresa</Label>
          <Input
            id="confirm-slug-self"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={slug}
            autoComplete="off"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={confirmText !== slug || deleting}
            onClick={handleDelete}
          >
            {deleting ? "Excluindo…" : "Excluir empresa"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
