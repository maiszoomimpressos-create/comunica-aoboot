export interface IntegrationProvider {
  key: string;
  name: string;
  description: string;
  category: string;
}

/**
 * Static catalog for the "Integrações" area — layout placeholders only,
 * no real provider wiring yet (that's a future phase). Kept separate from
 * the `Module` DB table (the marketplace) since integrations will likely
 * need their own provider-specific config screens later.
 */
export const INTEGRATION_PROVIDERS: IntegrationProvider[] = [
  { key: "whatsapp", name: "WhatsApp", category: "messaging", description: "Atendimento e automação via WhatsApp." },
  { key: "telegram", name: "Telegram", category: "messaging", description: "Atendimento e automação via Telegram." },
  { key: "instagram", name: "Instagram", category: "social", description: "Mensagens diretas e comentários do Instagram." },
  { key: "email", name: "E-mail", category: "messaging", description: "Caixa de entrada de e-mail integrada." },
  { key: "sms", name: "SMS", category: "messaging", description: "Envio e recebimento de SMS." },
  { key: "payments", name: "Pagamentos", category: "payments", description: "Cobrança e conciliação de pagamentos." },
];

/**
 * Modules with their own dedicated in-app area (a wizard, a management
 * dashboard, etc.) instead of just a marketplace install/uninstall toggle.
 * `ModuleCard` links straight into this route once the module is available
 * (`!isComingSoon`) rather than showing the generic install `Switch`. Adding
 * a new module's own area later = add one entry here, nothing else in the
 * marketplace changes.
 */
export const MODULE_APP_ROUTES: Record<string, (tenantSlug: string) => string> = {
  whatsapp: (tenantSlug) => `/app/${tenantSlug}/modulos/whatsapp`,
};
