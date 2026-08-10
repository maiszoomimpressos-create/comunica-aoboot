import QRCode from "qrcode";
import { prisma } from "@/lib/db/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto/secret-box";
import { generateApiKey, hashApiKey } from "@/lib/whatsapp/api-key";
import { generateWebhookSecret } from "@/lib/whatsapp/webhook-secret";
import { getWhatsappProvider } from "@/lib/whatsapp/registry";
import { WHATSAPP_PRODUCTS } from "@/config/whatsapp-products";
import { getNotificationType, type NotificationDetails } from "@/config/whatsapp-notification-types";
import type {
  QrCodeResult,
  SendMessageResult,
  TestConnectionResult,
  WhatsappConnectionConfig,
} from "@/lib/whatsapp/types";
import {
  ensureChannel,
  createPendingConnection,
  createWebhookEvent,
  getConnectionSummary,
  getConnectionWithSecret,
  getConnectionByApiKeyHash,
  setConnectionApiKey,
  setWebhookSecret,
  revokeConnectionApiKey,
  touchApiKeyLastUsed,
  updateConnectionMeta,
  updateConnectionStatus,
  type ChannelConnectionSummary,
} from "@/repositories/channel-connection.repository";
import { getProviderByKey } from "@/repositories/channel-provider.repository";
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@/lib/server/errors";

const WHATSAPP_MODULE_KEY = "whatsapp";
const DEFAULT_PROVIDER_KEY = "z-api"; // only active provider today — see ChannelProvider seed

/** Tests provider credentials without touching the database — used by the
 * admin's "Testar e salvar" action (see provisionConnection). */
export async function testConnection(
  providerKey: string,
  config: WhatsappConnectionConfig
): Promise<TestConnectionResult> {
  const provider = getWhatsappProvider(providerKey);
  return provider.testConnection(config);
}

export interface RequestConnectionInput {
  productKeys: string[];
  phoneNumber: string;
}

/**
 * Tenant-facing: records a connection *request* (product(s) + phone
 * number) with no credentials — a platform admin fills those in later via
 * `provisionConnection`. Does NOT mark the module as installed; that only
 * happens once the connection is actually provisioned and working.
 */
export async function requestConnection(
  tenantId: string,
  input: RequestConnectionInput
): Promise<ChannelConnectionSummary> {
  const selectedProducts = WHATSAPP_PRODUCTS.filter(
    (p) => input.productKeys.includes(p.key) && p.available
  );
  if (selectedProducts.length === 0) {
    throw new ValidationError("Selecione ao menos um produto disponível.");
  }
  if (!input.phoneNumber.trim()) {
    throw new ValidationError("Informe o número do WhatsApp.");
  }

  const provider = await getProviderByKey(DEFAULT_PROVIDER_KEY);
  if (!provider) throw new NotFoundError("Provedor padrão não configurado.");

  const channel = await ensureChannel(tenantId, "WHATSAPP");

  const connection = await createPendingConnection({
    tenantId,
    channelId: channel.id,
    providerId: provider.id,
    connectionName: selectedProducts.map((p) => p.name).join(", "),
    phoneNumber: input.phoneNumber,
  });

  const summary = await getConnectionSummary(tenantId, connection.id);
  if (!summary) throw new NotFoundError("Solicitação criada, mas não encontrada ao recarregar.");
  return summary;
}

export interface UpdateConnectionMetaInput {
  connectionName: string;
  phoneNumber: string;
}

/** Tenant-facing: renames the connection and/or corrects the phone number
 * shown for it. Deliberately does NOT touch apiUrl/apiTokenCipher — those
 * are provisioned only by a platform admin (see provisionConnection); if
 * the credentials themselves are wrong, the fix is a new connection
 * request, not an edit. */
