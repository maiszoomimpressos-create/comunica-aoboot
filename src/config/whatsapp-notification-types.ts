import { ValidationError } from "@/lib/server/errors";

/**
 * Catalog of WhatsApp notification types the purchase-confirmation API
 * supports — same philosophy as WHATSAPP_PRODUCTS and the provider
 * abstraction: a small, curated, code-owned list (never free text from the
 * caller) so message wording stays consistent, with adding a new niche's
 * notification type being a one-entry addition here, not a new endpoint.
 *
 * Each type owns its own message template and declares what it needs:
 * `requiresQr` gates whether `qrData` is mandatory in the request (tickets,
 * parking vouchers — anything meant to be scanned); `requiredDetailKeys`
 * gates which free-form `details` keys must be present (e.g. an
 * appointment needs a date/time that nothing else does).
 */

export interface NotificationDetails {
  [key: string]: string;
}

export interface BuildMessageInput {
  /** The recipient's own WhatsApp display name — best-effort, see
   * ZApiProvider.getContactName. Null when unavailable; templates must
   * greet generically in that case. */
  whatsappName: string | null;
  /** The name registered for this person in the caller's own system —
   * never the WhatsApp profile name (see whatsapp-connection.service.ts
   * for why both matter). */
  recipientName: string;
  /** Tenant's configured business name (Minha Empresa), falls back to the
   * tenant's regular name — resolved by the caller before invoking this. */
  businessName: string;
  details: NotificationDetails;
}

export interface NotificationTypeDef {
  key: string;
  label: string;
  requiresQr: boolean;
  requiredDetailKeys: string[];
  buildMessage(input: BuildMessageInput): string;
}

// WhatsApp renders *text* as bold client-side — no special API support
// needed, just send the asterisks as part of the plain text.
function bold(text: string): string {
  return `*${text}*`;
}

function greet(whatsappName: string | null): string {
  return whatsappName ? `Olá, ${bold(whatsappName)}!` : "Olá!";
}

/** `isoDate` is UTC (ISO 8601, e.g. "2026-12-15T22:00:00.000Z") — converted
 * here to America/Sao_Paulo for display, since the caller (tipo7) sends it
 * raw in UTC and expects us to handle the timezone conversion. Returns
 * null for empty/invalid input so callers can skip the line entirely
 * instead of showing a broken date. */
