import Link from "next/link";
import { MessageCircle, Camera, Mail, MessageSquare, CreditCard, Puzzle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { IntegrationProvider } from "@/config/modules-catalog";

const ICONS: Record<string, typeof Puzzle> = {
  whatsapp: MessageCircle,
  telegram: MessageCircle,
  instagram: Camera,
  email: Mail,
  sms: MessageSquare,
  payments: CreditCard,
};

export function IntegrationCard({
  tenantSlug,
  provider,
}: {
  tenantSlug: string;
  provider: IntegrationProvider;
}) {
  const Icon = ICONS[provider.key] ?? Puzzle;
  return (
    <Link href={`/app/${tenantSlug}/integracoes/${provider.key}`}>
      <Card className="p-6 transition-colors hover:bg-muted">
        <div className="flex items-start justify-between">
          <Icon className="size-6 text-primary" />
          <Badge variant="secondary">Em breve</Badge>
        </div>
        <h3 className="mt-4 font-medium">{provider.name}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{provider.description}</p>
      </Card>
    </Link>
  );
}