export async function updateConnectionMetadata(
  tenantId: string,
  connectionId: string,
  input: UpdateConnectionMetaInput
): Promise<ChannelConnectionSummary> {
  if (!input.connectionName.trim()) throw new ValidationError("Informe o nome da conexão.");
  if (!input.phoneNumber.trim()) throw new ValidationError("Informe o número do WhatsApp.");

  const result = await updateConnectionMeta(tenantId, connectionId, {
    connectionName: input.connectionName.trim(),
    phoneNumber: input.phoneNumber.trim(),
  });
  if (result.count === 0) throw new NotFoundError("Conexão não encontrada.");

  const summary = await getConnectionSummary(tenantId, connectionId);
  if (!summary) throw new NotFoundError("Conexão atualizada, mas não encontrada ao recarregar.");
  return summary;
}

export interface ProvisionConnectionInput {
  apiUrl: string;
  apiToken: string;
}

/** Statuses that mean "credentials are actually good" — either fully
 * paired already, or just waiting on the tenant to scan the QR code (which
 * still proves the instance/Client-Token are valid). Anything else
 * (INVALID_TOKEN, UNAVAILABLE, ERROR, AUTH_ERROR) means the credentials
 * themselves are wrong and nothing should be persisted. */
function isProvisionable(
  status: TestConnectionResult["status"]
): status is "CONNECTED" | "AWAITING_QR_SCAN" {
  return status === "CONNECTED" || status === "AWAITING_QR_SCAN";
}

/**
 * Admin-facing: fills in the real Z-API credentials for an existing
 * PENDING connection request. Re-validates server-side before persisting
 * (never trusts anything blindly) and marks the WhatsApp module INSTALLED
 * for that tenant as soon as the credentials check out — even if the
 * WhatsApp session itself still needs the tenant to scan a QR code (see
 * AWAITING_QR_SCAN / getConnectionQrCode), since that step can only be
 * done by whoever has the phone, never by the admin provisioning this.
 * Throws (without writing anything) if the credentials themselves are bad
 * — the connection stays PENDING so the admin can fix and retry.
 */
export async function provisionConnection(
  tenantId: string,
  connectionId: string,
  input: ProvisionConnectionInput
): Promise<ChannelConnectionSummary> {
  const connection = await getConnectionWithSecret(tenantId, connectionId);
  if (!connection) throw new NotFoundError("Conexão não encontrada.");

  const provider = getWhatsappProvider(connection.provider.key);
  const testResult = await provider.testConnection({
    apiUrl: input.apiUrl,
    apiToken: input.apiToken,
    phoneNumber: connection.phoneNumber,
  });

  if (!isProvisionable(testResult.status)) {
    throw new ValidationError(testResult.message, { status: testResult.status });
  }

  const apiTokenCipher = encryptSecret(input.apiToken);

  await prisma.$transaction(async (tx) => {
    await tx.channelConnection.updateMany({
      where: { id: connectionId, tenantId },
      data: {
        apiUrl: input.apiUrl,
        apiTokenCipher,
        status: testResult.status,
        lastValidation: new Date(),
        lastError: testResult.ok ? null : testResult.message,
      },
    });

    const whatsappModule = await tx.module.findUnique({ where: { key: WHATSAPP_MODULE_KEY } });
    if (whatsappModule) {
      await tx.tenantModule.upsert({
        where: { tenantId_moduleId: { tenantId, moduleId: whatsappModule.id } },
        create: {
          tenantId,
          moduleId: whatsappModule.id,
          status: "INSTALLED",
          installedAt: new Date(),
        },
        update: { status: "INSTALLED", installedAt: new Date() },
      });
    }
  });

  const summary = await getConnectionSummary(tenantId, connectionId);
  if (!summary) throw new NotFoundError("Conexão provisionada, mas não encontrada ao recarregar.");
  return summary;
}

/** Fetches the QR code the tenant scans (with the phone that owns the
 * number) to finish pairing — only meaningful once credentials are set. */
export async function getConnectionQrCode(
  tenantId: string,
  connectionId: string
): Promise<QrCodeResult> {
  const connection = await getConnectionWithSecret(tenantId, connectionId);
  if (!connection) throw new NotFoundError("Conexão não encontrada.");
  if (!connection.apiUrl || !connection.apiTokenCipher) {
    throw new ConflictError("Esta conexão ainda não foi configurada.");
  }

  const apiToken = decryptSecret(connection.apiTokenCipher);
  const provider = getWhatsappProvider(connection.provider.key);
  return provider.getQrCode({
    apiUrl: connection.apiUrl,
    apiToken,
    phoneNumber: connection.phoneNumber,
  });
}

