import type { Metadata } from "next";
import Link from "next/link";
import { ChevronsUpDown, Check } from "lucide-react";
import { listAllTenants } from "@/repositories/admin.repository";
import { NAV_ITEMS } from "@/components/dashboard/shell/nav-config";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const metadata: Metadata = { title: "Testar · Admin" };

/** Direct access to every tenant-side function (Campanhas, Atendimento,
 * Fluxos, etc.) for the platform admin, including the ones hidden from
 * standard users (`ready: false` in nav-config.ts). The company picker is a
 * small dropdown, not a separate step — clicking a function goes straight
 * into it. */
export default async function AdminTestarPage({
  searchParams,
}: {
  searchParams: Promise<{ empresa?: string }>;
}) {
  const { empresa } = await searchParams;
  const tenants = await listAllTenants();
  const selected = tenants.find((t) => t.slug === empresa) ?? tenants[0];

  if (!selected) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Testar</h1>
        <p className="text-muted-foreground">Nenhuma empresa cadastrada ainda.</p>
      </div>
    );
  }

  const functions = NAV_ITEMS.filter((item) => item.label !== "Dashboard");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Testar</h1>
          <p className="text-muted-foreground">
            Acesso direto às funções, com todas as permissões, mesmo as ainda escondidas dos
            usuários padrão.
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-muted"
              />
            }
          >
            <span className="font-medium">{selected.name}</span>
            <ChevronsUpDown className="size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {tenants.map((t) => (
              <DropdownMenuItem key={t.id} render={<Link href={`/admin/testar?empresa=${t.slug}`} />}>
                <span className="flex-1 truncate">{t.name}</span>
                {t.slug === selected.slug && <Check className="size-4" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {functions.map((item) => (
          <Link
            key={item.label}
            href={item.href(selected.slug).replace(/^\/app\//, "/admin/testar/")}
            className="flex items-center gap-3 rounded-xl border border-border p-4 transition-colors hover:bg-muted"
          >
            <item.icon className="size-5 shrink-0 text-muted-foreground" />
            <span className="flex-1 font-medium">{item.label}</span>
            {!item.ready && <Badge variant="secondary">oculto</Badge>}
          </Link>
        ))}
      </div>
    </div>
  );
}
