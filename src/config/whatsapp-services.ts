/**
 * Catalog of API "services" a ChannelConnection's API key can be scoped to
 * — same curated-list philosophy as WHATSAPP_PRODUCTS and
 * whatsapp-notification-types.ts. Each key gates one `/api/v1/whatsapp/**`
 * endpoint: the service function checks `connection.enabledServices`
 * includes its key before doing anything, throwing ForbiddenError
 * otherwise (see sendPurchaseConfirmation / sendBalanceAlert in
 * whatsapp-connection.service.ts).
 *
 * `purchase_confirmation` ships enabled by default on every connection
 * (schema default + existing rows backfilled by its migration) so this
 * catalog's introduction never breaks the tipo7 integration already live
 * in production — the checkbox is opt-OUT for the service that already
 * existed, opt-IN for every new one.
 */
export interface WhatsappServiceDef {
  key: string;
  label: string;
  description: string;
  /** Endpoint this service gates — shown next to the checkbox so a tenant
   * can tell what it controls. */
  endpoint: string;
}

export const WHATSAPP_SERVICES: WhatsappServiceDef[] = [
  {
    key: "purchase_confirmation",
    label: "Confirmação de compra / ingresso",
    description: "Mensagens de compra, ingresso, estacionamento, agendamento e lista de espera.",
    endpoint: "POST /api/v1/whatsapp/purchase-confirmation",
  },
  {
    key: "balance_alert",
    label: "Alerta de saldo baixo",
    description: "Avisa os números cadastrados quando seu sistema externo reporta saldo baixo.",
    endpoint: "POST /api/v1/whatsapp/balance-alert",
  },
];

export const DEFAULT_ENABLED_SERVICES = ["purchase_confirmation"];

export function isValidServiceKey(key: string): boolean {
  return WHATSAPP_SERVICES.some((s) => s.key === key);
}
