import { decryptSecret } from "@/lib/crypto/secret-box";
import { getWhatsappProvider } from "@/lib/whatsapp/registry";
import type { WhatsappProvider } from "@/lib/whatsapp/provider";
import type { WhatsappConnectionConfig } from "@/lib/whatsapp/types";
import { getConnectionCredentialsById } from "@/repositories/channel-connection.repository";
import {
  findPublishedFlowForConnection,
  findActiveFlowSession,
  createFlowSession,
  updateFlowSessionState,
  completeFlowSession,
} from "@/repositories/flow.repository";
import { isFlowGraph, type FlowGraph, type FlowNode, type FlowMenuOption } from "@/lib/flow/types";
import { validateFormField } from "@/lib/flow/field-validation";
import { createFormSubmissionDocument } from "@/services/form-submission.service";
import { logBotEvent, serializeError } from "@/lib/logging/bot-attendant-logger";

// Limite de nós visitados num único turno — guarda contra um grafo
// mal-formado (ex: condição apontando pra si mesma) travar a conversa num
// loop infinito em vez de falhar visivelmente.
const MAX_STEPS_PER_TURN = 25;

async function resolveProvider(
  connectionId: string
): Promise<{ provider: WhatsappProvider; providerConfig: WhatsappConnectionConfig } | null> {
  const credentials = await getConnectionCredentialsById(connectionId);
  if (!credentials?.apiUrl || !credentials.apiTokenCipher) return null;
  const apiToken = decryptSecret(credentials.apiTokenCipher);
  const provider = getWhatsappProvider(credentials.provider.key);
  return { provider, providerConfig: { apiUrl: credentials.apiUrl, apiToken, phoneNumber: credentials.phoneNumber } };
}

function matchMenuOption(options: FlowMenuOption[], text: string): FlowMenuOption | undefined {
  const trimmed = text.trim();
  const normalized = trimmed.toLowerCase();
  if (/^\d+$/.test(trimmed)) {
    const byIndex = options[Number(trimmed) - 1];
    if (byIndex) return byIndex;
  }
  return (
    options.find((o) => o.label.trim().toLowerCase() === normalized) ??
    options.find((o) => normalized.includes(o.label.trim().toLowerCase()))
  );
}

function renderMenuPrompt(node: FlowNode): string {
  const options = node.data?.options ?? [];
  const lines = options.map((o, i) => `${i + 1}. ${o.label}`);
  return [node.data?.text ?? "", ...lines].filter(Boolean).join("\n");
}

function evaluateCondition(value: string, operator: "equals" | "contains" | undefined, target: string): boolean {
  const v = value.trim().toLowerCase();
  const t = target.trim().toLowerCase();
  if (operator === "contains") return v.includes(t);
  return v === t; // "equals" é o default
}

/** Ponto de entrada chamado de maybeHandleInboundBotMessage (ver
 * whatsapp-connection.service.ts), depois de tryHandleRelayMessage e antes
 * de handleInboundMessage (IA) — mesmo lugar na cadeia, mesma convenção de
 * retorno: `true` significa "já tratei, não deixa cair no bot de IA";
 * `false` significa "esta conexão não tem fluxo publicado (ou o grafo é
 * inválido/usa um nó ainda não suportado), segue pro atendente de IA
 * normalmente". Resolve credenciais/provider aqui mesmo, duplicado de
 * propósito em relação a handleInboundMessage/tryHandleRelayMessage, pra
 * manter os três pontos de entrada independentes. */
