import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getRequestContext } from "@/lib/server/request-context";
import { requirePermission } from "@/lib/rbac/require-permission";
import { INTEGRATION_PROVIDERS } from "@/config/modules-catalog";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ provider: string }>;
}): Promise<Metadata> {
  const { provider } = await params;
  const found = INTEGRATION_PROVIDERS.find((p) => p.key === provider);
  return { title: found?.name ?? "Integração" };
}

export default async function IntegrationDetailPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; provider: string }>;
}) {
  const { tenantSlug, provider } = await params;
  const ctx = await getRequestContext(tenantSlug);
  requirePermission(ctx, "integrations.view");

  const found = INTEGRATION_PROVIDERS.find((p) => p.key === provider);
  if (!found) notFound();

  return (
    <div className="max-w-lg space-y-4">
      <Link
        href={`/app/${tenantSlug}/integracoes`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Integrações
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">{found.name}</h1>
      <p className="text-muted-foreground">
        A integração com {found.name} está prevista para uma próxima fase da plataforma. Esta
        tela já está preparada para receber a configuração assim que o módulo for lançado.
      </p>
    </div>
  );
}
