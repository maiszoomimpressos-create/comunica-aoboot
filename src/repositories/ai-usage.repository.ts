import { prisma } from "@/lib/db/prisma";

export function createAiUsageLog(data: {
  connectionId: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
}) {
  return prisma.aiUsageLog.create({ data });
}

export interface AiUsageTotal {
  connectionId: string;
  totalCostUsd: number | null;
  messageCount: number;
}

/** Totais por conexão pra render a coluna "Gasto IA" na tabela de
 * /admin/whatsapp — uma query só pra todas as conexões, em vez de N+1. Soma
 * `costUsd` ignorando nulls (modelo fora do catálogo do Gateway); vira null
 * no total só quando NENHUMA linha daquela conexão tem custo conhecido. */
export async function listAiUsageTotalsByConnection(): Promise<Map<string, AiUsageTotal>> {
  const rows = await prisma.aiUsageLog.groupBy({
    by: ["connectionId"],
    _sum: { costUsd: true },
    _count: { _all: true },
  });

  return new Map(
    rows.map((row) => [
      row.connectionId,
      { connectionId: row.connectionId, totalCostUsd: row._sum.costUsd, messageCount: row._count._all },
    ])
  );
}

export interface AiUsageDetail {
  totalCostUsd: number | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  messageCount: number;
  recent: Array<{
    id: string;
    model: string;
    inputTokens: number | null;
    outputTokens: number | null;
    costUsd: number | null;
    createdAt: Date;
  }>;
}

const RECENT_LIMIT = 20;

export async function getAiUsageDetailForConnection(connectionId: string): Promise<AiUsageDetail> {
  const [aggregate, recent] = await Promise.all([
    prisma.aiUsageLog.aggregate({
      where: { connectionId },
      _sum: { costUsd: true, inputTokens: true, outputTokens: true },
      _count: { _all: true },
    }),
    prisma.aiUsageLog.findMany({
      where: { connectionId },
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
      select: { id: true, model: true, inputTokens: true, outputTokens: true, costUsd: true, createdAt: true },
    }),
  ]);

  return {
    totalCostUsd: aggregate._sum.costUsd,
    totalInputTokens: aggregate._sum.inputTokens ?? 0,
    totalOutputTokens: aggregate._sum.outputTokens ?? 0,
    messageCount: aggregate._count._all,
    recent,
  };
}
