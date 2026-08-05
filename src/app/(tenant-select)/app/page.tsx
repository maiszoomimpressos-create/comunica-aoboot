import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { getAuthenticatedUser } from "@/lib/server/request-context";
import { listMembershipsForUser } from "@/repositories/membership.repository";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Selecionar empresa" };

export default async function TenantSelectPage() {
  const user = await getAuthenticatedUser();
  const memberships = await listMembershipsForUser(user.id);

  if (memberships.length === 0) {
    redirect("/app/nova-empresa");
  }
  if (memberships.length === 1) {
    redirect(`/app/${memberships[0].tenantSlug}/dashboard`);
  }

  return (
    <div className="mx-auto max-w-lg py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Selecione uma empresa</h1>
      <p className="mt-2 text-muted-foreground">
        Você faz parte de mais de uma empresa nesta plataforma.
      </p>

      <div className="mt-8 space-y-3">
        {memberships.map((m) => (
          <Link key={m.tenantId} href={`/app/${m.tenantSlug}/dashboard`}>
            <Card className="flex-row items-center gap-3 p-4 transition-colors hover:bg-muted">
              <Building2 className="size-5 text-muted-foreground" />
              <div>
                <p className="font-medium">{m.tenantName}</p>
                <p className="text-sm text-muted-foreground capitalize">{m.roleKey}</p>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <Link
        href="/app/nova-empresa"
        className="mt-6 inline-block text-sm text-muted-foreground underline underline-offset-4"
      >
        Criar uma nova empresa
      </Link>
    </div>
  );
}
