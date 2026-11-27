/**
 * Shared types for the WhatsApp provider abstraction. A provider (Z-API,
 * Meta Cloud API, Evolution API, ...) only needs to implement
 * `WhatsappProvider` (see provider.ts) using these shapes — nothing above
 * this layer (services/actions/UI) ever imports a concrete provider class
 * directly.
 */

export interface WhatsappConnectionConfig {
  apiUrl: string;
  apiToken: string;
  phoneNumber: string;
}

export type ConnectionTestStatus =
  | "CONNECTED"
  | "AWAITING_QR_SCAN"
  | "AUTH_ERROR"
  | "UNAVAILABLE"
  | "INVALID_TOKEN"
  | "ERROR";

export interface TestConnectionResult {
  ok: boolean;
  status: ConnectionTestStatus;
  message: string;
  raw?: unknown;
}

/** The real phone number currently paired to the session — distinct from
 * `WhatsappConnectionConfig.phoneNumber`, which is just a user-editable
 * label stored on the connection and can go stale (e.g. after re-pairing a
 * different phone). Lets callers keep that label in sync automatically
 * instead of requiring a manual edit every time the paired device changes. */
export interface GetConnectedPhoneResult {
  ok: boolean;
  phone?: string;
  message: string;
  raw?: unknown;
}

export interface SendMessageResult {
  ok: boolean;
  message: string;
  raw?: unknown;
  /** HTTP status da resposta do provedor (ausente em erro de rede). */
  httpStatus?: number;
  /** true quando nem chegou resposta (rede/timeout) — erro temporário. */
  networkError?: boolean;
  /** Id da mensagem no provedor (Z-API: `messageId`) — liga o callback de
   * status (entregue/lido) ao envio. */
  messageId?: string;
  /** true quando o envio foi pulado por ser repetido (ver receipt-dedup). */
  duplicate?: boolean;
}

/** Resultado do phone-exists: `ok: false` = não deu pra verificar (rede,
 * erro do provedor) — quem chama decide seguir sem a checagem. */
export interface PhoneExistsResult {
  ok: boolean;
  exists?: boolean;
  /** Número no formato que o WhatsApp reconhece (ex.: com o 9º dígito),
   * quando o provedor devolve. */
  phone?: string;
  message: string;
  raw?: unknown;
}

/** One "open a link" button (Z-API `buttonActions` item of type URL). */
export interface LinkButtonAction {
  id: string;
  label: string;
  url: string;
}

/** Result of a send with link buttons. `fallbackSafe` is true only when the
 * provider answered with an HTTP error (it refused the message) — resending
 * as plain text then can't duplicate it. A timeout, a dropped connection or
 * a 2xx is never fallbackSafe (the message may already be on its way). */
export interface SendLinkButtonsResult extends SendMessageResult {
  fallbackSafe: boolean;
}

/** Optional per-send pacing, forwarded as-is to the provider. Z-API shows
 * "Digitando..."/"Gravando áudio..." to the recipient for `delayTyping`
 * seconds (1-15) before the message lands, then waits `delayMessage`
 * seconds (1-15) more before it's actually delivered — used by the AI
 * attendant so a reply doesn't appear instantly, which reads as
 * unmistakably robotic (see bot-attendant.service.ts). */
export interface SendMessageOptions {
  delayTyping?: number;
  delayMessage?: number;
}

/** Resultado de configurar (ou limpar) a URL de um webhook na instância do
 * provedor — ex.: Z-API `update-webhook-chat-presence`. Never throws, same
 * convention as every other provider method. */
export interface UpdateWebhookResult {
  ok: boolean;
  message: string;
  raw?: unknown;
}

export interface QrCodeResult {
  ok: boolean;
  /** `data:image/png;base64,...` data URI, present only when ok. */
  image?: string;
  message: string;
  raw?: unknown;
}

export interface ContactNameResult {
  ok: boolean;
  /** Present only when a real, human-set name was found — never a
   * formatted-phone-number fallback (see ZApiProvider.getContactName). */
  name?: string;
  nameSource?: "agenda" | "perfil" | "whatsapp";
}

export interface ProviderContact {
  phone: string;
  /** Only ever a real, human-set name — same "not a formatted phone
   * number" filtering as ContactNameResult, applied per-entry. */
  name?: string;
  /** "agenda" (name/short) ou "perfil" (vname/notify) — ver
   * lib/whatsapp/contact-name.ts. Presente sempre que `name` estiver. */
  nameSource?: "agenda" | "perfil" | "whatsapp";
}

export interface ListContactsResult {
  ok: boolean;
  contacts: ProviderContact[];
  message: string;
  raw?: unknown;
  /** Entradas descartadas por não serem telefone discável (@lid, grupo...). */
  skipped?: number;
}

export interface ProviderGroup {
  /** WhatsApp's own group JID, e.g. "120263358412332916-group" — opaque
   * identifier, used as-is to fetch the group's participants later. */
  id: string;
  name: string;
}

export interface ListGroupsResult {
  ok: boolean;
  groups: ProviderGroup[];
  message: string;
  raw?: unknown;
}

export interface GroupParticipant {
  phone: string;
  /** Only ever a real, human-set name — same filtering as ProviderContact. */
  name?: string;
  nameSource?: "agenda" | "perfil" | "whatsapp";
}

export interface GroupParticipantsResult {
  ok: boolean;
  participants: GroupParticipant[];
  message: string;
  raw?: unknown;
  /** Participantes descartados: o WhatsApp só mandou um id "@lid" (número
   * real oculto) ou um valor que não é telefone. */
  skipped?: number;
}
