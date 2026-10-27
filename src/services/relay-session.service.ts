import { decryptSecret } from "@/lib/crypto/secret-box";
import { getWhatsappProvider } from "@/lib/whatsapp/registry";
import type { WhatsappProvider } from "@/lib/whatsapp/provider";
import type { WhatsappConnectionConfig } from "@/lib/whatsapp/types";
import { getConnectionCredentialsById } from "@/repositories/channel-connection.repository";
import { createBotMessage, closeBotConversation } from "@/repositories/bot.repository";
import {
  createPendingRelaySession,
  tryClaimRelaySession,
  findLiveSessionByCustomerPhone,
  findActiveSessionByAttendantPhone,
  findPendingSessionsForAttendant,
  bumpRelaySessionActivity,
  closeRelaySession,
} from "@/repositories/relay-session.repository";
import { logBotEvent, serializeError } from "@/lib/logging/bot-attendant-logger";

const CLOSE_COMMAND = "/encerrar";

/** Monta e dispara o broadcast pra todo o pool do setor escolhido na
 * escalação (ver handleInboundMessage em bot-attendant.service.ts, logo
 * depois de escalateBotConversation). `provider`/`providerConfig` vêm do
 * chamador — handleInboundMessage já os decriptou pra esse connectionId
 * neste mesmo turno, então reaproveitar evita uma segunda decriptação. */
export async function createAndBroadcastRelaySession(params: {
  connectionId: string;
  conversationId: string;
  customerPhone: string;
  customerName: string | null;
  setor: { id: string; name: string; attendants: { phone: string }[] };
  motivo: string;
  resumoPedido: string | null;
  provider: WhatsappProvider;
  providerConfig: WhatsappConnectionConfig;
}): Promise<void> {
  const { connectionId, conversationId, customerPhone, customerName, setor, motivo, resumoPedido, provider, providerConfig } =
    params;
  const broadcastedTo = setor.attendants.map((a) => a.phone);
  if (broadcastedTo.length === 0) return; // não deveria acontecer — listActiveSetoresWithAttendants já filtra isso

  const session = await createPendingRelaySession({ connectionId, setorId: setor.id, conversationId, customerPhone, broadcastedTo });

  const quemLines = [
    `Novo atendimento — ${setor.name}`,
    customerName ? `Cliente: ${customerName} (${customerPhone})` : `Cliente: ${customerPhone}`,
    `Motivo: ${motivo}`,
    resumoPedido ? `Resumo: ${resumoPedido}` : null,
    `Responda "#${session.code}" pra atender este cliente.`,
  ].filter(Boolean);
  const broadcastText = quemLines.join("\n");

  for (const phone of broadcastedTo) {
    try {
      await provider.sendMessage(providerConfig, phone, broadcastText);
    } catch (err) {
      await logBotEvent("error", "relay_broadcast_send_failed", {
        connectionId,
        setorId: setor.id,
        relaySessionId: session.id,
        attendantPhone: phone,
        error: serializeError(err),
      });
    }
  }

  await logBotEvent("info", "relay_session_broadcast", {
    connectionId,
    setorId: setor.id,
    relaySessionId: session.id,
    code: session.code,
    poolSize: broadcastedTo.length,
  });
}

async function resolveProvider(
  connectionId: string
): Promise<{ provider: WhatsappProvider; providerConfig: WhatsappConnectionConfig } | null> {
  const credentials = await getConnectionCredentialsById(connectionId);
  if (!credentials?.apiUrl || !credentials.apiTokenCipher) return null;
  const apiToken = decryptSecret(credentials.apiTokenCipher);
  const provider = getWhatsappProvider(credentials.provider.key);
  return { provider, providerConfig: { apiUrl: credentials.apiUrl, apiToken, phoneNumber: credentials.phoneNumber } };
}

