import type { Metadata } from "next";
import { getRequestContext } from "@/lib/server/request-context";
import { requirePermission } from "@/lib/rbac/require-permission";
import { getTenantById } from "@/repositories/tenant.repository";
import { EmpresaForm } from "@/components/dashboard/empresa/empresa-form";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Minha Empresa" };

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Ativa",
  SUSPENDED: "Suspensa",
  CANCELED: "Cancelada",
};

export default async function EmpresaPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const ctx = await getRequestContext(tenantSlug);
  requirePermission(ctx, "tenant.view");

  const tenant = await getTenantById(ctx.tenantId);
  const canEdit = ctx.permissions.includes("tenant.update");

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Minha Empresa</h1>
          <p className="text-muted-foreground">
            Identificador: <code className="text-xs">{tenant.slug}</code>
          </p>
        </div>
        <Badge variant={tenant.status === "ACTIVE" ? "default" : "destructive"}>
          {STATUS_LABEL[tenant.status] ?? tenant.status}
        </Badge>
      </div>

      <EmpresaForm
        tenantSlug={tenantSlug}
        canEdit={canEdit}
        defaultValues={{ name: tenant.name, primaryColor: tenant.primaryColor ?? "" }}
      />
    </div>
  );
}
