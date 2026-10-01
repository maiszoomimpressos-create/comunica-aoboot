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
  {
    key: "verification_code",
    label: "Código de verificação (2FA)",
    description:
      "Manda um código de confirmação (ex: 2º fator de acesso a um terminal/painel). Mesmo endpoint de purchase-confirmation, type: \"codigo_verificacao\".",
    endpoint: "POST /api/v1/whatsapp/purchase-confirmation",
  },
];

// Opt-in — ao contrário de purchase_confirmation (que já vinha ligado pra
// não quebrar quem já integrava antes deste catálogo existir), todo serviço
// novo daqui pra frente nasce desligado: o tenant precisa habilitar
// explicitamente antes do caller conseguir usá-lo.
export const DEFAULT_ENABLED_SERVICES = ["purchase_confirmation"];

export function isValidServiceKey(key: string): boolean {
  return WHATSAPP_SERVICES.some((s) => s.key === key);
}

/** Resolves a service key to its display label — used to build a specific
 * "este serviço (X) não está habilitado" message per notification type,
 * instead of a message hardcoded to purchase_confirmation's label. Falls
 * back to the raw key if somehow unknown (should never happen — every
 * NotificationTypeDef.serviceKey must point at a real entry here). */
export function getServiceLabel(key: string): string {
  return WHATSAPP_SERVICES.find((s) => s.key === key)?.label ?? key;
}
