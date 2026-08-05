/**
 * Catálogo central de permissões granulares do RBAC por tenant. Cada código
 * vira uma linha em `Permission` (seed) e é referenciado por
 * `RolePermission`. Adicionar uma permissão nova = adicionar aqui + rodar o
 * seed novamente; nada mais no código precisa mudar.
 */
export const PERMISSIONS = [
  { code: "tenant.view", category: "tenant", description: "Ver dados da empresa" },
  { code: "tenant.update", category: "tenant", description: "Editar dados da empresa" },

  { code: "members.view", category: "members", description: "Ver usuários da empresa" },
  { code: "members.invite", category: "members", description: "Convidar novos usuários" },
  { code: "members.remove", category: "members", description: "Remover usuários da empresa" },
  { code: "members.update_role", category: "members", description: "Alterar o papel de um usuário" },

  { code: "roles.view", category: "roles", description: "Ver papéis e permissões" },
  { code: "roles.manage", category: "roles", description: "Criar, editar e excluir papéis" },

  { code: "billing.view", category: "billing", description: "Ver plano e assinatura" },
  { code: "billing.manage", category: "billing", description: "Alterar plano, forma de pagamento e cancelamento" },

  { code: "modules.view", category: "modules", description: "Ver marketplace de módulos" },
  { code: "modules.manage", category: "modules", description: "Instalar e remover módulos" },

  { code: "integrations.view", category: "integrations", description: "Ver integrações disponíveis" },
  { code: "integrations.manage", category: "integrations", description: "Configurar integrações" },

  { code: "settings.view", category: "settings", description: "Ver configurações" },
  { code: "settings.manage", category: "settings", description: "Alterar configurações" },

  { code: "audit.view", category: "audit", description: "Ver o log de auditoria" },
] as const;

export type PermissionCode = (typeof PERMISSIONS)[number]["code"];
