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
