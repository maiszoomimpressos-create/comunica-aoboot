import QRCode from "qrcode";
import { prisma } from "@/lib/db/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto/secret-box";
import { generateApiKey, hashApiKey } from "@/lib/whatsapp/api-key";
import { getWhatsappProvider } from "@/lib/whatsapp/registry";
import type {
  SendMessageResult,
  TestConnectionResult,
  WhatsappConnectionConfig,
} from "@/lib/whatsapp/types";
import {
  getConnectionSummary,
  getConnectionWithSecret,
  getConnectionByApiKeyHash,
  setConnectionApiKey,
  revokeConnectionApiKey,
  touchApiKeyLastUsed,
  updateConnectionStatus,
  type ChannelConnectionSummary,
} from "@/repositories/channel-connection.repository";
import { getProviderById } from "@/repositories/channel-provider.repository";
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@/lib/server/errors";

const WHATSAPP_MODULE_KEY = "whatsapp";

/** Tests provider credentials without touching the database — used by the
 * wizard's "Testar conexão" button before anything is saved. */
export async function testConnection(
  providerKey: string,
  config: WhatsappConnectionConfig
): Promise<TestConnectionResult> {
  const provider = getWhatsappProvider(providerKey);
  return provider.testConnection(config);
}

export interface CreateConnectionInput {
  providerId: string;
  connectionName: string;
  phoneNumber: string;
  apiUrl: string;
  apiToken: string;
}

/**
 * Re-validates the credentials server-side (never trusts the client's
 * reported test result) and, only on success, persists the channel +
 * connection and marks the WhatsApp module as INSTALLED for this tenant —
 * all in one transaction. Throws (without writing anything) if the test
 * fails, carrying the exact reason so the UI can show it.
 */
export async function createConnection(
  tenantId: string,
  input: CreateConnectionInput
): Promise<ChannelConnectionSummary> {
  const provider = await getProviderById(input.providerId);
  if (!provider) throw new NotFoundError("Provedor não encontrado.");
  if (!provider.isActive) throw new ConflictError("Este provedor ainda não está disponível.");

  const testResult = await testConnection(provider.key, {
    apiUrl: input.apiUrl,
    apiToken: input.apiToken,
    phoneNumber: input.phoneNumber,
  });

  if (!testResult.ok) {
    throw new ValidationError(testResult.message, { status: testResult.status });
  }

  const apiTokenCipher = encryptSecret(input.apiToken);

  const connectionId = await prisma.$transaction(async (tx) => {
    const channel = await tx.communicationChannel.upsert({
      where: { tenantId_type: { tenantId, type: "WHATSAPP" } },
      create: { tenantId, type: "WHATSAPP" },
      update: {},
    });

    const created = await tx.channelConnection.create({
      data: {
        tenantId,
        channelId: channel.id,
        providerId: provider.id,
        connectionName: input.connectionName,
        phoneNumber: input.phoneNumber,
        apiUrl: input.apiUrl,
        apiTokenCipher,
        status: "CONNECTED",
        lastValidation: new Date(),
      },
      select: { id: true },
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

    return created.id;
  });

  const summary = await getConnectionSummary(tenantId, connectionId);
  if (!summary) throw new NotFoundError("Conexão criada, mas não encontrada ao recarregar.");
  return summary;
}

export async function sendTestMessage(
  tenantId: string,
  connectionId: string,
  to: string,
  text: string
): Promise<SendMessageResult> {
  const connection = await getConnectionWithSecret(tenantId, connectionId);
  if (!connection) throw new NotFoundError("Conexão não encontrada.");

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
