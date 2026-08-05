"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-config";
import { TenantSwitcher } from "./tenant-switcher";
import type { UserMembership } from "@/repositories/membership.repository";
import type { PermissionCode } from "@/lib/rbac/permissions";
import { siteConfig } from "@/config/site";

export function Sidebar({
  tenantSlug,
  permissions,
  memberships,
}: {
  tenantSlug: string;
  permissions: PermissionCode[];
  memberships: UserMembership[];
}) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => !item.permission || permissions.includes(item.permission));

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground lg:flex">
      <div className="flex h-14 items-center px-4 text-sm font-semibold tracking-tight">
        {siteConfig.name}
      </div>

      <div className="px-3 pb-3">
        <TenantSwitcher memberships={memberships} currentTenantSlug={tenantSlug} />
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {items.map((item) => {
          const href = item.href(tenantSlug);
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={item.label}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="size-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
