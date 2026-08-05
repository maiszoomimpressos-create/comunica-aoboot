import { prisma } from "@/lib/db/prisma";
import type { CommunicationChannelType } from "@/generated/prisma/client";

export interface ChannelProviderDto {
  id: string;
  key: string;
  name: string;
  channelType: CommunicationChannelType;
  isActive: boolean;
  sortOrder: number;
}

/** All providers for a channel type, active or not — UI shows inactive ones as "Em breve". */
export async function listAllProvidersForChannelType(
  channelType: CommunicationChannelType
): Promise<ChannelProviderDto[]> {
  return prisma.channelProvider.findMany({
    where: { channelType },
    orderBy: { sortOrder: "asc" },
  });
}

export function getProviderById(id: string) {
  return prisma.channelProvider.findUnique({ where: { id } });
}

export function getProviderByKey(key: string) {
  return prisma.channelProvider.findUnique({ where: { key } });
}
