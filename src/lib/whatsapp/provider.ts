import type {
  ContactNameResult,
  ListContactsResult,
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
  /** Same contract as `sendImage`, for video — `video` is a URL or a
   * `data:video/...;base64,...` data URI. Used by the Campanhas module
   * (see whatsapp-campaign-defaults.ts / campaign-dispatcher.service.ts);
   * no other feature sends video today. */
  sendVideo(
    config: WhatsappConnectionConfig,
    to: string,
    video: string,
    caption?: string
  ): Promise<SendMessageResult>;
  /** Best-effort bulk fetch of every contact saved in the connected
   * WhatsApp's own address book — used by the Campanhas module to seed
   * `Contact` rows (see contact.repository.ts's syncContactsFromProvider).
   * Never throws; a failure comes back as `{ ok: false, contacts: [] }`
   * so the caller can show it as normal UI state, same convention as
   * every other provider method. */
  listContacts(config: WhatsappConnectionConfig): Promise<ListContactsResult>;
  /** Fetches the QR code the account owner scans (with the phone that owns
   * the number) to pair the WhatsApp session — a one-time step needed even
   * after credentials are valid; see AWAITING_QR_SCAN. */
  getQrCode(config: WhatsappConnectionConfig): Promise<QrCodeResult>;
  /** Best-effort lookup of the recipient's own WhatsApp display name, used
   * to personalize the purchase-confirmation greeting. Never throws and
   * never blocks a send — a name just isn't included in the greeting when
   * unavailable. */
  getContactName(config: WhatsappConnectionConfig, phone: string): Promise<ContactNameResult>;
}
