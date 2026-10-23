"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateBotConfigAction } from "@/actions/whatsapp/update-bot-config";

/** Lets the tenant turn the AI attendant on/off for this connection, pick
 * which business vertical it's acting as (see BotVertical — mobilidade,
 * delivery, ...), and write the business profile text appended to the
 * vertical's system prompt (see bot-attendant.service.ts). Shown inside
 * ConnectionCard, manage-only, same place as ApiKeySection. */
export function BotAttendantSection({
  tenantSlug,
  connectionId,
  defaultEnabled,
  defaultBusinessProfile,
  defaultVerticalId,
  verticals,
}: {
  tenantSlug: string;
  connectionId: string;
  defaultEnabled: boolean;
  defaultBusinessProfile: string | null;
  defaultVerticalId: string | null;
  verticals: { id: string; key: string; label: string }[];
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(defaultEnabled);
  const [businessProfile, setBusinessProfile] = useState(defaultBusinessProfile ?? "");
  const [verticalId, setVerticalId] = useState<string | null>(defaultVerticalId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: { enabled: boolean; businessProfile: string; verticalId: string | null }) {
    setSaving(true);
    setError(null);
    const result = await updateBotConfigAction(tenantSlug, {
      connectionId,
      enabled: next.enabled,
      businessProfile: next.businessProfile.trim() || null,
      verticalId: next.verticalId,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    router.refresh();
  }

  function handleToggle(next: boolean) {
    setEnabled(next);
    save({ enabled: next, businessProfile, verticalId });
  }

  function handleVerticalChange(next: string | null) {
    setVerticalId(next);
    save({ enabled, businessProfile, verticalId: next });
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Bot className="size-4 text-muted-foreground" />
          Atendente de IA
        </div>
        <Switch checked={enabled} disabled={saving} onCheckedChange={handleToggle} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Quando ativado, responde automaticamente quem mandar mensagem pra este número.
      </p>

      <div className="mt-3">
        <Select value={verticalId ?? undefined} onValueChange={handleVerticalChange} disabled={saving}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecione o nicho do negócio" />
          </SelectTrigger>
          <SelectContent>
            {verticals.map((vertical) => (
              <SelectItem key={vertical.id} value={vertical.id}>
                {vertical.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Textarea
        className="mt-3"
        value={businessProfile}
        onChange={(e) => setBusinessProfile(e.target.value)}
        placeholder="Conte sobre o negócio pro atendente: nome da empresa, regras, valores, horário de atendimento..."
        rows={4}
      />
      <div className="mt-2 flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={saving}
          onClick={() => save({ enabled, businessProfile, verticalId })}
        >
          {saving ? "Salvando..." : "Salvar perfil"}
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </div>
  );
}
