"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Workflow, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { createFlowAction } from "@/actions/whatsapp/create-flow";
import { deleteFlowAction } from "@/actions/whatsapp/delete-flow";

type FlowSummary = { id: string; name: string; status: "DRAFT" | "PUBLISHED" | "ARCHIVED"; updatedAt: string };

const STATUS_LABEL: Record<FlowSummary["status"], string> = {
  DRAFT: "Rascunho",
  PUBLISHED: "Publicado",
  ARCHIVED: "Arquivado",
};

export function FlowsList({
  tenantSlug,
  connectionId,
  flows,
}: {
  tenantSlug: string;
  connectionId: string;
  flows: FlowSummary[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    const result = await createFlowAction(tenantSlug, { connectionId, name });
    setCreating(false);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    setOpen(false);
    setName("");
    router.push(`/app/${tenantSlug}/modulos/whatsapp/fluxos/${connectionId}/${result.data.id}`);
  }

  async function handleDelete(flowId: string) {
    const result = await deleteFlowAction(tenantSlug, { flowId });
    if (!result.success) {
      alert(result.error.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button />}>
          <Plus className="size-4" />
          Criar fluxo
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar fluxo</DialogTitle>
            <DialogDescription>Dê um nome pra esse fluxo — você monta o resto no editor visual.</DialogDescription>
          </DialogHeader>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Atendimento principal"
            autoFocus
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button disabled={creating || !name.trim()} onClick={handleCreate}>
              {creating ? "Criando..." : "Criar e abrir editor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {flows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nenhum fluxo criado ainda.
        </div>
      ) : (
        <div className="space-y-2">
          {flows.map((flow) => (
            <Card key={flow.id} className="flex items-center gap-3 p-4">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Workflow className="size-4 text-primary" />
              </div>
              <Link
                href={`/app/${tenantSlug}/modulos/whatsapp/fluxos/${connectionId}/${flow.id}`}
                className="min-w-0 flex-1"
              >
                <p className="truncate font-medium">{flow.name}</p>
                <p className="text-sm text-muted-foreground">
                  Atualizado em {new Date(flow.updatedAt).toLocaleDateString("pt-BR")}
                </p>
              </Link>
              <Badge variant={flow.status === "PUBLISHED" ? "default" : "secondary"}>
                {STATUS_LABEL[flow.status]}
              </Badge>
              <AlertDialog>
                <AlertDialogTrigger render={<Button variant="ghost" size="icon" aria-label="Excluir fluxo" />}>
                  <Trash2 className="size-4 text-muted-foreground" />
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir "{flow.name}"?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Essa ação não pode ser desfeita. Fluxos com conversas em andamento não podem ser excluídos.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleDelete(flow.id)}>Excluir</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