export async function tryHandleFlowMessage(params: {
  connectionId: string;
  fromPhone: string;
  customerName: string | null;
  text: string | null;
}): Promise<boolean> {
  const { connectionId, fromPhone, text } = params;

  const flow = await findPublishedFlowForConnection(connectionId);
  if (!flow || !flow.publishedGraph) return false;
  const graph = flow.publishedGraph as unknown as FlowGraph;
  if (!isFlowGraph(graph)) {
    await logBotEvent("warn", "flow_invalid_published_graph", { connectionId, flowId: flow.id });
    return false;
  }

  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const outgoing = (sourceId: string, handle?: string | null) =>
    graph.edges.filter((e) => e.source === sourceId && (handle === undefined || (e.sourceHandle ?? null) === handle));

  const startNode = graph.nodes.find((n) => n.type === "start");
  if (!startNode) {
    await logBotEvent("warn", "flow_missing_start_node", { connectionId, flowId: flow.id });
    return false;
  }

  let session = await findActiveFlowSession(connectionId, fromPhone);
  // Sessão de um Flow diferente do que está publicado agora (tenant trocou
  // de fluxo com uma conversa em andamento) — trata como abandonada e
  // recomeça do início deste.
  if (session && session.flowId !== flow.id) {
    await completeFlowSession(session.id);
    session = null;
  }

  const resolved = await resolveProvider(connectionId);
  if (!resolved) return false;
  const { provider, providerConfig } = resolved;

  let isFresh = false;
  let nodeId: string;
  let variables: Record<string, unknown>;

  if (!session) {
    session = await createFlowSession({ connectionId, flowId: flow.id, contactPhone: fromPhone, currentNodeId: startNode.id });
    nodeId = startNode.id;
    variables = {};
    isFresh = true;
  } else {
    nodeId = session.currentNodeId ?? startNode.id;
    variables = (session.variables as Record<string, unknown>) ?? {};
    // Esperando resposta de menu/pergunta mas o cliente mandou algo sem
    // texto (áudio, imagem, ...) — mesmo aviso usado em
    // relay-session.service.ts, não dá pra processar isso num nó que
    // espera texto.
    if (!text) {
      await provider.sendMessage(
        providerConfig,
        fromPhone,
        "Por enquanto só consigo continuar o atendimento por texto — pode escrever?"
      );
      return true;
    }
  }

  let waitingNodeId: string | null = null;
  let steps = 0;

  while (steps++ < MAX_STEPS_PER_TURN) {
    const node = byId.get(nodeId);
    if (!node) {
      await logBotEvent("warn", "flow_dangling_node_reference", { connectionId, flowId: flow.id, nodeId });
      break;
    }

    if (node.type === "start") {
      const next = outgoing(node.id)[0];
      if (!next) break;
      nodeId = next.target;
      continue;
    }

    if (node.type === "message") {
      if (node.data?.text) await provider.sendMessage(providerConfig, fromPhone, node.data.text);
      const next = outgoing(node.id)[0];
      if (!next) break;
      nodeId = next.target;
      continue;
    }

    if (node.type === "menu") {
      const isReplyToThisNode = !isFresh && session.currentNodeId === node.id;
      if (isReplyToThisNode) {
        const choice = matchMenuOption(node.data?.options ?? [], text!);
        if (!choice) {
          await provider.sendMessage(providerConfig, fromPhone, `Não entendi.\n${renderMenuPrompt(node)}`);
          waitingNodeId = node.id;
          break;
        }
        const next = outgoing(node.id, choice.id)[0];
        if (!next) {
          await logBotEvent("warn", "flow_menu_option_without_edge", { connectionId, flowId: flow.id, nodeId: node.id, optionId: choice.id });
          break;
        }
        nodeId = next.target;
        continue;
      }
      await provider.sendMessage(providerConfig, fromPhone, renderMenuPrompt(node));
      waitingNodeId = node.id;
      break;
    }

    if (node.type === "question") {
      const isReplyToThisNode = !isFresh && session.currentNodeId === node.id;
      if (isReplyToThisNode) {
        if (node.data?.variable) variables[node.data.variable] = text!.trim();
        const next = outgoing(node.id)[0];
        if (!next) break;
        nodeId = next.target;
        continue;
      }
      if (node.data?.text) await provider.sendMessage(providerConfig, fromPhone, node.data.text);
      waitingNodeId = node.id;
      break;
    }

    if (node.type === "form") {
      const fields = node.data?.fields ?? [];
      const progress = variables.__formProgress as { nodeId: string; index: number } | undefined;
      const isActiveHere = !isFresh && session.currentNodeId === node.id && progress?.nodeId === node.id;

      if (fields.length === 0) {
        await logBotEvent("warn", "flow_form_without_fields", { connectionId, flowId: flow.id, nodeId: node.id });
        const next = outgoing(node.id)[0];
        if (!next) break;
        nodeId = next.target;
        continue;
      }

      if (!isActiveHere) {
        variables.__formProgress = { nodeId: node.id, index: 0 };
        await provider.sendMessage(providerConfig, fromPhone, fields[0].label);
        waitingNodeId = node.id;
        break;
      }

      const idx = progress!.index;

      if (idx < fields.length) {
        const field = fields[idx];
        const result = validateFormField(field.fieldType, text!);
        if (!result.valid) {
          await provider.sendMessage(providerConfig, fromPhone, `${result.error}\n${field.label}`);
          waitingNodeId = node.id;
          break;
        }
        variables[field.variable] = result.normalized;
        const nextIndex = idx + 1;
        variables.__formProgress = { nodeId: node.id, index: nextIndex };
        if (nextIndex < fields.length) {
          await provider.sendMessage(providerConfig, fromPhone, fields[nextIndex].label);
          waitingNodeId = node.id;
          break;
        }
        const summary = fields.map((f) => `${f.label}: ${variables[f.variable]}`).join("\n");
        await provider.sendMessage(
          providerConfig,
          fromPhone,
          `Confira suas respostas:\n${summary}\n\nDigite ENVIAR para confirmar ou CORRIGIR para refazer.`
        );
        waitingNodeId = node.id;
        break;
      }

      // idx === fields.length: esperando ENVIAR/CORRIGIR depois do resumo.
      const answer = text!.trim().toLowerCase();
      if (answer === "corrigir") {
        variables.__formProgress = { nodeId: node.id, index: 0 };
        await provider.sendMessage(providerConfig, fromPhone, fields[0].label);
        waitingNodeId = node.id;
        break;
      }
      if (answer !== "enviar") {
        await provider.sendMessage(
          providerConfig,
          fromPhone,
          "Digite ENVIAR para confirmar ou CORRIGIR para refazer."
        );
        waitingNodeId = node.id;
        break;
      }

      const answers = Object.fromEntries(fields.map((f) => [f.variable, variables[f.variable]]));
      await createFormSubmissionDocument({
        connectionId,
        flowId: flow.id,
        nodeId: node.id,
        title: node.data?.title || "Formulário",
        contactPhone: fromPhone,
        fields,
        answers,
      });
      delete variables.__formProgress;
      const next = outgoing(node.id)[0];
      if (!next) {
        await completeFlowSession(session.id);
        return true;
      }
      nodeId = next.target;
      continue;
    }

    if (node.type === "condition") {
      const current = String(variables[node.data?.variable ?? ""] ?? "");
      const matches = evaluateCondition(current, node.data?.operator, node.data?.value ?? "");
      const next = outgoing(node.id, matches ? "true" : "false")[0];
      if (!next) {
        await logBotEvent("warn", "flow_condition_without_edge", { connectionId, flowId: flow.id, nodeId: node.id, matches });
        break;
      }
      nodeId = next.target;
      continue;
    }

    if (node.type === "end") {
      if (node.data?.text) await provider.sendMessage(providerConfig, fromPhone, node.data.text);
      await completeFlowSession(session.id);
      return true;
    }

    // ai/action/human — fase 4, ainda não implementados. Não falha a
    // conversa: desiste do fluxo neste turno e deixa o atendente de IA
    // responder, mas mantém a sessão onde estava pra tentar de novo depois
    // (um tenant só chega a publicar esses nós quando o editor existir).
    await logBotEvent("warn", "flow_node_not_implemented", { connectionId, flowId: flow.id, nodeType: node.type });
    return false;
  }

  await updateFlowSessionState(session.id, { currentNodeId: waitingNodeId, variables }).catch(async (err) => {
    await logBotEvent("error", "flow_session_persist_failed", { connectionId, flowId: flow.id, error: serializeError(err) });
  });
  return true;
}
