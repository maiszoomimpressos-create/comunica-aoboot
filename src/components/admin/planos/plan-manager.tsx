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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { upsertPlanAction } from "@/actions/admin/upsert-plan";

interface PlanRow {
  id: string;
  name: string;
  slug: string;
  priceCents: number;
  interval: "MONTHLY" | "YEARLY";
  isActive: boolean;
  features: unknown;
}

interface PlanFormState {
  name: string;
  slug: string;
  priceCents: number;
  interval: "MONTHLY" | "YEARLY";
  maxUsers: string | number;
  maxModules: string | number;
  isActive: boolean;
}

const emptyForm: PlanFormState = {
  name: "",
  slug: "",
  priceCents: 0,
  interval: "MONTHLY",
  maxUsers: "",
  maxModules: "",
  isActive: true,
};

export function PlanManager({ plans }: { plans: PlanRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PlanRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setOpen(true);
  }

  function openEdit(plan: PlanRow) {
    const features = (plan.features ?? {}) as Record<string, unknown>;
    setEditing(plan);
    setForm({
      name: plan.name,
      slug: plan.slug,
      priceCents: plan.priceCents,
      interval: plan.interval,
      maxUsers: (features.users as number | null) ?? "",
      maxModules: (features.modules as number | null) ?? "",
      isActive: plan.isActive,
    });
    setError(null);
    setOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await upsertPlanAction({
      planId: editing?.id,
      name: form.name,
      slug: form.slug,
      priceCents: Number(form.priceCents),
      interval: form.interval,
      maxUsers: form.maxUsers === "" ? null : Number(form.maxUsers),
      maxModules: form.maxModules === "" ? null : Number(form.maxModules),
      isActive: form.isActive,
    });
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
            Novo plano
          </SheetTrigger>
          <SheetContent className="w-full max-w-md overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{editing ? "Editar plano" : "Novo plano"}</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 px-4">
              <FieldGroup>
                <Field>
                  <FieldLabel>Nome</FieldLabel>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </Field>
                <Field>
                  <FieldLabel>Identificador (slug)</FieldLabel>
                  <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
                </Field>
                <Field>
                  <FieldLabel>Preço (centavos)</FieldLabel>
                  <Input
                    type="number"
                    value={form.priceCents}
                    onChange={(e) => setForm({ ...form, priceCents: Number(e.target.value) })}
                  />
                </Field>
                <Field>
                  <FieldLabel>Limite de usuários (vazio = ilimitado)</FieldLabel>
                  <Input
                    type="number"
                    value={form.maxUsers}
                    onChange={(e) => setForm({ ...form, maxUsers: e.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel>Limite de módulos (vazio = ilimitado)</FieldLabel>
                  <Input
                    type="number"
                    value={form.maxModules}
                    onChange={(e) => setForm({ ...form, maxModules: e.target.value })}
                  />
                </Field>
                <Field className="flex-row items-center justify-between">
                  <FieldLabel>Ativo</FieldLabel>
                  <Switch
                    checked={form.isActive}
                    onCheckedChange={(checked) => setForm({ ...form, isActive: checked })}
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
        {plans.map((plan) => (
          <button
            key={plan.id}
            onClick={() => openEdit(plan)}
            className="flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-muted"
          >
            <div>
              <p className="font-medium">
                {plan.name} <span className="text-muted-foreground">({plan.slug})</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {(plan.priceCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                /mês
              </p>
            </div>
            <Badge variant={plan.isActive ? "default" : "secondary"}>
              {plan.isActive ? "Ativo" : "Inativo"}
            </Badge>
          </button>
        ))}
      </div>
    </div>
  );
}
