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
import { deleteTenantAction } from "@/actions/admin/delete-tenant";

/** Só aparece com a empresa já CANCELED (ver deleteTenant em
 * admin.repository.ts) — exclusão em cascata e irreversível, por isso exige
 * digitar o slug pra confirmar, igual ao fluxo de "excluir repositório" do
 * GitHub, em vez de só um AlertDialog de sim/não. */
export function DeleteTenantButton({ tenantId, slug }: { tenantId: string; slug: string }) {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState("");
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    const result = await deleteTenantAction({ tenantId });
    if (!result.success) {
      setDeleting(false);
      setError(result.error.message);
      return;
    }
    router.push("/admin/empresas");
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
        Excluir definitivamente
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
          <Label htmlFor="confirm-slug">Identificador da empresa</Label>
          <Input
            id="confirm-slug"
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
            {deleting ? "Excluindo…" : "Excluir definitivamente"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
