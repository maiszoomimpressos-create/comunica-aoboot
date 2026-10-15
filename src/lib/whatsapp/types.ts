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

export interface SendMessageResult {
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
}

export interface ProviderContact {
  phone: string;
  /** Only ever a real, human-set name — same "not a formatted phone
   * number" filtering as ContactNameResult, applied per-entry. */
  name?: string;
}

export interface ListContactsResult {
  ok: boolean;
  contacts: ProviderContact[];
  message: string;
  raw?: unknown;
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
}

export interface GroupParticipantsResult {
  ok: boolean;
  participants: GroupParticipant[];
  message: string;
  raw?: unknown;
}
