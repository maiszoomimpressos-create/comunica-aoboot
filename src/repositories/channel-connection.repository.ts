import { prisma } from "@/lib/db/prisma";
import type { ChannelConnectionStatus, CommunicationChannelType } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";

export interface ChannelConnectionSummary {
  id: string;
  connectionName: string;
  phoneNumber: string;
  apiUrl: string | null;
  status: ChannelConnectionStatus;
  lastValidation: Date | null;
  lastError: string | null;
  createdAt: Date;
  provider: { id: string; key: string; name: string };
  // Never the hash — just enough to render the "API" section in the UI.
  apiKeyPrefix: string | null;
  apiKeyCreatedAt: Date | null;
  apiKeyLastUsedAt: Date | null;
  // Números fixos (até 3) que recebem o alerta de saldo baixo — ver
  // sendBalanceAlert em whatsapp-connection.service.ts.
  balanceAlertPhones: string[];
  // Quais serviços (config/whatsapp-services.ts) a chave de API pode
  // chamar — ver sendPurchaseConfirmation / sendBalanceAlert.
  enabledServices: string[];
}

const summarySelect = {
  id: true,
  connectionName: true,
  phoneNumber: true,
  apiUrl: true,
  status: true,
  lastValidation: true,
  lastError: true,
  createdAt: true,
  provider: { select: { id: true, key: true, name: true } },
  apiKeyPrefix: true,
  apiKeyCreatedAt: true,
  apiKeyLastUsedAt: true,
  balanceAlertPhones: true,
  enabledServices: true,
} as const;

/** Get-or-create the tenant's channel row for a given type (WHATSAPP, ...). */
export async function ensureChannel(tenantId: string, type: CommunicationChannelType) {
  return prisma.communicationChannel.upsert({
    where: { tenantId_type: { tenantId, type } },
    create: { tenantId, type },
    update: {},
  });
}

export async function listConnectionsForTenant(
  tenantId: string,
  type: CommunicationChannelType
): Promise<ChannelConnectionSummary[]> {
  return prisma.channelConnection.findMany({
    where: { tenantId, channel: { type } },
    orderBy: { createdAt: "asc" },
    select: summarySelect,
  });
}

export async function getConnectionSummary(
  tenantId: string,
  connectionId: string
): Promise<ChannelConnectionSummary | null> {
  return prisma.channelConnection.findFirst({
    where: { id: connectionId, tenantId },
    select: summarySelect,
  });
}

/** Only for call sites that need to actually talk to the provider (send a message, re-test). */
export async function getConnectionWithSecret(tenantId: string, connectionId: string) {
  return prisma.channelConnection.findFirst({
    where: { id: connectionId, tenantId },
    include: { provider: true },
  });
}

export interface CreatePendingConnectionInput {
  tenantId: string;
  channelId: string;
  providerId: string;
  connectionName: string;
  phoneNumber: string;
}

/** Creates a connection request with no credentials yet — `status` defaults
 * to PENDING (schema default). A platform admin fills in the real
 * credentials later — see whatsapp-connection.service.ts's
 * `provisionConnection`, which writes them directly inside a transaction
 * (alongside the TenantModule upsert), same pattern as every other
 * multi-write flow in this service. */
export function createPendingConnection(input: CreatePendingConnectionInput) {
  return prisma.channelConnection.create({ data: input });
}

/** Tenant-editable metadata — never touches credentials (apiUrl/token),
 * which only a platform admin can set via provisionConnection. */
export function updateConnectionMeta(
  tenantId: string,
  connectionId: string,
  data: { connectionName: string; phoneNumber: string }
) {
  return prisma.channelConnection.updateMany({
    where: { id: connectionId, tenantId },
    data,
  });
}

/** Tenant-editable list of up to 3 fixed phone numbers that receive the
 * balance-alert message (see sendBalanceAlert) — deliberately separate from
 * updateConnectionMeta since it's edited from its own dialog, not the
 * name/phone form. */
export function updateBalanceAlertPhones(tenantId: string, connectionId: string, phones: string[]) {
  return prisma.channelConnection.updateMany({
    where: { id: connectionId, tenantId },
    data: { balanceAlertPhones: phones },
  });
}

/** Tenant-editable set of services (config/whatsapp-services.ts) this
 * connection's API key is allowed to call — enforced inside each service
 * function (sendPurchaseConfirmation / sendBalanceAlert), not here. */
export function updateEnabledServices(tenantId: string, connectionId: string, services: string[]) {
  return prisma.channelConnection.updateMany({
    where: { id: connectionId, tenantId },
    data: { enabledServices: services },
  });
}

export function updateConnectionStatus(
  tenantId: string,
  connectionId: string,
  data: { status: ChannelConnectionStatus; lastValidation: Date | null; lastError: string | null }
) {
  return prisma.channelConnection.updateMany({
    where: { id: connectionId, tenantId },
    data,
  });
}

