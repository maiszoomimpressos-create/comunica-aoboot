import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Building2,
  Users,
  ShieldCheck,
  LayoutGrid,
  Plug,
  CreditCard,
  Settings,
} from "lucide-react";
import type { PermissionCode } from "@/lib/rbac/permissions";

export interface NavItem {
  label: string;
  href: (tenantSlug: string) => string;
  icon: LucideIcon;
  permission?: PermissionCode;
}

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: (slug) => `/app/${slug}/dashboard`,
    icon: LayoutDashboard,
  },
  {
    label: "Minha Empresa",
    href: (slug) => `/app/${slug}/empresa`,
    icon: Building2,
    permission: "tenant.view",
  },
  {
    label: "Usuários",
    href: (slug) => `/app/${slug}/usuarios`,
    icon: Users,
    permission: "members.view",
  },
  {
    label: "Papéis",
    href: (slug) => `/app/${slug}/papeis`,
    icon: ShieldCheck,
    permission: "roles.view",
  },
  {
    label: "Módulos",
    href: (slug) => `/app/${slug}/modulos`,
    icon: LayoutGrid,
    permission: "modules.view",
  },
  {
    label: "Integrações",
    href: (slug) => `/app/${slug}/integracoes`,
    icon: Plug,
    permission: "integrations.view",
  },
  {
    label: "Assinatura",
    href: (slug) => `/app/${slug}/assinatura`,
    icon: CreditCard,
    permission: "billing.view",
  },
  {
    label: "Configurações",
    href: (slug) => `/app/${slug}/configuracoes/perfil`,
    icon: Settings,
  },
];
