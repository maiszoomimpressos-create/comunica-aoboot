import type { Metadata } from "next";
import Link from "next/link";
import { getRequestContext } from "@/lib/server/request-context";
import { requirePermission } from "@/lib/rbac/require-permission";
import { listMembersForTenant } from "@/repositories/membership.repository";
import { listInvitationsForTenant } from "@/repositories/invitation.repository";
import { prisma } from "@/lib/db/prisma";
import { Button } from "@/components/ui/button";
import { MembersTable } from "@/components/dashboard/usuarios/members-table";

export const metadata: Metadata = { title: "Usuários" };

export default async function UsuariosPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const ctx = await getRequestContext(tenantSlug);
  requirePermission(ctx, "members.view");

  const [members, invitations, roles] = await Promise.all([
    listMembersForTenant(ctx.tenantId),
    listInvitationsForTenant(ctx.tenantId),
    prisma.role.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { name: "asc" } }),
  ]);

  const canManage = ctx.permissions.includes("members.update_role") || ctx.permissions.includes("members.remove");
  const canInvite = ctx.permissions.includes("members.invite");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
          <p className="text-muted-foreground">
            {members.length} {members.length === 1 ? "pessoa" : "pessoas"} nesta empresa.
          </p>
        </div>
        {canInvite && (
          <Button render={<Link href={`/app/${tenantSlug}/usuarios/convidar`} />}>
            Convidar usuário
          </Button>
        )}
      </div>

      <MembersTable
        tenantSlug={tenantSlug}
        members={members}
        invitations={invitations}
        roles={roles}
        currentUserId={ctx.userId}
        canManage={canManage}
      />
    </div>
  );
}
