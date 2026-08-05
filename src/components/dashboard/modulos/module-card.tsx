"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Camera, Mail, MessageSquare, CreditCard, Puzzle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import type { ModuleWithTenantStatus } from "@/repositories/module.repository";
import { toggleModuleAction } from "@/actions/modules/toggle-module";

const ICONS: Record<string, typeof Puzzle> = {
  whatsapp: MessageCircle,
  telegram: MessageCircle,
  instagram: Camera,
  email: Mail,
  sms: MessageSquare,
  payments: CreditCard,
};

export function ModuleCard({
  tenantSlug,
  module: mod,
  canManage,
}: {
  tenantSlug: string;
  module: ModuleWithTenantStatus;
  canManage: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const Icon = ICONS[mod.key] ?? Puzzle;

  async function handleToggle(checked: boolean) {
    setLoading(true);
    await toggleModuleAction(tenantSlug, { moduleId: mod.id, installed: checked });
    setLoading(false);
    router.refresh();
  }

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between">
        <Icon className="size-6 text-primary" />
        {mod.status === "COMING_SOON" && <Badge variant="secondary">Em breve</Badge>}
        {mod.status === "INSTALLED" && <Badge>Instalado</Badge>}
      </div>
      <h3 className="mt-4 font-medium">{mod.name}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{mod.description}</p>

      {!mod.isComingSoon && canManage && (
        <div className="mt-4 flex items-center gap-2">
          <Switch
            checked={mod.status === "INSTALLED"}
            disabled={loading}
            onCheckedChange={handleToggle}
          />
          <span className="text-sm text-muted-foreground">
            {mod.status === "INSTALLED" ? "Instalado" : "Instalar"}
          </span>
        </div>
      )}
    </Card>
  );
}
