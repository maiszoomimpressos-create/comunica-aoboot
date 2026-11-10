import { prisma } from "@/lib/db/prisma";
import type { SegmentoNiche } from "@/generated/prisma/client";

export interface SegmentoSummary {
  id: string;
  name: string;
  niche: SegmentoNiche;
  createdAt: Date;
  connectionId: string;
  connectionName: string;
  phoneNumber: string;
}

const summarySelect = {
  id: true,
  name: true,
  niche: true,
  createdAt: true,
  connectionId: true,
  connection: { select: { connectionName: true, phoneNumber: true } },
} as const;

function toSummary(row: {
  id: string;
  name: string;
  niche: SegmentoNiche;
  createdAt: Date;
  connectionId: string;
  connection: { connectionName: string; phoneNumber: string };
}): SegmentoSummary {
  return {
    id: row.id,
    name: row.name,
    niche: row.niche,
    createdAt: row.createdAt,
    connectionId: row.connectionId,
    connectionName: row.connection.connectionName,
    phoneNumber: row.connection.phoneNumber,
  };
}

/** Tenant-facing — tela de Segmentos e a matriz de escopo em Papéis (pra
 * anotar, por conexão, quais segmentos ela carrega). */
export async function listSegmentosForTenant(tenantId: string): Promise<SegmentoSummary[]> {
  const rows = await prisma.segmento.findMany({
    where: { tenantId },
    select: summarySelect,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toSummary);
}

export function createSegmento(params: {
  tenantId: string;
  connectionId: string;
  name: string;
  niche: SegmentoNiche;
}) {
  return prisma.segmento.create({
    data: {
      tenantId: params.tenantId,
      connectionId: params.connectionId,
      name: params.name,
      niche: params.niche,
    },
  });
}

/** `deleteMany` scoped by tenantId so a segmento from another tenant can
 * never be targeted — same ownership pattern as updateConnectionMeta in
 * channel-connection.repository.ts. Never touches the ChannelConnection
 * underneath (it may be shared by other segmentos, or used directly). */
export function deleteSegmento(tenantId: string, segmentoId: string) {
  return prisma.segmento.deleteMany({ where: { id: segmentoId, tenantId } });
}
