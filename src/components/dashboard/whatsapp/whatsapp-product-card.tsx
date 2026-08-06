import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { WhatsappProduct } from "@/config/whatsapp-products";

/** Rendered inside a "use client" parent (WhatsappProductRequestForm) —
 * doesn't need its own "use client" marker, but does receive a function
 * prop, so it can only ever be rendered from a client tree. */
export function WhatsappProductCard({
  product,
  checked,
  onCheckedChange,
}: {
  product: WhatsappProduct;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <Card className={cn("p-6", !product.available && "opacity-60")}>
      <div className="flex items-start justify-between gap-2">
        <label className="flex items-center gap-2">
          <Checkbox
            checked={checked}
            disabled={!product.available}
            onCheckedChange={(value) => onCheckedChange(value === true)}
          />
          <h3 className="font-medium">{product.name}</h3>
        </label>
        {!product.available && <Badge variant="secondary">Em breve</Badge>}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{product.description}</p>
    </Card>
  );
}
