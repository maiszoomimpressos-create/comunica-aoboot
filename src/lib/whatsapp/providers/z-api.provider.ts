import type { WhatsappProvider } from "../provider";
import type {
  QrCodeResult,
  SendMessageResult,
  TestConnectionResult,
  WhatsappConnectionConfig,
} from "../types";

const REQUEST_TIMEOUT_MS = 15_000;

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
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
