import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { WhatsappProduct } from "@/config/whatsapp-products";

export function WhatsappProductCard({
  tenantSlug,
  product,
}: {
  tenantSlug: string;
  product: WhatsappProduct;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium">{product.name}</h3>
        {!product.available && <Badge variant="secondary">Em breve</Badge>}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{product.description}</p>
    </>
  );

  if (!product.available) {
    return <Card className="p-6 opacity-60">{body}</Card>;
  }

  return (
    <Link href={`/app/${tenantSlug}/modulos/whatsapp/conectar/${product.key}`}>
      <Card className="p-6 transition-colors hover:bg-muted">{body}</Card>
    </Link>
  );
}
