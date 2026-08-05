"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, ShieldCheck } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
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
import { PermissionMatrix } from "./permission-matrix";
import type { TenantRole } from "@/repositories/role.repository";
import type { PermissionCode } from "@/lib/rbac/permissions";
import { createRoleAction } from "@/actions/roles/create-role";
import { updateRolePermissionsAction } from "@/actions/roles/update-role-permissions";
import { deleteRoleAction } from "@/actions/roles/delete-role";

export function RoleManager({
  tenantSlug,
  roles,
  canManage,
}: {
  tenantSlug: string;
  roles: TenantRole[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [editingRole, setEditingRole] = useState<TenantRole | null>(null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<PermissionCode[]>([]);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function openEdit(role: TenantRole) {
    setEditingRole(role);
    setSelected(role.permissions);
    setError(null);
  }

  function openCreate() {
    setCreating(true);
    setNewName("");
    setSelected([]);
    setError(null);
  }

  async function handleSavePermissions() {
    if (!editingRole) return;
    setSaving(true);
    setError(null);
    const result = await updateRolePermissionsAction(tenantSlug, {
      roleId: editingRole.id,
      permissions: selected,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    setEditingRole(null);
    router.refresh();
  }

  async function handleCreate() {
    setSaving(true);
    setError(null);
    const result = await createRoleAction(tenantSlug, { name: newName, permissions: selected });
    setSaving(false);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    setCreating(false);
    router.refresh();
  }

  async function handleDelete(roleId: string) {
    const result = await deleteRoleAction(tenantSlug, { roleId });
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Sheet open={creating} onOpenChange={setCreating}>
            <SheetTrigger render={<Button onClick={openCreate} />}>
              <Plus className="size-4" />
              Novo papel
            </SheetTrigger>
            <SheetContent className="w-full max-w-md overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Novo papel</SheetTitle>
                <SheetDescription>
                  Escolha um nome e as permissões deste papel.
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-5 px-4">
                <Field>
                  <FieldLabel htmlFor="new-role-name">Nome do papel</FieldLabel>
                  <Input
                    id="new-role-name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Ex: Gerente"
                  />
                </Field>
                <PermissionMatrix selected={selected} onChange={setSelected} />
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
              <SheetFooter>
                <Button onClick={handleCreate} disabled={saving || newName.length < 2}>
                  {saving ? "Criando…" : "Criar papel"}
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>
      )}

      <div className="divide-y divide-border rounded-xl border border-border">
        {roles.map((role) => (
          <div key={role.id} className="flex items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="size-4 text-muted-foreground" />
              <div>
                <p className="font-medium">
                  {role.name}
                  {role.isSystem && (
                    <Badge variant="secondary" className="ml-2 align-middle">
                      padrão
                    </Badge>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {role.permissions.length} permissões
                </p>
              </div>
            </div>

            {canManage && (
              <div className="flex gap-2">
                <Sheet
                  open={editingRole?.id === role.id}
                  onOpenChange={(open) => !open && setEditingRole(null)}
                >
                  <SheetTrigger render={<Button variant="outline" size="sm" onClick={() => openEdit(role)} />}>
                    Editar permissões
                  </SheetTrigger>
                  <SheetContent className="w-full max-w-md overflow-y-auto">
                    <SheetHeader>
                      <SheetTitle>{role.name}</SheetTitle>
                      <SheetDescription>Permissões deste papel nesta empresa.</SheetDescription>
                    </SheetHeader>
                    <div className="space-y-5 px-4">
                      <PermissionMatrix selected={selected} onChange={setSelected} />
                      {error && <p className="text-sm text-destructive">{error}</p>}
                    </div>
                    <SheetFooter>
                      <Button onClick={handleSavePermissions} disabled={saving}>
                        {saving ? "Salvando…" : "Salvar"}
                      </Button>
                    </SheetFooter>
                  </SheetContent>
                </Sheet>

                {!role.isSystem && (
                  <AlertDialog>
                    <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>
                      Excluir
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir &ldquo;{role.name}&rdquo;?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Só é possível excluir papéis sem usuários atribuídos.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(role.id)}>
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
