import type { WhatsappProvider } from "../provider";
import type {
  ContactNameResult,
  ListContactsResult,
  ProviderContact,
  QrCodeResult,
  SendMessageResult,
  TestConnectionResult,
  WhatsappConnectionConfig,
} from "../types";

const REQUEST_TIMEOUT_MS = 15_000;

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Z-API's "no name saved" fallback is the formatted phone number itself
 * (e.g. "+55 46 8821-2387") — shared by getContactName and listContacts so
 * both apply the exact same "is this actually a name?" rule. A real name
 * always has letters; anything shaped like only digits/spaces/+/-/() is
 * the fallback, not a name. */
function isRealName(value: string): boolean {
  const looksLikePhoneNumber = /^[+\d][\d\s\-()]*$/.test(value);
  return !looksLikePhoneNumber;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** First trimmed, non-empty string among the candidates — used to pick a
 * contact's display name from Z-API's several name-ish fields, in order of
 * preference (see listContacts). */
function firstNonEmpty(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "";
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
    const row = data as { name?: unknown; short?: unknown; notify?: unknown };
    const name = firstNonEmpty(row.name, row.short, row.notify);
    if (!name || !isRealName(name)) return { ok: false };

    return { ok: true, name };
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
        const phone = typeof row.phone === "string" ? row.phone.trim() : "";
        if (!phone) continue;
        const rawName = firstNonEmpty(row.name, row.short, row.vname, row.notify);
        contacts.push({ phone, ...(rawName && isRealName(rawName) ? { name: rawName } : {}) });
      }

      if (rows.length < pageSize) break; // last page
    }

    return { ok: true, contacts, message: `${contacts.length} contato(s) encontrado(s).` };
  }

  async sendMessage(
    config: WhatsappConnectionConfig,
    to: string,
    text: string
  ): Promise<SendMessageResult> {
    return this.postJson(config, "send-text", { phone: to, message: text });
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

  /** Shared POST-JSON-parse-response plumbing behind send-text/send-image —
   * same endpoint family, same response envelope ({ zaapId, messageId, id }
   * on success), only the path and body differ. */
  private async postJson(
    config: WhatsappConnectionConfig,
    endpoint: string,
    body: Record<string, unknown>
  ): Promise<SendMessageResult> {
    const url = `${trimTrailingSlash(config.apiUrl)}/${endpoint}`;

    let response: Response;
    try {
      response = await fetchWithTimeout(url, {
        method: "POST",
        headers: buildHeaders(config.apiToken, { "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
    } catch {
      return { ok: false, message: "Falha de comunicação com a instância." };
    }

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        ok: false,
        message:
          (data as { error?: string } | null)?.error ?? `Erro ao enviar (HTTP ${response.status}).`,
        raw: data,
      };
    }

    return { ok: true, message: "Mensagem enviada com sucesso.", raw: data };
  }
}
