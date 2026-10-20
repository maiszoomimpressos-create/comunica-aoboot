import { generateText, isStepCount, tool, type ModelMessage } from "ai";
import { z } from "zod";
import { decryptSecret } from "@/lib/crypto/secret-box";
import { getWhatsappProvider } from "@/lib/whatsapp/registry";
import { getConnectionCredentialsById } from "@/repositories/channel-connection.repository";
import { getAiAttendantSettings } from "@/repositories/ai-attendant-settings.repository";
import {
  getBotConfig,
  getOrCreateActiveBotConversation,
  setBotConversationStatus,
  touchBotConversation,
  createBotMessage,
  listRecentBotMessages,
} from "@/repositories/bot.repository";

// Quantos turnos (mensagens IN+OUT) alimentam o contexto do modelo a cada
// resposta — suficiente pra manter uma conversa coerente (pedir origem,
// depois destino, etc.) sem deixar o prompt crescer sem limite.
const HISTORY_LIMIT = 20;

/** Instrução fixa do primeiro vertical validado (central de mobilidade) —
 * o `businessProfile` escrito pelo tenant é anexado em seguida. Pensado
 * pra virar configurável por vertical mais pra frente (ver memória
 * whatsapp-ai-attendant-bot-plan), não hardcoded pra sempre. */
const BASE_SYSTEM_PROMPT = `Você é o atendente virtual de uma central de mobilidade (chamadas de corrida) pelo WhatsApp.
Seu trabalho é ajudar o cliente a:
- Chamar uma corrida (pergunte origem e destino se não tiver essa informação).
- Consultar o status de uma corrida em andamento.
- Cancelar uma corrida.
Seja breve, direto e cordial, como uma central de atendimento real. Responda sempre em português.
Se o cliente pedir explicitamente para falar com um atendente humano, ou a solicitação estiver fora do que você consegue resolver, use a ferramenta "escalarParaHumano" em vez de tentar resolver sozinho.`;

function buildSystemPrompt(businessProfile: string | null): string {
  if (!businessProfile?.trim()) return BASE_SYSTEM_PROMPT;
  return `${BASE_SYSTEM_PROMPT}\n\nInformações desta empresa:\n${businessProfile.trim()}`;
}

export interface HandleInboundMessageInput {
  connectionId: string;
  fromPhone: string;
  text: string;
}

/** Entry point called from the inbound webhook pipeline (see
 * maybeHandleInboundBotMessage in whatsapp-connection.service.ts). Never
 * throws — any failure here must not break the webhook's fast-ack
 * contract; callers already wrap this in a catch, but every exit path
 * here is itself defensive (missing config/credentials just means "don't
 * respond", not an error). */
export async function handleInboundMessage(input: HandleInboundMessageInput): Promise<void> {
  const { connectionId, fromPhone, text } = input;

  const config = await getBotConfig(connectionId);
  if (!config?.enabled) return;

  const credentials = await getConnectionCredentialsById(connectionId);
  if (!credentials?.apiUrl || !credentials.apiTokenCipher) return;

  const conversation = await getOrCreateActiveBotConversation(connectionId, fromPhone);
  if (conversation.status === "ESCALATED") return;

  await createBotMessage(conversation.id, "IN", text);

  const history = await listRecentBotMessages(conversation.id, HISTORY_LIMIT);
  const messages: ModelMessage[] = history.map((message) => ({
    role: message.direction === "IN" ? "user" : "assistant",
    content: message.body,
  }));

  const settings = await getAiAttendantSettings();

  let escalated = false;
  const result = await generateText({
    model: settings.model,
    instructions: buildSystemPrompt(config.businessProfile),
    messages,
    tools: {
      escalarParaHumano: tool({
        description:
          'Transfere a conversa para um atendente humano. Use quando o cliente pedir explicitamente, ou quando o pedido estiver fora do que você consegue resolver.',
        inputSchema: z.object({
          motivo: z.string().describe("Breve motivo da transferência."),
        }),
        execute: async () => {
          escalated = true;
          return { ok: true };
        },
      }),
    },
    stopWhen: isStepCount(4),
  });

  const replyText =
    result.text.trim() ||
    (escalated
      ? "Só um momento, vou te transferir para um atendente humano."
      : "Desculpe, não entendi. Pode repetir?");

  const apiToken = decryptSecret(credentials.apiTokenCipher);
  const provider = getWhatsappProvider(credentials.provider.key);
  await provider.sendMessage(
    { apiUrl: credentials.apiUrl, apiToken, phoneNumber: credentials.phoneNumber },
    fromPhone,
    replyText
  );

  await createBotMessage(conversation.id, "OUT", replyText);
  if (escalated) {
    await setBotConversationStatus(conversation.id, "ESCALATED");
  } else {
    await touchBotConversation(conversation.id);
  }
}
