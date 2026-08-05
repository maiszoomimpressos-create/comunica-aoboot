"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function ConfigTabs({ tenantSlug }: { tenantSlug: string }) {
  const pathname = usePathname();
  const tabs = [
    { label: "Perfil", href: `/app/${tenantSlug}/configuracoes/perfil` },
    { label: "Segurança", href: `/app/${tenantSlug}/configuracoes/seguranca` },
    { label: "Preferências", href: `/app/${tenantSlug}/configuracoes/preferencias` },
  ];

  return (
    <div className="flex gap-1 border-b border-border">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            "border-b-2 px-3 py-2 text-sm transition-colors",
            pathname === tab.href
              ? "border-primary font-medium text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
