import {
  generateSpeech,
  generateText,
  isStepCount,
  tool,
  transcribe,
  type LanguageModelUsage,
  type ModelMessage,
} from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { decryptSecret } from "@/lib/crypto/secret-box";
import { getWhatsappProvider } from "@/lib/whatsapp/registry";
import type { WhatsappProvider } from "@/lib/whatsapp/provider";
import type { WhatsappConnectionConfig } from "@/lib/whatsapp/types";
import { getConnectionCredentialsById } from "@/repositories/channel-connection.repository";
import { getAiAttendantSettings } from "@/repositories/ai-attendant-settings.repository";
import { createAiUsageLog } from "@/repositories/ai-usage.repository";
import { estimateChatCostUsd } from "@/lib/ai/gateway-pricing";
import { logBotEvent, serializeError } from "@/lib/logging/bot-attendant-logger";
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

/** How long the recipient sees "Digitando..."/"Gravando áudio..." before
 * the reply lands — a reply that appears the instant the webhook responds
 * reads as unmistakably robotic. Scaled to the reply's length (longer
 * reply, longer apparent "typing") and clamped to Z-API's own 1-15s range
 * for `delayTyping` (see z-api.provider.ts); floored at 2s since anything
 * shorter is imperceptible. */
function typingDelaySeconds(text: string): number {
  return Math.min(15, Math.max(2, Math.round(text.length / 12)));
}

/** Fallback usado só quando o `BotConfig` do tenant não tem nenhuma
 * `BotVertical` escolhida ainda (ex: configurado antes dessa coluna
 * existir) — o catálogo de verticais (mobilidade, delivery, ...), com o
 * "treino"/prompt real de cada nicho, é mantido pelo Super Admin em
 * /admin/whatsapp (ver bot-vertical.repository.ts) e sobrepõe isto. */
const BASE_SYSTEM_PROMPT = `Você trabalha numa central de mobilidade, atendendo pedidos de corrida pelo WhatsApp.
Fale como uma pessoa de verdade atendendo o telefone: frases curtas, diretas, em português natural. NUNCA liste opções em tópicos ou escreva como um menu ("Posso: - Isso - Aquilo") — isso soa a bot e é exatamente o que você precisa evitar. Converse de um jeito só, uma pergunta de cada vez.

Você ajuda o cliente a chamar uma corrida (pergunte de onde ele tá saindo e pra onde vai, se ainda não souber), saber como anda uma corrida que já chamou, ou cancelar uma. Se ele não disser logo o que quer, pergunta direto e simples — não explique tudo que você sabe fazer de uma vez.

Antes de confirmar um endereço, use a ferramenta "buscarEndereco" pra ter certeza que ele existe de verdade — sem anunciar que está "buscando", só confirme naturalmente (ex: "Beleza, Avenida Paulista, 1000 — é isso?"). Se não encontrar, peça pra detalhar ou repetir, sem assumir que está certo.

Se o cliente pedir pra falar com alguém de verdade, ou o pedido fugir do que você resolve, use "escalarParaHumano" em vez de tentar dar conta sozinho.`;

function buildSystemPrompt(verticalPrompt: string | null, businessProfile: string | null): string {
  const base = verticalPrompt?.trim() || BASE_SYSTEM_PROMPT;
  if (!businessProfile?.trim()) return base;
  return `${base}\n\nInformações desta empresa:\n${businessProfile.trim()}`;
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
 * models).
 *
 * `speed` below the 1.0 default (confirmed in Z-API's own docs: it just
 * wants `data:audio/mpeg;base64,...`, same mp3 we already send — not a
 * format/sample-rate mismatch) because the default read of our short,
 * punchy replies came across as rushed on a real WhatsApp voice note. */