function extractCode(text: string | null): string | null {
  if (!text) return null;
  const match = text.trim().match(/#?\s*([A-Z0-9]{4})/i);
  return match ? match[1].toUpperCase() : null;
}

/** Ponto de entrada chamado de maybeHandleInboundBotMessage (ver
 * whatsapp-connection.service.ts), depois do dedup de redelivery e antes dos
 * branches texto/áudio -> handleInboundMessage. `true` significa "já
 * tratei, não deixa cair no bot de IA"; `false` significa "não tem nada a
 * ver com relay, segue o fluxo normal". Resolve credenciais/provider aqui
 * mesmo (duplicado de propósito em relação a handleInboundMessage) pra
 * manter os dois pontos de entrada independentes. */
export async function tryHandleRelayMessage(params: {
  connectionId: string;
  fromPhone: string;
  customerName: string | null;
  text: string | null;
}): Promise<boolean> {
  const { connectionId, fromPhone, text } = params;

  const customerSession = await findLiveSessionByCustomerPhone(connectionId, fromPhone);
  if (customerSession) {
    const resolved = await resolveProvider(connectionId);
    if (!resolved) return false;
    const { provider, providerConfig } = resolved;

    if (customerSession.status === "PENDING") {
      await logBotEvent("info", "relay_customer_waiting", { connectionId, fromPhone, relaySessionId: customerSession.id });
      return true;
    }

    // ACTIVE
    if (!text) {
      await provider.sendMessage(
        providerConfig,
        fromPhone,
        "Por enquanto só consigo repassar mensagens de texto durante o atendimento — pode escrever?"
      );
      return true;
    }
    await provider.sendMessage(providerConfig, customerSession.claimedByPhone!, text);
    await bumpRelaySessionActivity(customerSession.id);
    await createBotMessage(customerSession.conversationId, "IN", text);
    return true;
  }

  const attendantActiveSession = await findActiveSessionByAttendantPhone(connectionId, fromPhone);
  if (attendantActiveSession) {
    const resolved = await resolveProvider(connectionId);
    if (!resolved) return false;
    const { provider, providerConfig } = resolved;

    if (text?.trim().toLowerCase() === CLOSE_COMMAND) {
      await closeRelaySession(attendantActiveSession.id, "attendant_command");
      await closeBotConversation(attendantActiveSession.conversationId);
      await provider.sendMessage(providerConfig, fromPhone, "Atendimento encerrado.");
      await provider.sendMessage(
        providerConfig,
        attendantActiveSession.customerPhone,
        "Atendimento encerrado. Se precisar de algo mais, só mandar mensagem."
      );
      await logBotEvent("info", "relay_session_closed", {
        connectionId,
        relaySessionId: attendantActiveSession.id,
        closeReason: "attendant_command",
      });
      return true;
    }

    if (!text) {
      await provider.sendMessage(
        providerConfig,
        fromPhone,
        "Por enquanto só consigo repassar mensagens de texto durante o atendimento — pode escrever?"
      );
      return true;
    }

    await provider.sendMessage(providerConfig, attendantActiveSession.customerPhone, text);
    await bumpRelaySessionActivity(attendantActiveSession.id);
    await createBotMessage(attendantActiveSession.conversationId, "OUT", text);
    return true;
  }

  const pendingForAttendant = await findPendingSessionsForAttendant(connectionId, fromPhone);
  if (pendingForAttendant.length > 0) {
    const resolved = await resolveProvider(connectionId);
    if (!resolved) return false;
    const { provider, providerConfig } = resolved;

    const code = extractCode(text);
    let target = pendingForAttendant.length === 1 ? pendingForAttendant[0] : undefined;
    if (!target && code) target = pendingForAttendant.find((s) => s.code === code);

    if (!target) {
      const list = pendingForAttendant.map((s) => `#${s.code} (cliente ${s.customerPhone})`).join(", ");
      await provider.sendMessage(
        providerConfig,
        fromPhone,
        `Você tem ${pendingForAttendant.length} atendimentos pendentes: ${list}. Responda com o código pra assumir um.`
      );
      return true;
    }

    const claimed = await tryClaimRelaySession(target.id, fromPhone);
    if (claimed) {
      await provider.sendMessage(providerConfig, fromPhone, "Você assumiu o atendimento. Pode conversar direto por aqui.");
      await provider.sendMessage(providerConfig, target.customerPhone, "Você já está sendo atendido. Um momento.");
      await logBotEvent("info", "relay_session_claimed", { connectionId, relaySessionId: target.id, attendantPhone: fromPhone });
    } else {
      await provider.sendMessage(providerConfig, fromPhone, "Esse atendimento já foi assumido por outro colega.");
    }
    return true;
  }

  return false;
}
