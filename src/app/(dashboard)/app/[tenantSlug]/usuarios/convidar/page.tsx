import type { Metadata } from "next";
import { getRequestContext } from "@/lib/server/request-context";
import { requirePermission } from "@/lib/rbac/require-permission";
import { prisma } from "@/lib/db/prisma";
import { InviteUserForm } from "@/components/dashboard/usuarios/invite-user-form";

export const metadata: Metadata = { title: "Convidar usuário" };

export default async function ConvidarPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const ctx = await getRequestContext(tenantSlug);
  requirePermission(ctx, "members.invite");

  const roles = await prisma.role.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Convidar usuário</h1>
        <p className="text-muted-foreground">
          Enviaremos um link de convite por e-mail (válido por 7 dias).
        </p>
      </div>
      <InviteUserForm tenantSlug={tenantSlug} roles={roles} />
    </div>
  );
}
