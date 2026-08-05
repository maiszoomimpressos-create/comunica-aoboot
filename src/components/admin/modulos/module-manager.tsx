"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { upsertModuleAction } from "@/actions/admin/upsert-module";

interface ModuleRow {
  id: string;
  key: string;
  name: string;
  description: string;
  category: string;
  isComingSoon: boolean;
}

const emptyForm = { key: "", name: "", description: "", category: "", isComingSoon: true };

export function ModuleManager({ modules }: { modules: ModuleRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ModuleRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setOpen(true);
  }

  function openEdit(mod: ModuleRow) {
    setEditing(mod);
    setForm({
      key: mod.key,
      name: mod.name,
      description: mod.description,
      category: mod.category,
      isComingSoon: mod.isComingSoon,
    });
    setError(null);
    setOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await upsertModuleAction({ moduleId: editing?.id, ...form });
    setSaving(false);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger render={<Button onClick={openCreate} />}>
            <Plus className="size-4" />
            Novo módulo
          </SheetTrigger>
          <SheetContent className="w-full max-w-md overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{editing ? "Editar módulo" : "Novo módulo"}</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 px-4">
              <FieldGroup>
                <Field>
                  <FieldLabel>Chave (ex: whatsapp)</FieldLabel>
                  <Input
                    value={form.key}
                    disabled={!!editing}
                    onChange={(e) => setForm({ ...form, key: e.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel>Nome</FieldLabel>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </Field>
                <Field>
                  <FieldLabel>Categoria</FieldLabel>
                  <Input
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel>Descrição</FieldLabel>
                  <Textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </Field>
                <Field className="flex-row items-center justify-between">
                  <FieldLabel>Em breve (bloqueia instalação)</FieldLabel>
                  <Switch
                    checked={form.isComingSoon}
                    onCheckedChange={(checked) => setForm({ ...form, isComingSoon: checked })}
                  />
                </Field>
              </FieldGroup>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <SheetFooter>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Salvando…" : "Salvar"}
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>

      <div className="divide-y divide-border rounded-xl border border-border">
        {modules.map((mod) => (
          <button
            key={mod.id}
            onClick={() => openEdit(mod)}
            className="flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-muted"
          >
            <div>
              <p className="font-medium">
                {mod.name} <span className="text-muted-foreground">({mod.key})</span>
              </p>
              <p className="text-xs text-muted-foreground">{mod.category}</p>
            </div>
            <Badge variant={mod.isComingSoon ? "secondary" : "default"}>
              {mod.isComingSoon ? "Em breve" : "Disponível"}
            </Badge>
          </button>
        ))}
      </div>
    </div>
  );
}
