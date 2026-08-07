import QRCode from "qrcode";
import { prisma } from "@/lib/db/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto/secret-box";
import { generateApiKey, hashApiKey } from "@/lib/whatsapp/api-key";
import { getWhatsappProvider } from "@/lib/whatsapp/registry";
import { WHATSAPP_PRODUCTS } from "@/config/whatsapp-products";
import type {
  QrCodeResult,
  SendMessageResult,
  TestConnectionResult,
  WhatsappConnectionConfig,
} from "@/lib/whatsapp/types";
import {
  ensureChannel,
  createPendingConnection,
  getConnectionSummary,
  getConnectionWithSecret,
  getConnectionByApiKeyHash,
  setConnectionApiKey,
  revokeConnectionApiKey,
  touchApiKeyLastUsed,
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

export interface PurchaseConfirmationInput {
  to: string;
  message: string;
  qrData: string;
}

/**
 * Entry point for external systems (e.g. an e-commerce site) triggering a
 * WhatsApp purchase-confirmation send via API key — no tenant session
 * involved, the key alone resolves the connection. The QR code image is
 * always generated by us from `qrData` (never accepted pre-rendered from
 * the caller — see plan rationale: simpler contract, no dependency on an
 * external URL, no SSRF surface), then sent as a captioned WhatsApp image.
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

  await touchApiKeyLastUsed(connection.id);

  const apiToken = decryptSecret(connection.apiTokenCipher);
  const provider = getWhatsappProvider(connection.provider.key);
  const qrImage = await QRCode.toDataURL(input.qrData);

  return provider.sendImage(
    { apiUrl: connection.apiUrl, apiToken, phoneNumber: connection.phoneNumber },
    input.to,
    qrImage,
    input.message
  );
}
