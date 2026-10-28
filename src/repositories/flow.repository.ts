import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";

export function listFlowsForConnection(connectionId: string) {
  return prisma.flow.findMany({ where: { connectionId }, orderBy: { updatedAt: "desc" } });
}

export function findFlowForTenant(tenantId: string, flowId: string) {
  return prisma.flow.findFirst({
    where: { id: flowId, connection: { tenantId } },
  });
}

/** Usado pelo motor (flow-engine.service.ts) — só o fluxo PUBLISHED importa
 * pra execução; DRAFT é só o que o editor mostra/salva. No máximo um
 * PUBLISHED por conexão é esperado (reforçado a nível de serviço em
 * publishFlow, não por constraint de banco — ver flow.service.ts). */
export function findPublishedFlowForConnection(connectionId: string) {
  return prisma.flow.findFirst({
    where: { connectionId, status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
  });
}

/** Grafo inicial de um fluxo novo — já vem com o nó de Início posicionado,
 * pra o editor nunca abrir numa tela totalmente vazia e pra validatePublishableGraph
 * (ver flow.service.ts) já ter o que exige de cara. */
export function createFlowRecord(connectionId: string, name: string) {
  return prisma.flow.create({
    data: {
      connectionId,
      name,
      draftGraph: { nodes: [{ id: "start", type: "start", position: { x: 250, y: 50 } }], edges: [] },
    },
  });
}

export function updateFlowDraft(flowId: string, data: { name?: string; draftGraph?: unknown }) {
  return prisma.flow.update({
    where: { id: flowId },
    data: { name: data.name, draftGraph: data.draftGraph as Prisma.InputJsonValue | undefined },
  });
}

export function deleteFlowRecord(flowId: string) {
  return prisma.flow.delete({ where: { id: flowId } });
}

export function countActiveFlowSessionsForFlow(flowId: string) {
  return prisma.flowSession.count({ where: { flowId, status: "ACTIVE" } });
}

// --- FlowSession (estado de execução por contato) ---

export function findActiveFlowSession(connectionId: string, contactPhone: string) {
  return prisma.flowSession.findFirst({
    where: { connectionId, contactPhone, status: "ACTIVE" },
  });
}

export function createFlowSession(data: { connectionId: string; flowId: string; contactPhone: string; currentNodeId: string }) {
  return prisma.flowSession.create({ data });
}

export function updateFlowSessionState(id: string, data: { currentNodeId?: string | null; variables?: unknown }) {
  return prisma.flowSession.update({
    where: { id },
    data: { currentNodeId: data.currentNodeId, variables: data.variables as Prisma.InputJsonValue | undefined },
  });
}

export function completeFlowSession(id: string) {
  return prisma.flowSession.update({ where: { id }, data: { status: "COMPLETED", currentNodeId: null } });
}
