import {
  listFlowsForConnection,
  findFlowForTenant,
  createFlowRecord,
  updateFlowDraft,
  deleteFlowRecord,
  countActiveFlowSessionsForFlow,
} from "@/repositories/flow.repository";
import { isFlowGraph, type FlowGraph } from "@/lib/flow/types";
import { ValidationError, NotFoundError, ConflictError } from "@/lib/server/errors";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";

export function listFlows(connectionId: string) {
  return listFlowsForConnection(connectionId);
}

export async function createFlow(tenantId: string, connectionId: string, name: string) {
  if (!name.trim()) throw new ValidationError("Informe o nome do fluxo.");
  // checagem de posse: a conexão precisa pertencer a este tenant
  const connection = await prisma.channelConnection.findFirst({ where: { id: connectionId, tenantId } });
  if (!connection) throw new NotFoundError("Conexão não encontrada.");
  return createFlowRecord(connectionId, name.trim());
}

export async function updateFlowGraph(tenantId: string, flowId: string, graph: FlowGraph, name?: string) {
  if (!isFlowGraph(graph)) throw new ValidationError("Grafo do fluxo inválido.");
  const existing = await findFlowForTenant(tenantId, flowId);
  if (!existing) throw new NotFoundError("Fluxo não encontrado.");
  return updateFlowDraft(flowId, { name: name?.trim() || undefined, draftGraph: graph });
}

/** Precisa de um nó "start" e, pra todo nó `menu`, cada opção precisa ter
 * uma aresta de saída correspondente — senão o motor trava esperando uma
 * escolha que nunca tem pra onde ir. Validação mínima: suficiente pra não
 * publicar um grafo obviamente quebrado, sem reimplementar o motor aqui. */
function validatePublishableGraph(graph: FlowGraph) {
  if (!graph.nodes.some((n) => n.type === "start")) {
    throw new ValidationError("O fluxo precisa de um nó de Início.");
  }
  for (const node of graph.nodes) {
    if (node.type === "menu") {
      const optionIds = new Set((node.data?.options ?? []).map((o) => o.id));
      const edgeHandles = new Set(
        graph.edges.filter((e) => e.source === node.id).map((e) => e.sourceHandle ?? null)
      );
      const missing = [...optionIds].filter((id) => !edgeHandles.has(id));
      if (missing.length > 0) {
        throw new ValidationError(`O menu "${node.data?.text ?? node.id}" tem opção sem conexão de saída.`);
      }
    }
  }
}

export async function publishFlow(tenantId: string, flowId: string) {
  const existing = await findFlowForTenant(tenantId, flowId);
  if (!existing) throw new NotFoundError("Fluxo não encontrado.");
  const graph = existing.draftGraph as unknown as FlowGraph;
  if (!isFlowGraph(graph)) throw new ValidationError("Grafo do fluxo inválido.");
  validatePublishableGraph(graph);

  return prisma.$transaction(async (tx) => {
    await tx.flow.updateMany({
      where: { connectionId: existing.connectionId, status: "PUBLISHED", id: { not: flowId } },
      data: { status: "ARCHIVED" },
    });
    return tx.flow.update({
      where: { id: flowId },
      data: { status: "PUBLISHED", publishedGraph: graph as unknown as Prisma.InputJsonValue, publishedAt: new Date() },
    });
  });
}

export async function deleteFlow(tenantId: string, flowId: string) {
  const existing = await findFlowForTenant(tenantId, flowId);
  if (!existing) throw new NotFoundError("Fluxo não encontrado.");
  const liveSessions = await countActiveFlowSessionsForFlow(flowId);
  if (liveSessions > 0) {
    throw new ConflictError("Não é possível excluir: há conversas em andamento neste fluxo.");
  }
  return deleteFlowRecord(flowId);
}
