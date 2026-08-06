import { prisma } from "@/lib/db/prisma";
import type { ChannelConnectionStatus, CommunicationChannelType } from "@/generated/prisma/client";

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
    include: { provider: true },
  });
}

export function touchApiKeyLastUsed(connectionId: string) {
  return prisma.channelConnection.update({
    where: { id: connectionId },
    data: { apiKeyLastUsedAt: new Date() },
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