async function synthesizeSpeech(text: string): Promise<string | null> {
  try {
    const { audio } = await generateSpeech({ model: "openai/tts-1", text, voice: "alloy", speed: 0.88 });
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

/** Never throws — feeds the Super Admin's "gasto de IA por conexão" screen
 * (/admin/whatsapp), but a failure here must not break the reply that
 * already went out to the customer. `model` is the Super Admin-configured
 * Gateway string (not the resolved Anthropic SDK model from resolveModel),
 * since that's what gateway-pricing.ts looks up prices by. */
async function recordChatUsage(
  connectionId: string,
  model: string,
  usage: LanguageModelUsage
): Promise<void> {
  try {
    const costUsd = await estimateChatCostUsd(model, usage.inputTokens, usage.outputTokens);
    await createAiUsageLog({
      connectionId,
      model,
      inputTokens: usage.inputTokens ?? null,
      outputTokens: usage.outputTokens ?? null,
      costUsd,
    });
  } catch (err) {
    // Não crítico pra resposta já enviada ao cliente — mas logado, porque
    // antes disso falhava em silêncio total (ver logs/bot-attendant.log).
    await logBotEvent("warn", "record_chat_usage_failed", { connectionId, model, error: serializeError(err) });
  }
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

/** Dispara quando a chamada ao modelo (ou o envio da resposta) falha — rate
 * limit, credencial inválida, Gateway fora do ar, etc. Antes disso essas
 * falhas não tinham NENHUM fallback: a exceção subia até o catch genérico
 * do `after()` em whatsapp-connection.service.ts, que só fazia
 * console.error — o cliente nunca recebia resposta nenhuma e nada ficava
 * registrado. Agora loga com contexto completo e ainda tenta mandar um
 * aviso pro cliente, pra "travar" virar "demorou/avisou" em vez de
 * silêncio puro. Todo o try/catch aqui dentro é defensivo — se até o envio
 * do fallback falhar, só loga de novo e desiste. */
async function handleReplyFailure(
  err: unknown,
  ctx: { connectionId: string; fromPhone: string; conversationId: string; model: string },
  provider: WhatsappProvider,
  providerConfig: WhatsappConnectionConfig
): Promise<void> {
  await logBotEvent("error", "generate_reply_failed", { ...ctx, error: serializeError(err) });

  const fallback = "Desculpe, tive um problema aqui pra responder. Pode repetir sua mensagem?";
  try {
    await provider.sendMessage(providerConfig, ctx.fromPhone, fallback, {
      delayTyping: typingDelaySeconds(fallback),
    });
    await createBotMessage(ctx.conversationId, "OUT", fallback);
    await touchBotConversation(ctx.conversationId);
  } catch (sendErr) {
    await logBotEvent("error", "generate_reply_failure_fallback_also_failed", {
      ...ctx,
      error: serializeError(sendErr),
    });
  }
}

/** Entry point called from the inbound webhook pipeline (see
 * maybeHandleInboundBotMessage in whatsapp-connection.service.ts). Never
 * throws — any failure here must not break the webhook's fast-ack
 * contract; callers already wrap this in a catch, but every exit path
 * here is itself defensive (missing config/credentials just means "don't
 * respond", not an error). Every step is logged to
 * logs/bot-attendant.log — a message that "arrives but the AI doesn't
 * reply" has no other trace to debug from otherwise. */
export async function handleInboundMessage(input: HandleInboundMessageInput): Promise<void> {
  const { connectionId, fromPhone } = input;
  await logBotEvent("info", "inbound_received", { connectionId, fromPhone, kind: "text" in input ? "text" : "audio" });

  const config = await getBotConfig(connectionId);
  if (!config?.enabled) {
    await logBotEvent("info", "skipped_bot_disabled", { connectionId, fromPhone });
    return;
  }

  const credentials = await getConnectionCredentialsById(connectionId);
  if (!credentials?.apiUrl || !credentials.apiTokenCipher) {
    await logBotEvent("warn", "skipped_missing_credentials", { connectionId, fromPhone });
    return;
  }

  const apiToken = decryptSecret(credentials.apiTokenCipher);
  const provider = getWhatsappProvider(credentials.provider.key);
  const providerConfig = { apiUrl: credentials.apiUrl, apiToken, phoneNumber: credentials.phoneNumber };

  // Always ACTIVE by the time it comes back — getOrCreateActiveBotConversation
  // reopens a previously ESCALATED thread too, since a new inbound message
  // here means the customer needs help again.
  const conversation = await getOrCreateActiveBotConversation(connectionId, fromPhone);
  if (conversation.reopened) {
    await logBotEvent("info", "conversation_reopened", { connectionId, fromPhone, conversationId: conversation.id });
  }

  const inboundWasAudio = "audioUrl" in input;
  const text = "text" in input ? input.text : await transcribeAudio(input.audioUrl);
  if (!text) {
    await logBotEvent("warn", "transcription_failed", { connectionId, fromPhone, conversationId: conversation.id });
    const fallback = "Não consegui entender o áudio, pode escrever a mensagem?";
    await provider.sendMessage(providerConfig, fromPhone, fallback, {
      delayTyping: typingDelaySeconds(fallback),
    });
    await createBotMessage(conversation.id, "OUT", fallback);
    await touchBotConversation(conversation.id);
    return;
  }

  await createBotMessage(conversation.id, "IN", text);

  const settings = await getAiAttendantSettings();

  const generated = await (async () => {
    try {
      const history = await listRecentBotMessages(conversation.id, HISTORY_LIMIT);
      // Thread reopened from CLOSED/ESCALATED: drop everything before the
      // reactivation (conversation.updatedAt just got bumped by that status
      // flip) so the model doesn't see the old "já passei pro atendente
      // humano" turn and re-escalate on the spot for an unrelated new message.
      const relevantHistory = conversation.reopened
        ? history.filter((message) => message.createdAt >= conversation.updatedAt)
        : history;
      const messages: ModelMessage[] = relevantHistory.map((message) => ({
        role: message.direction === "IN" ? "user" : "assistant",
        content: message.body,
      }));

      const result = await generateText({
        model: resolveModel(settings.model),
        instructions: buildSystemPrompt(config.vertical?.systemPrompt ?? null, config.businessProfile),
        messages,
        tools: buildTools(),
        stopWhen: isStepCount(6),
      });
      return { ok: true as const, result };
    } catch (err) {
      return { ok: false as const, err };
    }
  })();

  if (!generated.ok) {
    await handleReplyFailure(
      generated.err,
      { connectionId, fromPhone, conversationId: conversation.id, model: settings.model },
      provider,
      providerConfig
    );
    return;
  }
  const result = generated.result;

  await recordChatUsage(connectionId, settings.model, result.usage);

  const escalated = result.toolCalls.some((call) => call.toolName === "escalarParaHumano");
  const replyText =
    result.text.trim() ||
    (escalated
      ? "Só um momento, vou te transferir para um atendente humano."
      : "Desculpe, não entendi. Pode repetir?");

  await logBotEvent("info", "reply_generated", {
    connectionId,
    fromPhone,
    conversationId: conversation.id,
    escalated,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
  });

  try {
    const replyAudio = inboundWasAudio ? await synthesizeSpeech(replyText) : null;
    const delayTyping = typingDelaySeconds(replyText);
    if (replyAudio) {
      await provider.sendAudio(providerConfig, fromPhone, replyAudio, { delayTyping });
    } else {
      await provider.sendMessage(providerConfig, fromPhone, replyText, { delayTyping });
    }
  } catch (err) {
    await logBotEvent("error", "send_reply_failed", {
      connectionId,
      fromPhone,
      conversationId: conversation.id,
      error: serializeError(err),
    });
    // Mesmo sem conseguir entregar, guarda a resposta — o histórico fica
    // coerente pro próximo turno, mesmo que o cliente não tenha recebido.
  }

  await createBotMessage(conversation.id, "OUT", replyText);
  if (escalated) {
    await setBotConversationStatus(conversation.id, "ESCALATED");
  } else {
    await touchBotConversation(conversation.id);
  }
}
