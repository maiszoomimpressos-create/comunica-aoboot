import type {
  QrCodeResult,
  SendMessageResult,
  TestConnectionResult,
  WhatsappConnectionConfig,
} from "./types";

/**
 * Contract every WhatsApp provider (Z-API today; Meta Cloud API, Evolution
 * API, ... later) must implement. Swapping/adding a provider means writing
 * a new class implementing this interface and registering it in
 * registry.ts — nothing in services/actions/UI changes.
 *
 * Implementations must never throw: connectivity/auth/HTTP failures are
 * reported as a normal `{ ok: false, ... }` result, since callers show
 * these directly as UI state (see PROVIDER_ABSTRACTION in the module plan).
 */
export interface WhatsappProvider {
  key: string;
  testConnection(config: WhatsappConnectionConfig): Promise<TestConnectionResult>;
  sendMessage(
    config: WhatsappConnectionConfig,
    to: string,
    text: string
  ): Promise<SendMessageResult>;
  /** `image` is a URL or a `data:image/...;base64,...` data URI — never a raw Buffer,
   * so every provider implementation can pass it straight through to its own API. */
  sendImage(
    config: WhatsappConnectionConfig,
    to: string,
    image: string,
    caption?: string
  ): Promise<SendMessageResult>;
  /** Fetches the QR code the account owner scans (with the phone that owns
   * the number) to pair the WhatsApp session — a one-time step needed even
   * after credentials are valid; see AWAITING_QR_SCAN. */
  getQrCode(config: WhatsappConnectionConfig): Promise<QrCodeResult>;
}
