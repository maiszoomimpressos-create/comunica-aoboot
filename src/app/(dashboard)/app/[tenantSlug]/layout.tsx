import { getRequestContext, getAuthenticatedUser } from "@/lib/server/request-context";
import { listMembershipsForUser } from "@/repositories/membership.repository";
import { Sidebar } from "@/components/dashboard/shell/sidebar";
import { Topbar } from "@/components/dashboard/shell/topbar";

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const ctx = await getRequestContext(tenantSlug);
  const user = await getAuthenticatedUser();
  const memberships = await listMembershipsForUser(ctx.userId);

  return (
    <div className="flex min-h-svh">
      <Sidebar tenantSlug={tenantSlug} permissions={ctx.permissions} memberships={memberships} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          tenantSlug={tenantSlug}
          permissions={ctx.permissions}
          user={{ name: user.name, email: user.email, image: user.image }}
        />
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
