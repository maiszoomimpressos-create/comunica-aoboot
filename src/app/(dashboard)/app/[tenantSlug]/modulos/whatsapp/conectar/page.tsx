import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getRequestContext } from "@/lib/server/request-context";
import { requirePermission } from "@/lib/rbac/require-permission";
import { WhatsappProductRequestForm } from "@/components/dashboard/whatsapp/whatsapp-product-request-form";

export const metadata: Metadata = { title: "WhatsApp" };

export default async function WhatsappProductsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const ctx = await getRequestContext(tenantSlug);
  requirePermission(ctx, "whatsapp.manage");

  return (
    <div className="max-w-2xl space-y-6">
      <Link
        href={`/app/${tenantSlug}/modulos/whatsapp`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        WhatsApp
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">O que você quer fazer com o WhatsApp?</h1>
        <p className="text-muted-foreground">
          Marque o que você quer usar e informe o número — nossa equipe configura a conexão pra
          você.
        </p>
      </div>

      <WhatsappProductRequestForm tenantSlug={tenantSlug} />
    </div>
  );
}
