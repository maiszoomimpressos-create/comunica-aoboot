import { ConfigTabs } from "@/components/dashboard/configuracoes/config-tabs";

export default async function ConfiguracoesLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
      <ConfigTabs tenantSlug={tenantSlug} />
      <div>{children}</div>
    </div>
  );
}
