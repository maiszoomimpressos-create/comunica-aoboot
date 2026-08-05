"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MessageCircle, Camera, Mail, MessageSquare, CreditCard, Puzzle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import type { ModuleWithTenantStatus } from "@/repositories/module.repository";
import { toggleModuleAction } from "@/actions/modules/toggle-module";
import { MODULE_APP_ROUTES } from "@/config/modules-catalog";

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

  // Modules with their own dedicated area (e.g. the WhatsApp connect wizard)
  // are entered by clicking the card, same as "Integrações" — installing
  // happens as a side effect of finishing that flow, not a manual switch.
  const appRoute = MODULE_APP_ROUTES[mod.key];

  const cardBody = (
    <>
      <div className="flex items-start justify-between">
        <Icon className="size-6 text-primary" />
        {mod.status === "COMING_SOON" && <Badge variant="secondary">Em breve</Badge>}
        {mod.status === "INSTALLED" && <Badge>Instalado</Badge>}
      </div>
      <h3 className="mt-4 font-medium">{mod.name}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{mod.description}</p>

      {!mod.isComingSoon && canManage && !appRoute && (
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
    </>
  );

  if (appRoute && !mod.isComingSoon) {
    return (
      <Link href={appRoute(tenantSlug)}>
        <Card className="p-6 transition-colors hover:bg-muted">{cardBody}</Card>
      </Link>
    );
  }

  return <Card className="p-6">{cardBody}</Card>;
}
