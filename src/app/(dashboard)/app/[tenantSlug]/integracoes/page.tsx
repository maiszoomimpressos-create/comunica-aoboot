import type { Metadata } from "next";
import { getRequestContext } from "@/lib/server/request-context";
import { requirePermission } from "@/lib/rbac/require-permission";
import { INTEGRATION_PROVIDERS } from "@/config/modules-catalog";
import { IntegrationCard } from "@/components/dashboard/integracoes/integration-card";

export const metadata: Metadata = { title: "Integrações" };

export default async function IntegracoesPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const ctx = await getRequestContext(tenantSlug);
  requirePermission(ctx, "integrations.view");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Integrações</h1>
        <p className="text-muted-foreground">
          Layout preparado para as integrações que chegam nas próximas fases.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {INTEGRATION_PROVIDERS.map((provider) => (
          <IntegrationCard key={provider.key} tenantSlug={tenantSlug} provider={provider} />
        ))}
      </div>
    </div>
  );
}
