import type { Metadata } from "next";
import { getRequestContext } from "@/lib/server/request-context";
import { requirePermission } from "@/lib/rbac/require-permission";
import { listAllProvidersForChannelType } from "@/repositories/channel-provider.repository";
import { WhatsappConnectWizard } from "@/components/dashboard/whatsapp/whatsapp-connect-wizard";

export const metadata: Metadata = { title: "Conectar WhatsApp" };

export default async function ConectarWhatsappPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const ctx = await getRequestContext(tenantSlug);
  requirePermission(ctx, "whatsapp.manage");

  const providers = await listAllProvidersForChannelType("WHATSAPP");

  return <WhatsappConnectWizard tenantSlug={tenantSlug} providers={providers} />;
}
