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
  Send,
  Headset,
  ListChecks,
  Tags,
} from "lucide-react";
import type { PermissionCode } from "@/lib/rbac/permissions";

export interface NavItem {
  label: string;
  href: (tenantSlug: string) => string;
  icon: LucideIcon;
  permission?: PermissionCode;
  /** Staging gate: while a feature is being rebuilt, it's hidden from
   * standard tenant users and only reachable by platform admins via
   * admin > Testar. Flip to `true` when the feature is ready for tenants —
   * also update the matching prefix in `src/proxy.ts`. */
  ready: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: (slug) => `/app/${slug}/dashboard`,
    icon: LayoutDashboard,
    ready: true,
  },
  {
    label: "Campanhas",
    href: (slug) => `/app/${slug}/modulos/whatsapp/campanhas`,
    icon: Send,
    permission: "campaigns.view",
    ready: false,
  },
  {
    label: "Atendimento",
    href: (slug) => `/app/${slug}/modulos/whatsapp/atendimento`,
    icon: Headset,
    permission: "whatsapp.view",
    ready: false,
  },
  {
    label: "Funções",
    href: (slug) => `/app/${slug}/modulos/whatsapp/funcoes`,
    icon: ListChecks,
    permission: "whatsapp.view",
    ready: false,
  },
  {
    label: "Segmentos",
    href: (slug) => `/app/${slug}/modulos/whatsapp/segmentos`,
    icon: Tags,
    permission: "whatsapp.view",
    ready: false,
  },
  {
    label: "Minha Empresa",
    href: (slug) => `/app/${slug}/empresa`,
    icon: Building2,
    permission: "tenant.view",
    ready: false,
  },
  {
    label: "Usuários",
    href: (slug) => `/app/${slug}/usuarios`,
    icon: Users,
    permission: "members.view",
    ready: false,
  },
  {
    label: "Papéis",
    href: (slug) => `/app/${slug}/papeis`,
    icon: ShieldCheck,
    permission: "roles.view",
    ready: false,
  },
  {
    label: "Conectar",
    href: (slug) => `/app/${slug}/modulos`,
    icon: LayoutGrid,
    permission: "modules.view",
    ready: false,
  },
  {
    label: "Integrações",
    href: (slug) => `/app/${slug}/integracoes`,
    icon: Plug,
    permission: "integrations.view",
    ready: false,
  },
  {
    label: "Assinatura",
    href: (slug) => `/app/${slug}/assinatura`,
    icon: CreditCard,
    permission: "billing.view",
    ready: false,
  },
  {
    label: "Configurações",
    href: (slug) => `/app/${slug}/configuracoes/perfil`,
    icon: Settings,
    ready: true,
  },
];
