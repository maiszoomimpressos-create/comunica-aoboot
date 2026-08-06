import { getRequestContext, getAuthenticatedUser } from "@/lib/server/request-context";
import { listMembershipsForUser } from "@/repositories/membership.repository";
import { countPendingConnectionsForAdmin } from "@/repositories/channel-connection.repository";
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
  // Only queried for platform staff — regular tenant users never see this
  // button, no point paying for the count on every dashboard page load.
  const pendingWhatsappRequests = user.isPlatformAdmin
    ? await countPendingConnectionsForAdmin()
    : 0;

  return (
    <div className="flex min-h-svh">
      <Sidebar
        tenantSlug={tenantSlug}
        permissions={ctx.permissions}
        memberships={memberships}
        isPlatformAdmin={user.isPlatformAdmin}
        pendingWhatsappRequests={pendingWhatsappRequests}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          tenantSlug={tenantSlug}
          permissions={ctx.permissions}
          user={{
            name: user.name,
            email: user.email,
            image: user.image,
            isPlatformAdmin: user.isPlatformAdmin,
          }}
        />
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
