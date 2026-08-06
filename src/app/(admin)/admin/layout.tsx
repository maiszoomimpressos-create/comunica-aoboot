import { requirePlatformAdmin } from "@/lib/server/request-context";
import { countPendingConnectionsForAdmin } from "@/repositories/channel-connection.repository";
import { AdminSidebar } from "@/components/admin/shell/admin-sidebar";
import { AdminUserMenu } from "@/components/admin/shell/admin-user-menu";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePlatformAdmin();
  const pendingWhatsappRequests = await countPendingConnectionsForAdmin();

  return (
    <div className="flex min-h-svh">
      <AdminSidebar pendingWhatsappRequests={pendingWhatsappRequests} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-end border-b border-border px-4 lg:px-6">
          <AdminUserMenu name={user.name} email={user.email} image={user.image} />
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
