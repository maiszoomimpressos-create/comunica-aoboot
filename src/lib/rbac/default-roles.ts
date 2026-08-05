import { PERMISSIONS, type PermissionCode } from "./permissions";

const ALL_CODES = PERMISSIONS.map((p) => p.code) as PermissionCode[];
const VIEW_ONLY_CODES = ALL_CODES.filter((code) => code.endsWith(".view"));

/**
 * Papéis seedados automaticamente para todo tenant novo no onboarding
 * (`services/onboarding.service.ts`). `isSystem: true` — não podem ser
 * excluídos, mas o tenant pode criar papéis adicionais customizados via
 * `/app/[slug]/papeis` com qualquer subconjunto de `PERMISSIONS`.
 */
export const DEFAULT_TENANT_ROLES: Array<{
  key: string;
  name: string;
  permissions: PermissionCode[];
}> = [
  {
    key: "owner",
    name: "Owner",
    permissions: ALL_CODES,
  },
  {
    key: "admin",
    name: "Admin",
    permissions: ALL_CODES.filter((code) => code !== "billing.manage"),
  },
  {
    key: "member",
    name: "Member",
    permissions: VIEW_ONLY_CODES,
  },
  {
    key: "billing",
    name: "Billing",
    permissions: ["tenant.view", "billing.view", "billing.manage"],
  },
];
