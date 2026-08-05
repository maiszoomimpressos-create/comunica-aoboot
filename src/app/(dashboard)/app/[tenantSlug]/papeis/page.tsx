import type { Metadata } from "next";
import { getRequestContext } from "@/lib/server/request-context";
import { requirePermission } from "@/lib/rbac/require-permission";
import { listRolesWithPermissions } from "@/repositories/role.repository";
import { RoleManager } from "@/components/dashboard/papeis/role-manager";

export const metadata: Metadata = { title: "Papéis" };

export default async function PapeisPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const ctx = await getRequestContext(tenantSlug);
  requirePermission(ctx, "roles.view");

  const roles = await listRolesWithPermissions(ctx.tenantId);
  const canManage = ctx.permissions.includes("roles.manage");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Papéis e permissões</h1>
        <p className="text-muted-foreground">
          Owner, Admin, Member e Billing são padrão. Crie papéis customizados com o conjunto
          exato de permissões que precisar.
        </p>
      </div>
      <RoleManager tenantSlug={tenantSlug} roles={roles} canManage={canManage} />
    </div>
  );
}
