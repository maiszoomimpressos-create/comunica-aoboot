import { prisma } from "@/lib/db/prisma";
import type { ChannelConnectionStatus, CommunicationChannelType } from "@/generated/prisma/client";

export interface ChannelConnectionSummary {
  id: string;
  connectionName: string;
  phoneNumber: string;
  apiUrl: string;
  status: ChannelConnectionStatus;
  lastValidation: Date | null;
  lastError: string | null;
  createdAt: Date;
  provider: { id: string; key: string; name: string };
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

export interface CreateConnectionInput {
  tenantId: string;
  channelId: string;
  providerId: string;
  connectionName: string;
  phoneNumber: string;
  apiUrl: string;
  apiTokenCipher: string;
  status: ChannelConnectionStatus;
  lastValidation: Date | null;
}

export function createConnection(input: CreateConnectionInput) {
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
