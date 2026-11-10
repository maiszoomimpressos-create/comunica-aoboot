"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { deleteSegmentoAction } from "@/actions/segmentos/delete-segmento";

export function DeleteSegmentoButton({
  tenantSlug,
  segmentoId,
  segmentoName,
}: {
  tenantSlug: string;
  segmentoId: string;
  segmentoName: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    const result = await deleteSegmentoAction(tenantSlug, { segmentoId });
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    router.refresh();
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>Excluir</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir &ldquo;{segmentoName}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            A conexão de WhatsApp por trás deste segmento não é afetada — só o rótulo é removido.
            {error && <span className="mt-2 block text-destructive">{error}</span>}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
