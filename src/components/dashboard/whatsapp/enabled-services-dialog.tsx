"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { WHATSAPP_SERVICES } from "@/config/whatsapp-services";
import { NOTIFICATION_TYPES } from "@/config/whatsapp-notification-types";
import { updateEnabledServicesAction } from "@/actions/whatsapp/update-enabled-services";

// Serviços que têm tipos próprios no catálogo de notificação (hoje:
// purchase_confirmation, verification_code) agora são controlados pela
// página "Funções" (NotificationTypesPanel), por tipo — não sobra checkbox
// aqui que não gatekeeper mais nada. Só sobra o que não tem "tipos"
// (balance_alert).
const visibleServices = WHATSAPP_SERVICES.filter(
  (s) => !NOTIFICATION_TYPES.some((t) => t.serviceKey === s.key)
);

/**
 * Tenant-facing: scopes this connection's API key to only the checked
 * services (config/whatsapp-services.ts) — an external caller with a valid
 * key but hitting an unchecked service's endpoint gets a 403 (see
 * sendBalanceAlert; purchase_confirmation/verification_code are gated by
 * type now, see the "Funções" page / NotificationTypesPanel). Separate from
 * EditConnectionDialog — this controls what the key can *do*, not the
 * connection's own name/phone.
 */
export function EnabledServicesDialog({
  tenantSlug,
  connectionId,
  defaultServices,
}: {
  tenantSlug: string;
  connectionId: string;
  defaultServices: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [services, setServices] = useState<string[]>(defaultServices);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  function toggle(key: string, checked: boolean) {
    setServices((prev) => (checked ? [...prev, key] : prev.filter((s) => s !== key)));
  }

  async function handleSave() {
    setSaving(true);
    setServerError(null);
    const result = await updateEnabledServicesAction(tenantSlug, { connectionId, services });
    setSaving(false);
    if (!result.success) {
      setServerError(result.error.message);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setServerError(null);
          setServices(defaultServices);
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <ListChecks className="size-4" />
        Serviços habilitados
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Serviços habilitados nesta conexão</DialogTitle>
          <DialogDescription>
            A chave de API desta conexão só funciona pros serviços marcados abaixo — desmarcar um
            serviço bloqueia imediatamente qualquer chamada pra ele, mesmo com a chave certa.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {visibleServices.map((service) => (
            <Label key={service.key} className="flex items-start gap-2 text-sm font-normal">
              <Checkbox
                className="mt-0.5"
                checked={services.includes(service.key)}
                onCheckedChange={(checked) => toggle(service.key, checked === true)}
              />
              <span>
                <span className="block font-medium text-foreground">{service.label}</span>
                <span className="block text-muted-foreground">{service.description}</span>
                <code className="mt-0.5 block text-xs text-muted-foreground">{service.endpoint}</code>
              </span>
            </Label>
          ))}
          {serverError && (
            <p role="alert" className="text-sm text-destructive">
              {serverError}
            </p>
          )}
        </div>
        <DialogFooter className="mt-4">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando…" : "Salvar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
