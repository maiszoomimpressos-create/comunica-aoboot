"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { updateAiAttendantModelAction } from "@/actions/admin/update-ai-attendant-model";

export function AiAttendantModelForm({ currentModel }: { currentModel: string }) {
  const router = useRouter();
  const [model, setModel] = useState(currentModel);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await updateAiAttendantModelAction({ model });
    setSaving(false);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Atendente de IA</CardTitle>
        <CardDescription>
          Modelo usado pelo atendente de IA (ver AI Gateway da Vercel) em todas as empresas. Trocar aqui não exige deploy.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Field>
          <FieldLabel htmlFor="ai-model">Modelo</FieldLabel>
          <Input
            id="ai-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="anthropic/claude-sonnet-5.5"
          />
          <FieldDescription>
            String no formato &quot;provider/model&quot; do AI Gateway (ex: anthropic/claude-sonnet-5.5).
          </FieldDescription>
        </Field>
        {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      </CardContent>
      <CardFooter>
        <Button onClick={handleSave} disabled={saving || !model.trim()}>
          {saving ? "Salvando..." : "Salvar"}
        </Button>
      </CardFooter>
    </Card>
  );
}