export function deleteConnection(tenantId: string, connectionId: string) {
  return prisma.channelConnection.deleteMany({ where: { id: connectionId, tenantId } });
}

// --- API key (machine-to-machine auth) -----------------------------------

export function setConnectionApiKey(
  tenantId: string,
  connectionId: string,
  data: { apiKeyHash: string; apiKeyPrefix: string }
) {
  return prisma.channelConnection.updateMany({
    where: { id: connectionId, tenantId },
    data: { ...data, apiKeyCreatedAt: new Date(), apiKeyLastUsedAt: null },
  });
}

export function revokeConnectionApiKey(tenantId: string, connectionId: string) {
  return prisma.channelConnection.updateMany({
    where: { id: connectionId, tenantId },
    data: { apiKeyHash: null, apiKeyPrefix: null, apiKeyCreatedAt: null, apiKeyLastUsedAt: null },
  });
}

/** Resolves a connection from an inbound API key hash — deliberately NOT
 * tenant-scoped, since this is what identifies the tenant/connection from
 * an anonymous machine-to-machine request in the first place. */
export function getConnectionByApiKeyHash(apiKeyHash: string) {
  return prisma.channelConnection.findUnique({
    where: { apiKeyHash },
    include: {
      provider: true,
      organization: { select: { name: true, messageBusinessName: true } },
    },
  });
}

export function touchApiKeyLastUsed(connectionId: string) {
  return prisma.channelConnection.update({
    where: { id: connectionId },
    data: { apiKeyLastUsedAt: new Date() },
  });
}

// --- Webhooks (inbound, from the provider) ----------------------------------

/** Resolves a connection purely by id + its webhook secret — deliberately
 * NOT tenant-scoped, since a webhook call from Z-API carries neither a
 * session nor our API key, only whatever we embedded in the URL we gave
 * Z-API to call (see app/api/webhooks/zapi/[connectionId]/route.ts). */
export function getConnectionForWebhook(connectionId: string) {
  return prisma.channelConnection.findUnique({
    where: { id: connectionId },
    select: { id: true, webhookSecret: true, provider: { select: { key: true } } },
  });
}

/** Same shape as updateConnectionStatus but keyed only by connectionId —
 * used from the webhook path, which (unlike every tenant-facing action)
 * has no tenantId to scope by; getConnectionForWebhook already proved the
 * connectionId is real via the secret check before this is ever called. */
export function updateConnectionStatusById(
  connectionId: string,
  data: { status: ChannelConnectionStatus; lastValidation: Date | null; lastError: string | null }
) {
  return prisma.channelConnection.update({ where: { id: connectionId }, data });
}

export function setWebhookSecret(tenantId: string, connectionId: string, secret: string) {
  return prisma.channelConnection.updateMany({
    where: { id: connectionId, tenantId },
    data: { webhookSecret: secret },
  });
}

export function createWebhookEvent(connectionId: string, source: string, payload: unknown) {
  return prisma.webhookEvent.create({
    data: { connectionId, source, payload: payload as Prisma.InputJsonValue },
  });
}

/** For inspecting what's landed so far — no UI yet, used directly (Prisma
 * Studio, a one-off script) until a concrete feature reads these for
 * something end-user-facing. */
export function listRecentWebhookEvents(connectionId: string, limit = 20) {
  return prisma.webhookEvent.findMany({
    where: { connectionId },
    orderBy: { receivedAt: "desc" },
    take: limit,
  });
}

// --- Platform admin (cross-tenant) -----------------------------------------

export interface AdminChannelConnectionRow {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  connectionName: string;
  phoneNumber: string;
  status: ChannelConnectionStatus;
  providerName: string;
  createdAt: Date;
}

/** Every connection across every tenant — the queue platform admins work
 * from at /admin/whatsapp to provision Z-API credentials for pending
 * requests. Ordered PENDING-first (enum declaration order in schema.prisma
 * puts PENDING first, so `status: "asc"` sorts it to the top), newest
 * first within each status. */
export async function listAllConnectionsForAdmin(): Promise<AdminChannelConnectionRow[]> {
  const connections = await prisma.channelConnection.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      organization: { select: { name: true, slug: true } },
      provider: { select: { name: true } },
    },
  });

  return connections.map((c) => ({
    id: c.id,
    tenantId: c.tenantId,
    tenantName: c.organization.name,
    tenantSlug: c.organization.slug,
    connectionName: c.connectionName,
    phoneNumber: c.phoneNumber,
    status: c.status,
    providerName: c.provider.name,
    createdAt: c.createdAt,
  }));
}

/** How many connection requests (any tenant) are still waiting on a
 * platform admin to provision credentials — drives the notification dot
 * shown on the "Acessar como colaborador" button and the admin sidebar's
 * WhatsApp nav item. */
export function countPendingConnectionsForAdmin(): Promise<number> {
  return prisma.channelConnection.count({ where: { status: "PENDING" } });
}
