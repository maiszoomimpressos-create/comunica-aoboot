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
