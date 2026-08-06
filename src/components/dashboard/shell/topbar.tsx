"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { UserMenu } from "./user-menu";
import { NAV_ITEMS } from "./nav-config";
import type { PermissionCode } from "@/lib/rbac/permissions";

export function Topbar({
  tenantSlug,
  permissions,
  user,
}: {
  tenantSlug: string;
  permissions: PermissionCode[];
  user: { name: string; email: string; image: string | null; isPlatformAdmin: boolean };
}) {
  const items = NAV_ITEMS.filter((item) => !item.permission || permissions.includes(item.permission));

  return (
    <header className="flex h-14 items-center gap-3 border-b border-border px-4 lg:px-6">
      <Sheet>
        <SheetTrigger
          render={<Button variant="ghost" size="icon" className="lg:hidden" />}
        >
          <Menu className="size-5" />
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <nav className="flex flex-col gap-0.5 p-3 pt-14">
            {items.map((item) => (
              <Link
                key={item.label}
                href={item.href(tenantSlug)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-muted"
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            ))}
          </nav>
        </SheetContent>
      </Sheet>

      <div className="flex-1" />

      <UserMenu
        name={user.name}
        email={user.email}
        image={user.image}
        tenantSlug={tenantSlug}
        isPlatformAdmin={user.isPlatformAdmin}
      />
    </header>
  );
}