export async function sendTestMessage(
  tenantId: string,
  connectionId: string,
  to: string,
  text: string
): Promise<SendMessageResult> {
  const connection = await getConnectionWithSecret(tenantId, connectionId);
  if (!connection) throw new NotFoundError("Conexão não encontrada.");
  if (!connection.apiUrl || !connection.apiTokenCipher) {
    throw new ConflictError("Esta conexão ainda não foi configurada.");
  }

  const apiToken = decryptSecret(connection.apiTokenCipher);
  const provider = getWhatsappProvider(connection.provider.key);
  return provider.sendMessage(
    { apiUrl: connection.apiUrl, apiToken, phoneNumber: connection.phoneNumber },
    to,
    text
  );
}

/** Re-runs the test against a saved connection's stored credentials and
 * updates its status/lastValidation/lastError to match the fresh result. */
export async function retestConnection(
  tenantId: string,
  connectionId: string
): Promise<TestConnectionResult> {
  const connection = await getConnectionWithSecret(tenantId, connectionId);
  if (!connection) throw new NotFoundError("Conexão não encontrada.");
  if (!connection.apiUrl || !connection.apiTokenCipher) {
    throw new ConflictError("Esta conexão ainda não foi configurada.");
  }

  const apiToken = decryptSecret(connection.apiTokenCipher);
  const provider = getWhatsappProvider(connection.provider.key);
  const result = await provider.testConnection({
    apiUrl: connection.apiUrl,
    apiToken,
    phoneNumber: connection.phoneNumber,
  });

  await updateConnectionStatus(tenantId, connectionId, {
    status: result.status,
    lastValidation: new Date(),
    lastError: result.ok ? null : result.message,
  });

  return result;
}

// --- API key (machine-to-machine auth) -----------------------------------

/** Generates a fresh API key for a connection, replacing any previous one.
 * Returns the plaintext key — the ONLY time it is ever available; only its
 * hash is persisted (see lib/whatsapp/api-key.ts). */
export async function rotateApiKey(tenantId: string, connectionId: string): Promise<string> {
  const connection = await getConnectionSummary(tenantId, connectionId);
  if (!connection) throw new NotFoundError("Conexão não encontrada.");

  const { plaintext, hash, prefix } = generateApiKey();
  await setConnectionApiKey(tenantId, connectionId, { apiKeyHash: hash, apiKeyPrefix: prefix });
  return plaintext;
}

export async function revokeApiKey(tenantId: string, connectionId: string): Promise<void> {
  const connection = await getConnectionSummary(tenantId, connectionId);
  if (!connection) throw new NotFoundError("Conexão não encontrada.");
  await revokeConnectionApiKey(tenantId, connectionId);
}

// --- Webhooks (inbound, from the provider) ----------------------------------

/** Generates the connection's webhook secret the first time it's needed
 * (idempotent — returns the existing one on later calls instead of
 * rotating it, since rotating would require re-registering the URL with
 * the provider every time). Returns the full URL to register in the
 * provider's dashboard/API, secret embedded as a query param. */
export async function ensureWebhookUrl(tenantId: string, connectionId: string): Promise<string> {
  const connection = await getConnectionWithSecret(tenantId, connectionId);
  if (!connection) throw new NotFoundError("Conexão não encontrada.");

  let secret = connection.webhookSecret;
  if (!secret) {
    secret = generateWebhookSecret();
    await setWebhookSecret(tenantId, connectionId, secret);
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!baseUrl) throw new ConflictError("NEXT_PUBLIC_APP_URL não configurada.");
  return `${baseUrl}/api/webhooks/zapi/${connectionId}?secret=${secret}`;
}

/** Called by the public webhook route after verifying the secret — just
 * persists the raw payload for now (see WebhookEvent's schema comment:
 * interpreting these is future work, this only builds the log they'll be
 * read from). Never throws on a malformed/unexpected payload shape — a
 * webhook endpoint must always ack fast, so any parsing lives downstream
 * of this, not here. */
