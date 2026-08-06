"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Building2, Users, CreditCard, LayoutGrid, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { siteConfig } from "@/config/site";

const ITEMS = [
  { label: "Visão geral", href: "/admin", icon: LayoutDashboard },
  { label: "Empresas", href: "/admin/empresas", icon: Building2 },
  { label: "Usuários", href: "/admin/usuarios", icon: Users },
  { label: "Planos", href: "/admin/planos", icon: CreditCard },
  { label: "Módulos", href: "/admin/modulos", icon: LayoutGrid },
  { label: "WhatsApp", href: "/admin/whatsapp", icon: MessageCircle },
];

export function AdminSidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground lg:flex">
      <div className="flex h-14 items-center px-4 text-sm font-semibold tracking-tight">
        {siteConfig.name} <span className="ml-2 text-muted-foreground">/ admin</span>
      </div>
      <nav className="flex-1 space-y-0.5 px-3">
        {ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
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
      <div className="p-3">
        <Link href="/app" className="text-xs text-muted-foreground underline underline-offset-4">
          Voltar para o app
        </Link>
      </div>
    </aside>
  );
}
