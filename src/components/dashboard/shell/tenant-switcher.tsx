"use client";

import Link from "next/link";
import { ChevronsUpDown, Check, Plus, Building2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { UserMembership } from "@/repositories/membership.repository";

export function TenantSwitcher({
  memberships,
  currentTenantSlug,
}: {
  memberships: UserMembership[];
  currentTenantSlug: string;
}) {
  const current = memberships.find((m) => m.tenantSlug === currentTenantSlug);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm hover:bg-muted"
          />
        }
      >
        <Building2 className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate font-medium">
          {current?.tenantName ?? "Selecionar empresa"}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Suas empresas</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {memberships.map((m) => (
          <DropdownMenuItem
            key={m.tenantId}
            render={<Link href={`/app/${m.tenantSlug}/dashboard`} />}
          >
            <span className="flex-1 truncate">{m.tenantName}</span>
            {m.tenantSlug === currentTenantSlug && <Check className="size-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/app/nova-empresa" />}>
          <Plus className="size-4" />
          Nova empresa
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