export async function recordWebhookEvent(connectionId: string, payload: unknown): Promise<void> {
  await createWebhookEvent(connectionId, "z-api", payload);
}

export interface PurchaseConfirmationInput {
  to: string;
  /** Notification type key from the catalog (whatsapp-notification-types.ts)
   * — e.g. "ingresso_emitido", "agendamento_confirmado". Falls back to the
   * generic "compra_confirmada" when omitted. */
  type?: string;
  /** The name registered for this person in the caller's own system —
   * never the WhatsApp profile name (see buildMessage's whatsappName). */
  recipientName: string;
  /** Type-specific data (e.g. { data, horario } for agendamento_confirmado)
   * — see each type's `requiredDetailKeys` in the catalog. */
  details?: NotificationDetails;
  /** Required when the resolved type's `requiresQr` is true (tickets,
   * vouchers — anything meant to be scanned); optional otherwise, in which
   * case the message is sent as plain text instead of a captioned image. */
  qrData?: string;
  /** Optional free-text line the caller can add on top of the templated
   * message (e.g. "Apresente esse ingresso na portaria do evento, não
   * perca") — appended as its own paragraph, after everything the catalog
   * template builds. Unlike every other field, this one *is* raw text
   * from the caller — deliberately opt-in and additive, never a
   * replacement for the structured template. */
  note?: string;
}

/**
 * Entry point for external systems (e.g. an e-commerce site, a ticketing
 * platform, a booking system) triggering a WhatsApp notification via API
 * key — no tenant session involved, the key alone resolves the connection.
 * The message text is always built by us from the notification-type
 * catalog (see whatsapp-notification-types.ts) — the caller never supplies
 * free text, only structured data (`type`, `recipientName`, `details`).
 * When `qrData` is present it's rendered by us into a QR image (never
 * accepted pre-rendered from the caller — simpler contract, no dependency
 * on an external URL, no SSRF surface) and sent as a captioned image;
 * otherwise the message goes out as plain text.
 */
export async function sendPurchaseConfirmation(
  apiKeyPlaintext: string,
  input: PurchaseConfirmationInput
): Promise<SendMessageResult> {
  const connection = await getConnectionByApiKeyHash(hashApiKey(apiKeyPlaintext));
  if (!connection) throw new UnauthorizedError("Chave de API inválida.");
  if (connection.status !== "CONNECTED") {
    throw new ConflictError("Esta conexão não está ativa no momento.");
  }
  if (!connection.apiUrl || !connection.apiTokenCipher) {
    throw new ConflictError("Esta conexão não está totalmente configurada.");
  }

  const notificationType = getNotificationType(input.type);
  const details = input.details ?? {};
  const missingDetails = notificationType.requiredDetailKeys.filter((key) => !details[key]?.trim());
  if (missingDetails.length > 0) {
    throw new ValidationError(
      `O tipo "${notificationType.key}" precisa dos dados: ${missingDetails.join(", ")}.`
    );
  }
  if (notificationType.requiresQr && !input.qrData) {
    throw new ValidationError(`O tipo "${notificationType.key}" exige o campo qrData.`);
  }

  await touchApiKeyLastUsed(connection.id);

  const apiToken = decryptSecret(connection.apiTokenCipher);
  const provider = getWhatsappProvider(connection.provider.key);
  const config = { apiUrl: connection.apiUrl, apiToken, phoneNumber: connection.phoneNumber };

  // Best-effort — a failed/empty lookup never blocks the send, it just
  // means the greeting comes out generic ("Olá!").
  const contactName = await provider.getContactName(config, input.to).catch(() => ({ ok: false as const }));

  const baseMessage = notificationType.buildMessage({
    whatsappName: contactName.ok ? contactName.name ?? null : null,
    recipientName: input.recipientName,
    businessName: connection.organization.messageBusinessName || connection.organization.name,
    details,
  });
  const message = input.note?.trim() ? `${baseMessage}\n\n${input.note.trim()}` : baseMessage;

  if (input.qrData) {
    const qrImage = await QRCode.toDataURL(input.qrData);
    return provider.sendImage(config, input.to, qrImage, message);
  }

  return provider.sendMessage(config, input.to, message);
}
