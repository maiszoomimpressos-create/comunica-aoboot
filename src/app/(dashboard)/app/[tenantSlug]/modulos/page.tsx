import type { Metadata } from "next";
import { getRequestContext } from "@/lib/server/request-context";
import { requirePermission } from "@/lib/rbac/require-permission";
import { listModulesWithTenantStatus } from "@/repositories/module.repository";
import { ModuleCard } from "@/components/dashboard/modulos/module-card";

export const metadata: Metadata = { title: "Módulos" };

export default async function ModulosPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const ctx = await getRequestContext(tenantSlug);
  requirePermission(ctx, "modules.view");

  const modules = await listModulesWithTenantStatus(ctx.tenantId);
  const canManage = ctx.permissions.includes("modules.manage");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Marketplace de módulos</h1>
        <p className="text-muted-foreground">
          Canais e integrações prontos para instalar assim que forem lançados.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((mod) => (
          <ModuleCard key={mod.id} tenantSlug={tenantSlug} module={mod} canManage={canManage} />
        ))}
      </div>
    </div>
  );
}