function formatEventDateTime(isoDate: string | undefined): string | null {
  if (!isoDate?.trim()) return null;
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return null;
  const datePart = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
  const timePart = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${datePart} às ${timePart}`;
}

/** `local`/`cidade`/`estado` are all optional (tipo7's contract: may come
 * as "") — combines whichever are present into one line, or null if none
 * are. */
function formatLocation(details: NotificationDetails): string | null {
  const parts: string[] = [];
  if (details.local?.trim()) parts.push(details.local.trim());
  const cityState = [details.cidade?.trim(), details.estado?.trim()].filter(Boolean).join("/");
  if (cityState) parts.push(cityState);
  return parts.length > 0 ? parts.join(" - ") : null;
}

export const DEFAULT_NOTIFICATION_TYPE = "compra_confirmada";

export const NOTIFICATION_TYPES: NotificationTypeDef[] = [
  {
    key: "compra_confirmada",
    label: "Compra confirmada",
    requiresQr: false,
    requiredDetailKeys: [],
    buildMessage: ({ whatsappName, recipientName, businessName }) =>
      `${greet(whatsappName)} O pedido comprado em ${businessName}, por ${bold(recipientName)}, foi aprovado com sucesso.`,
  },
  {
    key: "ingresso_emitido",
    label: "Ingresso emitido",
    requiresQr: true,
    // Contrato definido pelo lado da Tipo7 (em produção desde 08/08/2026):
    // `nome_evento` e `ingresso` (tipo do ingresso — Pista/VIP/etc, sempre
    // singular já que cada chamada é 1 ingresso só) sempre vêm
    // preenchidos; `data` (ISO 8601 UTC), `local`, `cidade`, `estado`
    // podem vir "" — tratados como opcionais na mensagem (a linha
    // correspondente some quando vêm vazios, ver formatEventDateTime /
    // formatLocation).
    requiredDetailKeys: ["nome_evento", "ingresso"],
    buildMessage: ({ whatsappName, recipientName, businessName, details }) => {
      const lines = [
        greet(whatsappName),
        "",
        `Seu ingresso ${bold(details.ingresso)} para ${bold(details.nome_evento)} em ${businessName} foi aprovado com sucesso.`,
      ];
      const when = formatEventDateTime(details.data);
      if (when) lines.push(`📅 ${when}`);
      const where = formatLocation(details);
      if (where) lines.push(`📍 ${where}`);
      lines.push("", `Comprado por: ${bold(recipientName)}`);
      return lines.join("\n");
    },
  },
  {
    key: "estacionamento_emitido",
    label: "Comprovante de estacionamento emitido",
    requiresQr: true,
    // `local`: nome/endereço do estacionamento. `placa`/`cor`/`modelo`: do
    // veículo. `data`/`horario`: mesmos nomes de ingresso_emitido e
    // agendamento_confirmado, por consistência. Serve os 3 momentos de
    // venda (junto com o ingresso, depois pelo site, ou avulso na hora do
    // portão) — mesma estrutura de dados nos três, só muda quem dispara.
    requiredDetailKeys: ["local", "placa", "cor", "modelo", "data", "horario"],
    buildMessage: ({ whatsappName, recipientName, details }) =>
      `${greet(whatsappName)}\n\nSeu comprovante de estacionamento em ${bold(details.local)} foi aprovado com sucesso.\n\n🚗 ${details.modelo} - ${details.cor} - Placa ${details.placa}\n📅 ${details.data} às ${details.horario}\n\nComprado por: ${bold(recipientName)}`,
  },
  {
    key: "estacionamento_liberado",
    label: "Entrada no estacionamento liberada (ticket de saída)",
    requiresQr: true,
    // Disparado no momento em que o carro efetivamente entra — seja depois
    // de validar um estacionamento_emitido comprado antes, seja por
    // pagamento na hora do portão. O qrData aqui é um código NOVO,
    // diferente do da compra: é o que libera a SAÍDA do veículo depois,
    // não a entrada.
    requiredDetailKeys: ["local", "placa", "cor", "modelo", "horario"],
    buildMessage: ({ whatsappName, details }) =>
      `${greet(whatsappName)}\n\nSeu veículo ${bold(`${details.modelo} - ${details.cor} - Placa ${details.placa}`)} entrou no estacionamento ${bold(details.local)} às ${details.horario}.\n\nGuarde este QR code — você vai precisar apresentá-lo na saída para liberar o veículo.`,
  },
  {
    key: "lista_espera",
    label: "Entrada na lista de espera",
    requiresQr: false,
    requiredDetailKeys: [],
    buildMessage: ({ whatsappName, businessName }) =>
      `${greet(whatsappName)} Você entrou na lista de espera em ${businessName}. Assim que houver uma vaga, avisamos por aqui.`,
  },
  {
    key: "agendamento_confirmado",
    label: "Agendamento confirmado",
    requiresQr: false,
    requiredDetailKeys: ["data", "horario"],
    buildMessage: ({ whatsappName, businessName, details }) =>
      `${greet(whatsappName)} Seu agendamento em ${businessName} foi confirmado para ${details.data} às ${details.horario}.`,
  },
];

/** Resolves a type key to its definition — `undefined` falls back to the
 * generic default (compra_confirmada), matching the API's pre-catalog
 * behavior for callers that don't send `type` at all. Throws for an
 * unknown key rather than silently falling back, so a typo in the
 * caller's integration surfaces immediately instead of sending the wrong
 * message. */
export function getNotificationType(key: string | undefined): NotificationTypeDef {
  const resolved = key?.trim() || DEFAULT_NOTIFICATION_TYPE;
  const found = NOTIFICATION_TYPES.find((t) => t.key === resolved);
  if (!found) {
    throw new ValidationError(
      `Tipo de notificação inválido: "${resolved}". Tipos disponíveis: ${NOTIFICATION_TYPES.map((t) => t.key).join(", ")}.`
    );
  }
  return found;
}
