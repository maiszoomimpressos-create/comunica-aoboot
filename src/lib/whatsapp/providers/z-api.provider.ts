import type { WhatsappProvider } from "../provider";
import type {
  ContactNameResult,
  GetConnectedPhoneResult,
  GroupParticipantsResult,
  LinkButtonAction,
  ListContactsResult,
  ListGroupsResult,
  PhoneExistsResult,
  ProviderContact,
  ProviderGroup,
  QrCodeResult,
  SendLinkButtonsResult,
  SendMessageOptions,
  SendMessageResult,
  TestConnectionResult,
  UpdateWebhookResult,
  WhatsappConnectionConfig,
} from "../types";
import { pickZapiContactName } from "../contact-name";
import { sanitizeWhatsappPhone } from "../phone-sanitize";
import { extractProviderMessageId } from "../../campaigns/delivery-status";

/** Z-API only accepts 1-15 for both delay fields — out-of-range values are
 * silently ignored by the API, so clamp here instead of trusting callers. */
function clampDelaySeconds(seconds: number): number {
  return Math.min(15, Math.max(1, Math.round(seconds)));
}

function delayFields(options?: SendMessageOptions): Record<string, number> {
  const fields: Record<string, number> = {};
  if (options?.delayTyping !== undefined) fields.delayTyping = clampDelaySeconds(options.delayTyping);
  if (options?.delayMessage !== undefined) fields.delayMessage = clampDelaySeconds(options.delayMessage);
  return fields;
}

const REQUEST_TIMEOUT_MS = 15_000;

/** JSON body for Z-API `send-button-actions` with URL buttons only —
 * exported so tests/previews can show exactly what goes out (no token:
 * the instance token lives in the URL, never in the body). */
