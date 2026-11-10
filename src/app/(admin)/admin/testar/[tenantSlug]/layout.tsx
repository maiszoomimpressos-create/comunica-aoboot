import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function AdminTestarTenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  return (
    <div className="space-y-4">
      <Link
        href={`/admin/testar?empresa=${tenantSlug}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Voltar para Testar
      </Link>
      {children}
    </div>
  );
}