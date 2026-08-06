import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getRequestContext } from "@/lib/server/request-context";
import { requirePermission } from "@/lib/rbac/require-permission";
import { WHATSAPP_PRODUCTS } from "@/config/whatsapp-products";
import { WhatsappProductCard } from "@/components/dashboard/whatsapp/whatsapp-product-card";

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
          Escolha o tipo de uso pra configurar — cada um tem seu próprio fluxo de conexão.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {WHATSAPP_PRODUCTS.map((product) => (
          <WhatsappProductCard key={product.key} tenantSlug={tenantSlug} product={product} />
        ))}
      </div>
    </div>
  );
}