export function buildLinkButtonsBody(
  to: string,
  text: string,
  buttons: LinkButtonAction[],
  image?: string
): Record<string, unknown> {
  return {
    phone: to,
    message: text,
    ...(image ? { image } : {}),
    buttonActions: buttons.map((b) => ({ id: b.id, type: "URL", url: b.url, label: b.label })),
  };
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** `{ name, nameSource }` pra espalhar num ProviderContact (ou nada). */
function pickedFields(
  row: Record<string, unknown>,
  forcedSource?: "whatsapp"
): { name?: string; nameSource?: "agenda" | "perfil" | "whatsapp" } {
  const picked = pickZapiContactName(row);
  if (!picked) return {};
  return { name: picked.name, nameSource: forcedSource ?? (picked.source === "agenda" ? "agenda" : "perfil") };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function buildHeaders(apiToken: string, extra?: Record<string, string>): HeadersInit {
  const headers: Record<string, string> = { ...extra };
  if (apiToken) headers["Client-Token"] = apiToken;
  return headers;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Z-API (https://z-api.io) client. Endpoint shapes confirmed against the
 * official docs (developer.z-api.io):
 *
 * - "URL da Instância" is the full base URL Z-API's own dashboard gives
 *   you to copy: https://api.z-api.io/instances/{instanceId}/token/{token}
 *   — we just append /status or /send-text to it.
 * - "Token da API" maps to Z-API's separate, optional account-level
 *   "Client-Token" security header (distinct from the instance token
 *   already embedded in the instance URL above; only enforced by Z-API if
 *   the account owner activated it in their dashboard).
 *
 * Never throws — every failure mode (network error, timeout, non-2xx,
 * unexpected body) resolves to a typed result so callers can show it
 * directly as UI state.
 *
 * `send-image` accepts `image` as either a URL or a
 * `data:image/png;base64,...` data URI, plus an optional `caption` — used
 * for the purchase-confirmation QR code send (see whatsapp-connection.service.ts).
 */
export class ZApiProvider implements WhatsappProvider {
  key = "z-api";

  async testConnection(config: WhatsappConnectionConfig): Promise<TestConnectionResult> {
    const url = `${trimTrailingSlash(config.apiUrl)}/status`;

    let response: Response;
    try {
      response = await fetchWithTimeout(url, {
        method: "GET",
        headers: buildHeaders(config.apiToken),
      });
    } catch {
      return {
        ok: false,
        status: "UNAVAILABLE",
        message: "Não foi possível conectar à instância. Verifique a URL informada.",
      };
    }

    const data = await response.json().catch(() => null);
    const serverMessage =
      data && typeof data === "object" ? (data as { error?: string }).error : undefined;

    if (response.status === 401 || response.status === 403) {
      return { ok: false, status: "INVALID_TOKEN", message: serverMessage ?? "Token inválido." };
    }
    if (!response.ok) {
      return {
        ok: false,
        status: "UNAVAILABLE",
        message: serverMessage ?? `Instância indisponível (HTTP ${response.status}).`,
        raw: data,
      };
    }

    if (!data || typeof data !== "object") {
      return { ok: false, status: "ERROR", message: "Resposta inesperada da instância.", raw: data };
    }

    if ((data as { connected?: boolean }).connected === true) {
      return { ok: true, status: "CONNECTED", message: "Conectado com sucesso.", raw: data };
    }

    // Z-API returns 200 + connected:false for exactly one situation: the
    // instance/credentials are valid but the WhatsApp session hasn't been
    // paired to a phone yet (confirmed against the docs' "disconnected" /
    // "needs session restore" examples — both are this same case from our
    // side, the fix is always "scan the QR code").
    return {
      ok: false,
      status: "AWAITING_QR_SCAN",
      message:
        (data as { error?: string }).error ?? "O WhatsApp ainda não está pareado com esta instância.",
      raw: data,
    };
  }

  /** `{ value: "data:image/png;base64,..." }` — confirmed directly against
   * a real Z-API trial instance (GET .../qr-code/image); the sibling
   * `.../qr-code` endpoint returns a wa.me linked-device deep link instead
   * of an image, not what we want here. */
  async getQrCode(config: WhatsappConnectionConfig): Promise<QrCodeResult> {
    const url = `${trimTrailingSlash(config.apiUrl)}/qr-code/image`;

    let response: Response;
    try {
      response = await fetchWithTimeout(url, {
        method: "GET",
        headers: buildHeaders(config.apiToken),
      });
    } catch {
      return { ok: false, message: "Não foi possível buscar o QR Code da instância." };
    }

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        ok: false,
        message:
          (data as { error?: string } | null)?.error ?? `Erro ao buscar QR Code (HTTP ${response.status}).`,
        raw: data,
      };
    }

    const image = (data as { value?: string } | null)?.value;
    if (!image || !image.startsWith("data:image")) {
      return { ok: false, message: "A instância não retornou um QR Code válido.", raw: data };
    }

    return { ok: true, image, message: "QR Code disponível.", raw: data };
  }

  /** `GET .../contacts/{phone}` — confirmed directly against a real Z-API
   * trial instance. When the number has no name saved in the instance's
   * WhatsApp contacts, Z-API falls back to returning the formatted phone
   * number itself as `name`/`vname` (e.g. "+55 46 8821-2387") — we detect
   * and discard that case so a "name" is only ever used when it's an
   * actual human-set name. Tries `name` > `short` > `notify` before giving
   * up (same reasoning as listContacts's fallback chain).
   *
   * Deliberately NOT a digit-for-digit comparison against the queried
   * phone: Z-API's fallback formatting can drop/shift digits (confirmed
   * against a real instance — a Brazilian mobile number's 9th digit came
   * back missing from the formatted fallback), so an exact-match check is
   * unreliable. Instead we treat anything that's *shaped* like a phone
   * number (only digits, spaces, +, -, parentheses — no letters) as the
   * fallback, regardless of exact digits. A real name always has letters. */
  async getContactName(
    config: WhatsappConnectionConfig,
    phone: string
  ): Promise<ContactNameResult> {
    const url = `${trimTrailingSlash(config.apiUrl)}/contacts/${phone}`;

    let response: Response;
    try {
      response = await fetchWithTimeout(url, {
        method: "GET",
        headers: buildHeaders(config.apiToken),
      });
    } catch {
      return { ok: false };
    }

    const data = await response.json().catch(() => null);
    if (!response.ok || !data || typeof data !== "object") return { ok: false };

    // Same "name" > "short" > "notify" fallback chain as listContacts —
    // `name` alone is only filled when the instance saved this number in
    // its own device contacts, which is rare for a business number.
    // Agenda (name/short) > perfil (vname/notify) — ver contact-name.ts.
    const picked = pickZapiContactName(data as Record<string, unknown>);
    if (!picked) return { ok: false };

    return { ok: true, name: picked.name, nameSource: picked.source === "agenda" ? "agenda" : "perfil" };
  }

  /** `GET .../contacts` — Z-API's documented bulk endpoint for every
   * WhatsApp contact/chat the connected instance has, paginated via
   * `?page=&pageSize=`. Confirmed against a real Z-API instance (2972
   * contacts, 2026-09-11): `name`/`short` only come back filled when the
   * number was saved in the *instance's own device contacts* — for a
   * business number, that's true for almost nobody, so relying on `name`
   * alone left virtually every contact nameless. `notify` (the display
   * name the contact set for themselves in WhatsApp) and `vname` (vCard
   * name) are populated far more often and don't require the instance to
   * have saved the number — see Z-API's own field docs
   * (developer.z-api.io/en/contacts/get-contacts). Preference order:
   * name > short > vname > notify (most to least likely to be a
   * deliberately-chosen full name; `notify` can be a nickname/emoji, but
   * it's still better than nothing). */
  async listContacts(config: WhatsappConnectionConfig): Promise<ListContactsResult> {
    const contacts: ProviderContact[] = [];
    const pageSize = 100;
    let skipped = 0;

    for (let page = 1; ; page++) {
      const url = `${trimTrailingSlash(config.apiUrl)}/contacts?page=${page}&pageSize=${pageSize}`;

      let response: Response;
      try {
        response = await fetchWithTimeout(url, {
          method: "GET",
          headers: buildHeaders(config.apiToken),
        });
      } catch {
        return {
          ok: contacts.length > 0,
          contacts,
          message: "Falha de comunicação ao buscar contatos da instância.",
        };
      }

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        return {
          ok: contacts.length > 0,
          contacts,
          message:
            (data as { error?: string } | null)?.error ?? `Erro ao buscar contatos (HTTP ${response.status}).`,
          raw: data,
        };
      }

      const rows = Array.isArray(data) ? data : [];
      for (const row of rows) {
        if (!isRecord(row)) continue;
        // Descarta "@lid"/grupos/lixo — ver sanitizeWhatsappPhone.
        const phone = sanitizeWhatsappPhone(row.phone, row.lid);
        if (!phone) {
          if (row.phone) skipped++;
          continue;
        }
        // Agenda (name/short) > perfil (vname/notify) — ver contact-name.ts.
        contacts.push({ phone, ...pickedFields(row) });
      }

      if (rows.length < pageSize) break; // last page
    }

    // `/contacts` only covers numbers Z-API considers an actual "contact"
    // (saved name, vCard, etc) — a chat that's just started (or marked
    // spam) with no name attached never shows up there even though it's a
    // real, visible conversation on the phone. `/chats` (same pagination
    // convention) is every open conversation instead, group or not — so
    // merge in whatever `/chats` has that `/contacts` didn't, nameless
    // (this endpoint doesn't return one), skipping groups (`isGroup`;
    // those are handled by listGroups/getGroupParticipants, not here).
    // Best-effort: a failure here never drops the `/contacts` result
    // already in hand.
    const knownPhones = new Set(contacts.map((c) => c.phone));
    try {
      for (let page = 1; ; page++) {
        const url = `${trimTrailingSlash(config.apiUrl)}/chats?page=${page}&pageSize=${pageSize}`;
        const response = await fetchWithTimeout(url, { method: "GET", headers: buildHeaders(config.apiToken) });
        if (!response.ok) break;

        const data = await response.json().catch(() => null);
        const rows = Array.isArray(data) ? data : [];
        for (const row of rows) {
          if (!isRecord(row)) continue;
          if (row.isGroup === true) continue;
          const phone = sanitizeWhatsappPhone(row.phone, row.lid);
          if (!phone) {
            if (row.phone) skipped++;
            continue;
          }
          if (knownPhones.has(phone)) continue;
          knownPhones.add(phone);
          // /chats às vezes traz `name` (nome do chat no aparelho: agenda
          // quando salvo, senão o perfil — não dá pra saber qual); quando
          // vem, usa — antes esses contatos entravam sempre sem nome.
          contacts.push({ phone, ...pickedFields(row, "whatsapp") });
        }

        if (rows.length < pageSize) break; // last page
      }
    } catch {
      // Falha ao buscar /chats não invalida o que já temos de /contacts.
    }

    return { ok: true, contacts, skipped, message: `${contacts.length} contato(s) encontrado(s).` };
  }

  /** `GET .../groups` — Z-API's documented bulk endpoint for every group
   * the instance participates in, same pagination convention as
   * `/contacts` (`?page=&pageSize=`). **Confirmed against Z-API's docs
   * (developer.z-api.io/en/group/get-groups), not yet against a live
   * instance** — same caveat as sendVideo below. `phone` here is the
   * group's own JID (e.g. "120263...-group"), not a person's number. */
  async listGroups(config: WhatsappConnectionConfig): Promise<ListGroupsResult> {
    const groups: ProviderGroup[] = [];
    const pageSize = 100;

    for (let page = 1; ; page++) {
      const url = `${trimTrailingSlash(config.apiUrl)}/groups?page=${page}&pageSize=${pageSize}`;

      let response: Response;
      try {
        response = await fetchWithTimeout(url, {
          method: "GET",
          headers: buildHeaders(config.apiToken),
        });
      } catch {
        return {
          ok: groups.length > 0,
          groups,
          message: "Falha de comunicação ao buscar grupos da instância.",
        };
      }

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        return {
          ok: groups.length > 0,
          groups,
          message:
            (data as { error?: string } | null)?.error ?? `Erro ao buscar grupos (HTTP ${response.status}).`,
          raw: data,
        };
      }

      const rows = Array.isArray(data) ? data : [];
      for (const row of rows) {
        if (!isRecord(row)) continue;
        const id = typeof row.phone === "string" ? row.phone.trim() : "";
        if (!id) continue;
        const name = typeof row.name === "string" ? row.name.trim() : "";
        groups.push({ id, name: name || id });
      }

      if (rows.length < pageSize) break; // last page
    }

    return { ok: true, groups, message: `${groups.length} grupo(s) encontrado(s).` };
  }

  /** `GET .../groups/{groupId}` — returns the group's metadata plus its
   * `participants` array (`phone`, optional `name`/`short`). **Confirmed
   * against Z-API's docs (developer.z-api.io/en/group/metadata-group), not
   * yet against a live instance.** Same "name" > "short" preference and
   * "is this actually a name?" filtering as listContacts/getContactName —
   * a participant not saved anywhere just comes back with a phone. */
  async getGroupParticipants(
    config: WhatsappConnectionConfig,
    groupId: string
  ): Promise<GroupParticipantsResult> {
    const url = `${trimTrailingSlash(config.apiUrl)}/groups/${groupId}`;

    let response: Response;
    try {
      response = await fetchWithTimeout(url, {
        method: "GET",
        headers: buildHeaders(config.apiToken),
      });
    } catch {
      return { ok: false, participants: [], message: "Não foi possível buscar os participantes do grupo." };
    }

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        ok: false,
        participants: [],
        message:
          (data as { error?: string } | null)?.error ?? `Erro ao buscar o grupo (HTTP ${response.status}).`,
        raw: data,
      };
    }

    const rows = isRecord(data) && Array.isArray((data as { participants?: unknown }).participants)
      ? ((data as { participants: unknown[] }).participants)
      : [];

    // O WhatsApp tem escondido o número real de participantes de grupo
    // (vem só um id "@lid") — esses não viram contato: não dá pra mandar
    // mensagem pra um id opaco como se fosse telefone.
    let skipped = 0;
    const participants = rows.flatMap((row) => {
      if (!isRecord(row)) return [];
      const phone = sanitizeWhatsappPhone(row.phone, row.lid);
      if (!phone) {
        skipped++;
        return [];
      }
      return [{ phone, ...pickedFields(row) }];
    });

    const skippedNote = skipped > 0 ? ` (${skipped} sem número visível — id @lid — ignorado(s))` : "";
    return {
      ok: true,
      participants,
      skipped,
      message: `${participants.length} participante(s) encontrado(s)${skippedNote}.`,
      raw: data,
    };
  }

  /** `GET .../device` — the actual phone paired to the session right now
   * (confirmed against a real instance: `{ phone, lid, name, ... }`),
   * independent of whatever `phoneNumber` label happens to be stored on
   * the connection. Used to keep that label auto-synced instead of relying
   * on a manual edit every time the paired device changes. */
  async getConnectedPhone(config: WhatsappConnectionConfig): Promise<GetConnectedPhoneResult> {
    const url = `${trimTrailingSlash(config.apiUrl)}/device`;

    let response: Response;
    try {
      response = await fetchWithTimeout(url, { method: "GET", headers: buildHeaders(config.apiToken) });
    } catch {
      return { ok: false, message: "Não foi possível consultar o dispositivo pareado." };
    }

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        ok: false,
        message:
          (data as { error?: string } | null)?.error ?? `Erro ao consultar dispositivo (HTTP ${response.status}).`,
        raw: data,
      };
    }

    const phone = typeof (data as { phone?: string } | null)?.phone === "string"
      ? (data as { phone: string }).phone.trim()
      : "";
    if (!phone) {
      return { ok: false, message: "A instância não retornou um número pareado.", raw: data };
    }
    return { ok: true, phone, message: "Dispositivo consultado com sucesso.", raw: data };
  }

  async sendMessage(
    config: WhatsappConnectionConfig,
    to: string,
    text: string,
    options?: SendMessageOptions
  ): Promise<SendMessageResult> {
    return this.postJson(config, "send-text", { phone: to, message: text, ...delayFields(options) });
  }

  async sendImage(
    config: WhatsappConnectionConfig,
    to: string,
    image: string,
    caption?: string
  ): Promise<SendMessageResult> {
    return this.postJson(config, "send-image", {
      phone: to,
      image,
      ...(caption ? { caption } : {}),
    });
  }

  /** `send-link` — texto com o link no FIM + prévia (título, descrição,
   * miniatura). linkType LARGE = prévia grande, como a do WhatsApp quando
   * alguém cola um link da Play Store. developer.z-api.io/en/message/send-message-link */
  async sendLink(
    config: WhatsappConnectionConfig,
    to: string,
    link: { message: string; linkUrl: string; title: string; description: string; image: string }
  ): Promise<SendMessageResult> {
    return this.postJson(config, "send-link", {
      phone: to,
      message: link.message,
      image: link.image,
      linkUrl: link.linkUrl,
      title: link.title,
      linkDescription: link.description,
      linkType: "LARGE",
    });
  }

  /** `send-video` — sibling endpoint of `send-image`, same envelope.
   * **Not yet confirmed against a real Z-API instance** (send-image was;
   * see the class doc comment) — used only by the Campanhas module. */
  async sendVideo(
    config: WhatsappConnectionConfig,
    to: string,
    video: string,
    caption?: string
  ): Promise<SendMessageResult> {
    return this.postJson(config, "send-video", {
      phone: to,
      video,
      ...(caption ? { caption } : {}),
    });
  }

  /** `send-document/{extensão}` — `{ phone, document, fileName, caption }`
   * (developer.z-api.io/en/message/send-message-document). **Não
   * confirmado contra uma instância real ainda** — usado só por Campanhas. */
  async sendDocument(
    config: WhatsappConnectionConfig,
    to: string,
    document: string,
    fileName: string,
    caption?: string
  ): Promise<SendMessageResult> {
    const extension = (fileName.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "") || "pdf";
    return this.postJson(config, `send-document/${extension}`, {
      phone: to,
      document,
      fileName,
      ...(caption ? { caption } : {}),
    });
  }

  /** `GET .../phone-exists/{phone}` → `{ exists, phone, lid }`
   * (developer.z-api.io/en/contacts/get-iswhatsapp). **Não confirmado
   * contra uma instância real ainda.** Nunca lança: falha de rede/HTTP volta
   * como `ok: false` e o dispatcher segue com o envio sem a checagem. */
  async checkPhoneExists(config: WhatsappConnectionConfig, phone: string): Promise<PhoneExistsResult> {
    const url = `${trimTrailingSlash(config.apiUrl)}/phone-exists/${encodeURIComponent(phone)}`;
    let response: Response;
    try {
      response = await fetchWithTimeout(url, { method: "GET", headers: buildHeaders(config.apiToken) });
    } catch {
      return { ok: false, message: "Falha de comunicação ao verificar o número." };
    }
    const data = await response.json().catch(() => null);
    if (!response.ok || !isRecord(data) || typeof data.exists !== "boolean") {
      return { ok: false, message: `Não foi possível verificar o número (HTTP ${response.status}).`, raw: data };
    }
    const returnedPhone = sanitizeWhatsappPhone(data.phone);
    return {
      ok: true,
      exists: data.exists,
      ...(returnedPhone ? { phone: returnedPhone } : {}),
      message: data.exists ? "Número tem WhatsApp." : "Número não tem WhatsApp.",
      raw: data,
    };
  }

  /** `send-audio` — sibling endpoint of `send-image`/`send-video`, same
   * envelope. **Not yet confirmed against a real Z-API instance** (same
   * caveat as `sendVideo`) — used by the AI attendant's voice-reply
   * feature; validated live the first time a voice-in/voice-out round
   * trip is tested. */
  async sendAudio(
    config: WhatsappConnectionConfig,
    to: string,
    audio: string,
    options?: SendMessageOptions
  ): Promise<SendMessageResult> {
    return this.postJson(config, "send-audio", { phone: to, audio, ...delayFields(options) });
  }

  /** `send-button-actions` — text + up to 3 action buttons (here only type
   * URL). Body per developer.z-api.io/message/send-button-actions:
   * `{ phone, message, buttonActions: [{ id, type: "URL", url, label }] }`.
   * Buttons don't render on every WhatsApp client (Z-API "button status"
   * tip), so callers keep the links in `message` too. */
  async sendLinkButtons(
    config: WhatsappConnectionConfig,
    to: string,
    text: string,
    buttons: LinkButtonAction[],
    options?: { image?: string }
  ): Promise<SendLinkButtonsResult> {
    const { result, failure } = await this.postJsonDetailed(
      config,
      "send-button-actions",
      buildLinkButtonsBody(to, text, buttons, options?.image)
    );
    // Only an HTTP error (Z-API answered and refused) is safe to resend as
    // text. A timeout or a dropped connection may mean Z-API already got
    // it, so we never resend then (no duplicate message for the passenger).
    return { ...result, fallbackSafe: failure === "http" };
  }

  /** `DELETE .../messages?messageId=&phone=&owner=true` — "apagar para
   * todos" (developer.z-api.io/message/delete-message). WhatsApp only
   * accepts it for about 2 days after the send. **Docs only, not yet
   * confirmed against a live instance.** */
  async deleteMessage(
    config: WhatsappConnectionConfig,
    phone: string,
    messageId: string
  ): Promise<SendMessageResult> {
    const query = new URLSearchParams({ messageId, phone, owner: "true" });
    const url = `${trimTrailingSlash(config.apiUrl)}/messages?${query.toString()}`;
    let response: Response;
    try {
      response = await fetchWithTimeout(url, { method: "DELETE", headers: buildHeaders(config.apiToken) });
    } catch {
      return { ok: false, message: "Falha de comunicação com a instância." };
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        ok: false,
        message: (data as { error?: string } | null)?.error ?? `Erro ao apagar (HTTP ${response.status}).`,
        raw: data,
      };
    }
    return { ok: true, message: "Mensagem apagada.", raw: data };
  }

  /** `PUT .../update-webhook-chat-presence` — `{ value: "<url>" }`
   * registers the instance's chat-presence webhook; `{ value: "" }` clears
   * it (used to disable). Confirmed directly against a real Z-API trial
   * instance (both calls returned `{ value: true }`) — the
   * `PresenceChatCallback` event itself is still only confirmed against
   * Z-API's documented examples, not a live delivery (see
   * PRESENCE_EVENT_TYPE in whatsapp-connection.service.ts). Z-API itself
   * recommends against leaving this on for every connection (throttling/
   * cost) — enforced by setPresenceTrackingEnabled being opt-in, not here. */
  async updateChatPresenceWebhook(
    config: WhatsappConnectionConfig,
    webhookUrl: string
  ): Promise<UpdateWebhookResult> {
    const url = `${trimTrailingSlash(config.apiUrl)}/update-webhook-chat-presence`;
    let response: Response;
    try {
      response = await fetchWithTimeout(url, {
        method: "PUT",
        headers: buildHeaders(config.apiToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ value: webhookUrl }),
      });
    } catch {
      return { ok: false, message: "Falha de comunicação ao configurar o webhook de presença." };
    }

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        ok: false,
        message:
          (data as { error?: string } | null)?.error ??
          `Erro ao configurar webhook de presença (HTTP ${response.status}).`,
        raw: data,
      };
    }
    return { ok: true, message: "Webhook de presença configurado.", raw: data };
  }

  /** Shared POST-JSON-parse-response plumbing behind send-text/send-image —
   * same endpoint family, same response envelope ({ zaapId, messageId, id }
   * on success), only the path and body differ. */
  private async postJson(
    config: WhatsappConnectionConfig,
    endpoint: string,
    body: Record<string, unknown>
  ): Promise<SendMessageResult> {
    return (await this.postJsonDetailed(config, endpoint, body)).result;
  }

  private async postJsonDetailed(
    config: WhatsappConnectionConfig,
    endpoint: string,
    body: Record<string, unknown>
  ): Promise<{ result: SendMessageResult; failure: "timeout" | "network" | "http" | null }> {
    const url = `${trimTrailingSlash(config.apiUrl)}/${endpoint}`;

    let response: Response;
    try {
      response = await fetchWithTimeout(url, {
        method: "POST",
        headers: buildHeaders(config.apiToken, { "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "AbortError";
      return {
        result: { ok: false, message: "Falha de comunicação com a instância.", networkError: true },
        failure: timedOut ? "timeout" : "network",
      };
    }

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        result: {
          ok: false,
          message:
            (data as { error?: string } | null)?.error ?? `Erro ao enviar (HTTP ${response.status}).`,
          raw: data,
          httpStatus: response.status,
        },
        failure: "http",
      };
    }

    const messageId = extractProviderMessageId(data);
    return {
      result: {
        ok: true,
        message: "Mensagem enviada com sucesso.",
        raw: data,
        httpStatus: response.status,
        ...(messageId ? { messageId } : {}),
      },
      failure: null,
    };
  }
}
