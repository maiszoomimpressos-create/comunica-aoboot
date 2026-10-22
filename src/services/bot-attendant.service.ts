import { generateSpeech, generateText, isStepCount, tool, transcribe, type ModelMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
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
Antes de confirmar um pedido de corrida, use a ferramenta "buscarEndereco" pra conferir se a origem e o destino que o cliente informou existem de verdade — se não encontrar, peça pro cliente detalhar ou repetir o endereço em vez de assumir que está certo.
Se o cliente pedir explicitamente para falar com um atendente humano, ou a solicitação estiver fora do que você consegue resolver, use a ferramenta "escalarParaHumano" em vez de tentar resolver sozinho.`;

function buildSystemPrompt(businessProfile: string | null): string {
  if (!businessProfile?.trim()) return BASE_SYSTEM_PROMPT;
  return `${BASE_SYSTEM_PROMPT}\n\nInformações desta empresa:\n${businessProfile.trim()}`;
}

export type HandleInboundMessageInput = { connectionId: string; fromPhone: string } & (
  | { text: string; audioUrl?: undefined }
  | { audioUrl: string; text?: undefined }
);

/** `null` on any failure (download, unsupported format, empty result) — the
 * caller falls back to a fixed "didn't understand" reply instead of ever
 * calling the chat model with no real text. Z-API's audio webhook payload
 * shape (confirmed against a real event: `audio.audioUrl` pointing at a
 * Backblaze B2 temp URL, publicly fetchable, no auth needed) is as
 * documented. The custom `download` is required, not cosmetic: Z-API's
 * response Content-Type is `audio/ogg; codecs=opus` — Whisper's format
 * whitelist rejects that exact string (even though plain "ogg" is
 * supported), so the codec suffix has to be stripped before it reaches
 * the model. */
async function transcribeAudio(audioUrl: string): Promise<string | null> {
  try {
    const result = await transcribe({
      model: "openai/whisper-1",
      audio: new URL(audioUrl),
      download: async ({ url }) => {
        const response = await fetch(url);
        return { data: new Uint8Array(await response.arrayBuffer()), mediaType: "audio/ogg" };
      },
    });
    return result.text.trim() || null;
  } catch {
    return null;
  }
}

/** Text-to-speech for the reply, used only when the inbound message was
 * itself voice (mirrors the customer's own channel — see
 * handleInboundMessage). `null` on any failure, same degrade-to-text
 * convention as transcribeAudio; never blocks the reply. Goes through the
 * AI Gateway (OpenAI has no BYOK-vs-credits issue like Anthropic did —
 * works on the free tier, confirmed this session for other OpenAI
 * models). */
async function synthesizeSpeech(text: string): Promise<string | null> {
  try {
    const { audio } = await generateSpeech({ model: "openai/tts-1", text, voice: "alloy" });
    return `data:${audio.mediaType};base64,${audio.base64}`;
  } catch {
    return null;
  }
}

/** Google Maps Geocoding API — same provider the user's existing mobility
 * app (MAI Drive) already uses, so an address the bot confirms matches what
 * the app would find. Only wired in when GOOGLE_MAPS_API_KEY is set (see
 * buildTools); never throws, a miss/error just comes back as
 * `{ encontrado: false }` so the model can ask the customer to clarify. */
async function buscarEndereco(endereco: string): Promise<
  { encontrado: true; enderecoFormatado: string; lat: number; lng: number } | { encontrado: false }
> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return { encontrado: false };

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", endereco);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("region", "br");
    url.searchParams.set("language", "pt-BR");

    const response = await fetch(url);
    const data = await response.json();
    const first = data?.results?.[0];
    if (data?.status !== "OK" || !first) return { encontrado: false };

    return {
      encontrado: true,
      enderecoFormatado: first.formatted_address,
      lat: first.geometry?.location?.lat,
      lng: first.geometry?.location?.lng,
    };
  } catch {
    return { encontrado: false };
  }
}

/** Resolve o modelo configurado no Super Admin (string "provider/model" do
 * AI Gateway) pra uma chamada direta à Anthropic quando `ANTHROPIC_API_KEY`
 * está disponível — evita depender de crédito pago no AI Gateway da Vercel
 * quando já existe saldo direto na conta da Anthropic. Fora do caso
 * "anthropic/...", ou sem a chave, usa a string normalmente via Gateway.
 * Conversão de ID: a Anthropic usa hífen em vez de ponto na versão (ex:
 * "anthropic/claude-haiku-5.5" -> "claude-haiku-5-5"), confirmado contra
 * GET /v1/models da própria Anthropic. */
function resolveModel(modelString: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !modelString.startsWith("anthropic/")) return modelString;

  const anthropicModelId = modelString.slice("anthropic/".length).replaceAll(".", "-");
  return anthropic(anthropicModelId);
}

function buildTools() {
  const tools = {
    escalarParaHumano: tool({
      description:
        'Transfere a conversa para um atendente humano. Use quando o cliente pedir explicitamente, ou quando o pedido estiver fora do que você consegue resolver.',
      inputSchema: z.object({
        motivo: z.string().describe("Breve motivo da transferência."),
      }),
      execute: async () => ({ ok: true }),
    }),
  };

  if (!process.env.GOOGLE_MAPS_API_KEY) return tools;

  return {
    ...tools,
    buscarEndereco: tool({
      description:
        "Busca e valida um endereço (origem ou destino) informado pelo cliente, retornando o endereço formatado e a localização. Use antes de confirmar um pedido de corrida.",
      inputSchema: z.object({
        endereco: z.string().describe("Endereço completo ou parcial informado pelo cliente."),
      }),
      execute: async ({ endereco }) => buscarEndereco(endereco),
    }),
  };
}

/** Entry point called from the inbound webhook pipeline (see
 * maybeHandleInboundBotMessage in whatsapp-connection.service.ts). Never
 * throws — any failure here must not break the webhook's fast-ack
 * contract; callers already wrap this in a catch, but every exit path
 * here is itself defensive (missing config/credentials just means "don't
 * respond", not an error). */
export async function handleInboundMessage(input: HandleInboundMessageInput): Promise<void> {
  const { connectionId, fromPhone } = input;

  const config = await getBotConfig(connectionId);
  if (!config?.enabled) return;

  const credentials = await getConnectionCredentialsById(connectionId);
  if (!credentials?.apiUrl || !credentials.apiTokenCipher) return;

  const apiToken = decryptSecret(credentials.apiTokenCipher);
  const provider = getWhatsappProvider(credentials.provider.key);
  const providerConfig = { apiUrl: credentials.apiUrl, apiToken, phoneNumber: credentials.phoneNumber };

  const conversation = await getOrCreateActiveBotConversation(connectionId, fromPhone);
  if (conversation.status === "ESCALATED") return;

  const inboundWasAudio = "audioUrl" in input;
  const text = "text" in input ? input.text : await transcribeAudio(input.audioUrl);
  if (!text) {
    const fallback = "Não consegui entender o áudio, pode escrever a mensagem?";
    await provider.sendMessage(providerConfig, fromPhone, fallback);
    await createBotMessage(conversation.id, "OUT", fallback);
    await touchBotConversation(conversation.id);
    return;
  }

  await createBotMessage(conversation.id, "IN", text);

  const history = await listRecentBotMessages(conversation.id, HISTORY_LIMIT);
  const messages: ModelMessage[] = history.map((message) => ({
    role: message.direction === "IN" ? "user" : "assistant",
    content: message.body,
  }));

  const settings = await getAiAttendantSettings();

  const result = await generateText({
    model: resolveModel(settings.model),
    instructions: buildSystemPrompt(config.businessProfile),
    messages,
    tools: buildTools(),
    stopWhen: isStepCount(6),
  });

  const escalated = result.toolCalls.some((call) => call.toolName === "escalarParaHumano");
  const replyText =
    result.text.trim() ||
    (escalated
      ? "Só um momento, vou te transferir para um atendente humano."
      : "Desculpe, não entendi. Pode repetir?");

  const replyAudio = inboundWasAudio ? await synthesizeSpeech(replyText) : null;
  if (replyAudio) {
    await provider.sendAudio(providerConfig, fromPhone, replyAudio);
  } else {
    await provider.sendMessage(providerConfig, fromPhone, replyText);
  }

  await createBotMessage(conversation.id, "OUT", replyText);
  if (escalated) {
    await setBotConversationStatus(conversation.id, "ESCALATED");
  } else {
    await touchBotConversation(conversation.id);
  }
}
