import {
  dynamicTool,
  generateSpeech,
  generateText,
  isStepCount,
  jsonSchema,
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
  getEnabledBusinessIntegration,
  type BusinessIntegrationCredentials,
} from "@/repositories/business-integration.repository";
import { getCachedOrFreshCatalog, type CatalogEntry } from "@/lib/business-integration/mai-drive-client";
import {
  getBotConfig,
  getOrCreateActiveBotConversation,
  escalateBotConversation,
  closeBotConversation,
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
 * /admin/whatsapp (ver bot-vertical.repository.ts) e sobrepõe isto.
 *
 * Estruturado em passos (identidade → classificar intenção → roteiro de
 * corrida) em vez de um parágrafo só — confirmado em pesquisa (framework
 * "Conversation Routines" pra diálogo orientado a tarefas) que listar os
 * passos em ordem reduz a chance do modelo pular etapa ou ficar confuso
 * sobre o que já foi dito. Corrida é o único fluxo resolvido sozinho por
 * enquanto — qualquer outra intenção (motorista, entrega, abrir uma
 * central própria) só qualifica o mínimo e escala, não tenta resolver. */
const BASE_SYSTEM_PROMPT = `IDENTIDADE
Você é a atendente virtual de uma central de mobilidade, atendendo pelo WhatsApp. Fale como uma pessoa de verdade atendendo o telefone: frases curtas, diretas, em português natural, uma pergunta de cada vez. NUNCA liste opções em tópicos ou escreva como um menu ("Posso: - Isso - Aquilo") — isso soa a bot e é exatamente o que você precisa evitar.

IDENTIFICANDO O QUE O CLIENTE QUER
Existem três assuntos possíveis. Identifique qual é antes de agir — se o cliente já disse, não pergunte de novo, só confirme o que ainda falta. Se a mensagem for ambígua e não continuar claramente o assunto que já estava em andamento nesta conversa, NUNCA assuma que é o mesmo de antes — pergunte "Em que posso te ajudar?" e deixe o cliente dizer:

1. CORRIDA (chamar uma agora ou agendada, saber status, cancelar, ou só saber se atende numa cidade/quanto custa): siga o "ROTEIRO DE CORRIDA" abaixo.
2. ÁREA DE ATENDIMENTO (só quer saber se atende numa cidade ou região, sem pedir corrida): use "consultar_disponibilidade" (cidade específica) ou "listar_cidades" (pergunta genérica, sem citar cidade). Na resposta diga só "sim, atendemos aqui" ou "não atendemos" — NUNCA a quantidade de motoristas, categorias ou qualquer outro dado técnico dessa ferramenta, isso não foi perguntado. Se "listar_cidades" trouxer várias cidades do mesmo estado, agrupe por estado e diga o nome completo do estado (nunca a sigla) uma única vez no final de cada grupo — ex.: "Coronel Vivida, Cruzeiro do Iguaçu, Dois Vizinhos, Francisco Beltrão, Itapejara d'Oeste, Pato Branco, São Jorge d'Oeste e Verê, no Paraná; e Juiz de Fora, em Minas Gerais" — nunca repita o nome do estado ou a sigla depois de cada cidade individualmente. Depois, pergunte "em que posso te ajudar?".
3. CADASTRO (quer ser motorista, ou quer abrir uma central própria): pergunte nome e, se ele disser, cidade e veículo próprio (motorista) ou cidade (central) — depois use "quero_ser_motorista" ou "quero_abrir_central".

Qualquer outra coisa, ou se alguma ferramenta acima não existir nesta conversa (integração não configurada): use "escalarParaHumano" descrevendo o que o cliente quer no "resumoPedido".

ROTEIRO DE CORRIDA
1. Descubra a cidade de origem, se ela ainda não tiver sido confirmada nesta conversa — use "consultar_disponibilidade" (sem citar quantidade de motoristas ou categorias na resposta). O que decide se dá pra atender é a cidade de ORIGEM (de onde o cliente vai sair), não a de destino — se a cidade citada não for atendida e não estiver claro se é de onde ele sai ou pra onde ele quer ir, pergunte isso direto ("Você vai saindo de lá ou quer ir pra lá?") antes de dizer que não atende; pode ser que a origem seja atendida mesmo que o destino citado não seja.
2. Descubra se é pra agora ou se o cliente quer agendar pra outro dia/horário, se ainda não souber — guarde essa informação pra incluir no resumo do pedido mais tarde.
3. Descubra a origem (endereço completo de onde o cliente está saindo), se ainda não souber.
4. Descubra o destino (endereço completo de pra onde ele vai), se ainda não souber.
5. Antes de confirmar qualquer um dos dois endereços, use a ferramenta "buscarEndereco" pra ter certeza que existe de verdade — sem anunciar que está "buscando", só confirme naturalmente (ex: "Beleza, Avenida Paulista, 1000 — é isso?"). Se não encontrar, peça pra detalhar ou repetir, sem assumir que está certo.
6. Se o cliente perguntar o preço antes de confirmar, use "cotar_corrida" com os dois endereços — a "categoria" é o nome que veio de "consultar_disponibilidade" (campo "nome" de cada item em "categorias"), nunca um valor inventado.
7. Com tudo confirmado (origem, destino, e se é agora ou agendado), resuma o pedido (e o valor, se já tiver cotado) e peça a confirmação final do cliente antes de seguir.
8. Confirmado, use "escalarParaHumano" com origem, destino e horário desejado (se agendado) no "resumoPedido" — pedir a corrida de verdade ainda não é automático, precisa de um atendente despachando.

Pra acompanhar uma corrida já chamada, use "status_corrida" (precisa do código da corrida; se o cliente não souber, use "escalarParaHumano"). Pra cancelar uma corrida já chamada, use "cancelar_corrida" (mesmo código da corrida).`;

/** `customerName` vem do `chatName` do webhook da Z-API (ver
 * maybeHandleInboundBotMessage) — confirmado contra dados reais que
 * `senderName` vem errado (devolve o nome da própria conta conectada, não
 * do cliente), então só `chatName` é confiável aqui. `pendingRequestSummary`
 * só é passado quando a conversa acabou de reabrir de ESCALATED — a
 * solicitação anterior pode genuinamente ainda estar em aberto, então o
 * modelo é instruído a perguntar em vez de assumir (ver
 * handleInboundMessage e o bug confirmado em produção: reescalava uma
 * mensagem nova só porque a escalação antiga ainda estava no contexto). */
function buildSystemPrompt(
  verticalPrompt: string | null,
  businessProfile: string | null,
  customerName: string | null,
  pendingRequestSummary?: string | null
): string {
  const base = verticalPrompt?.trim() || BASE_SYSTEM_PROMPT;

  const contextLines = [
    `Agora é hora de dizer "${currentGreetingWord()}" quando cumprimentar — não use outro período do dia.`,
  ];
  if (customerName) {
    contextLines.push(
      `O cliente se chama ${customerName} (nome do WhatsApp dele) — use isso naturalmente de vez em quando, sem repetir em toda mensagem.`
    );
  }
  const withContext = `${contextLines.join(" ")}\n\n${base}`;

  const withProfile = businessProfile?.trim()
    ? `${withContext}\n\nInformações desta empresa:\n${businessProfile.trim()}`
    : withContext;
  if (!pendingRequestSummary) return withProfile;
  return `${withProfile}\n\nEsse cliente tinha uma solicitação em aberto, já passada pra um atendente humano: "${pendingRequestSummary}". Antes de atender o que ele disser agora, pergunte se essa solicitação já foi atendida. Se ele confirmar que sim, use a ferramenta "encerrarPedido" e siga normalmente. Se ainda não foi atendida, ou se ele trouxer um assunto totalmente novo, atenda o que ele pedir sem insistir no ponto.`;
}

/** Antes disso a IA só sabia dizer "bom dia"/"boa tarde"/"boa noite" se o
 * cliente tivesse dito primeiro (ela só ecoava) — nenhum dado real de hora
 * chegava no prompt. Fuso de Dois Vizinhos/PR é o mesmo de Brasília
 * (America/Sao_Paulo), sem horário de verão desde 2019. */
function currentGreetingWord(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      hour: "numeric",
      hour12: false,
    }).format(new Date())
  );
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

export type HandleInboundMessageInput = { connectionId: string; fromPhone: string; customerName: string | null } & (
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

/** UF → nome completo do estado — usado só pra falar em voz alta (ver
 * expandStateAbbreviationsForSpeech). O texto exibido/salvo continua com a
 * sigla; só a versão que vai pro TTS é expandida. */
const BRAZILIAN_STATE_NAMES: Record<string, string> = {
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapá",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Pará",
  PB: "Paraíba",
  PR: "Paraná",
  PE: "Pernambuco",
  PI: "Piauí",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondônia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "São Paulo",
  SE: "Sergipe",
  TO: "Tocantins",
};

/** Sigla de UF (ex.: "Dois Vizinhos (PR)", mas o modelo varia o formato —
 * às vezes em parênteses, às vezes só "PR" depois de uma vírgula) fica
 * natural escrita, mas o TTS lê letra por letra ("pê, érre") em vez de
 * falar o nome do estado — confirmado ao ouvir a resposta de voz da
 * central citando cidades. Casa a sigla isolada (word boundary, não
 * exige parênteses) pra pegar qualquer formatação; troca só pro texto que
 * vai pro TTS, o texto exibido/salvo no histórico continua com a sigla. */
function expandStateAbbreviationsForSpeech(text: string): string {
  return text.replace(/\b([A-Z]{2})\b/g, (match, uf: string) => BRAZILIAN_STATE_NAMES[uf] ?? match);
}

/** Text-to-speech for the reply, used only when the inbound message was
 * itself voice (mirrors the customer's own channel — see
 * handleInboundMessage). `null` on any failure, same degrade-to-text
 * convention as transcribeAudio; never blocks the reply. Goes through the
 * AI Gateway.
 *
 * Switched from openai/tts-1 ("alloy") to microsoft/mai-voice-2-flash with
 * the native "pt-BR-Luana" voice — alloy is tuned for English and read as
 * noticeably unnatural in Portuguese, which was almost certainly the real
 * "estranho" complaint, more than pacing. `providerOptions.microsoft` (not
 * `.azure` — confirmed by hitting "invalid azure provider options" until
 * keying it by the Gateway's own provider name instead) carries the
 * style/speed knobs this model actually accepts; `style: "chat"` is
 * Azure's conversational delivery, the closest match to "fale como uma
 * pessoa de verdade atendendo o telefone" already in the base prompt.
 * `outputFormat: "mp3"` keeps the exact same `audio/mpeg` data URI Z-API's
 * docs expect — confirmed this model still returns that, unlike Google's
 * Gemini TTS options which only offer wav/pcm/mulaw/alaw. */
async function synthesizeSpeech(text: string): Promise<string | null> {
  try {
    const { audio } = await generateSpeech({
      model: "microsoft/mai-voice-2-flash",
      text: expandStateAbbreviationsForSpeech(text),
      voice: "pt-BR-Luana",
      outputFormat: "mp3",
      providerOptions: { microsoft: { style: "chat", speed: 0.92 } },
    });
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

/** Substitui `{chave}` no template de rota (ex: `/corridas/{id}/cancelar`)
 * pelo valor correspondente em `input`, e marca cada chave usada em
 * `consumed` — o que resta em `input` depois disso vai pra query string
 * (GET) ou corpo (POST), não pra rota. */
function substitutePathParams(pathTemplate: string, input: Record<string, unknown>, consumed: Set<string>): string {
  return pathTemplate.replace(/\{(\w+)\}/g, (_match, key: string) => {
    consumed.add(key);
    return encodeURIComponent(String(input[key] ?? ""));
  });
}

/** Transforma UMA função do catálogo do MAI Drive (ver mai-drive-client.ts)
 * numa tool de verdade que a IA pode chamar. Duas decisões de segurança,
 * não cosméticas:
 *
 * 1. `telefone` nunca é exposto como parâmetro pro modelo preencher — é
 *    sempre o número de quem está conversando (`fromPhone`, resolvido no
 *    servidor), nunca um valor que a IA inventa ou repete de volta. Essa é
 *    uma regra explícita do contrato combinado com o MAI Drive (ver
 *    docs/BRIEFING-INTEGRACAO-MAIDRIVE.md, seção 3: "o telefone vem do
 *    servidor do MAIS ZAP... nunca de um campo preenchido pela IA"). Por
 *    isso `telefone` é removido de `properties`/`required` no schema que a
 *    IA vê, e só é reinjetado na hora de montar a chamada real — e só
 *    quando a função já esperava esse campo (pra não violar
 *    `additionalProperties: false` em funções que nunca tinham `telefone`,
 *    como `cotar_corrida`).
 * 2. Qualquer resposta (sucesso ou `{ok: false, erro: {...}}`) é devolvida
 *    pra IA como está — ela decide como explicar pro cliente. Falha de
 *    rede/parse vira um erro sintético `ERRO_DE_COMUNICACAO` em vez de
 *    lançar, mesma convenção defensiva do resto deste arquivo. */
function buildRemoteTool(
  entry: CatalogEntry,
  credentials: BusinessIntegrationCredentials,
  context: { fromPhone: string }
) {
  const rawSchema = (entry.parametros ?? { type: "object", properties: {} }) as Record<string, unknown>;
  const rawProperties = (rawSchema.properties ?? {}) as Record<string, unknown>;
  const expectsTelefone = "telefone" in rawProperties;

  const properties = { ...rawProperties };
  delete properties.telefone;
  const required = Array.isArray(rawSchema.required)
    ? (rawSchema.required as string[]).filter((key) => key !== "telefone")
    : undefined;

  const aiSchema = { ...rawSchema, properties, required };

  // `dynamicTool`, não `tool`: o input desta função só é conhecido em
  // tempo de execução (vem do catálogo do MAI Drive, não de um schema Zod
  // fixo no código) — exatamente o caso que `dynamicTool` existe pra
  // cobrir, evitando a inferência de tipo que `tool()` espera de um
  // schema estático.
  return dynamicTool({
    description: entry.descricao ?? entry.nome,
    inputSchema: jsonSchema(aiSchema as Parameters<typeof jsonSchema>[0]),
    execute: async (rawInput) => {
      const input = (rawInput ?? {}) as Record<string, unknown>;
      const consumed = new Set<string>();
      const path = substitutePathParams(entry.path ?? "", input, consumed);
      const remaining: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(input)) {
        if (!consumed.has(key)) remaining[key] = value;
      }
      if (expectsTelefone) remaining.telefone = context.fromPhone;

      const url = new URL(`${credentials.baseUrl}${path}`);
      const init: RequestInit = { headers: { "x-api-key": credentials.apiKey } };

      if (entry.method === "POST") {
        init.method = "POST";
        init.headers = { ...init.headers, "Content-Type": "application/json" };
        init.body = JSON.stringify(remaining);
      } else {
        for (const [key, value] of Object.entries(remaining)) {
          if (value != null) url.searchParams.set(key, String(value));
        }
      }

      await logBotEvent("info", "mai_drive_request", {
        connectionId: credentials.id,
        function: entry.nome,
        method: init.method ?? "GET",
        url: url.toString(),
        body: entry.method === "POST" ? remaining : undefined,
      });

      try {
        const response = await fetch(url, init);
        const body = await response.json();

        await logBotEvent("info", "mai_drive_response", {
          connectionId: credentials.id,
          function: entry.nome,
          status: response.status,
          body,
        });

        return body;
      } catch (err) {
        await logBotEvent("error", "mai_drive_request_failed", {
          connectionId: credentials.id,
          function: entry.nome,
          error: serializeError(err),
        });
        return { ok: false, erro: { codigo: "ERRO_DE_COMUNICACAO" } };
      }
    },
  });
}

/** Busca o catálogo cacheado (ver getCachedOrFreshCatalog) e monta uma tool
 * por função ativa — `[]`/`{}` sem integração habilitada ou sem catálogo,
 * nunca lança. Chamado a cada turno (o catálogo já tem seu próprio cache
 * de 10min, não precisa de outro aqui). */
async function buildDynamicTools(connectionId: string, fromPhone: string) {
  const credentials = await getEnabledBusinessIntegration(connectionId);
  if (!credentials) return {};

  const catalog = await getCachedOrFreshCatalog(connectionId);
  const tools: Record<string, ReturnType<typeof buildRemoteTool>> = {};
  for (const entry of catalog) {
    if (!entry.path) continue;
    tools[entry.nome] = buildRemoteTool(entry, credentials, { fromPhone });
  }
  return tools;
}

async function buildTools(connectionId: string, fromPhone: string) {
  const tools = {
    escalarParaHumano: tool({
      description:
        'Transfere a conversa para um atendente humano. Use quando o cliente pedir explicitamente, ou quando o pedido estiver fora do que você consegue resolver.',
      inputSchema: z.object({
        motivo: z.string().describe("Breve motivo da transferência."),
        resumoPedido: z
          .string()
          .describe(
            'Resumo curto do pedido em aberto (tipo de pedido + origem/destino, se já souber) — ex: "Corrida de Rua X, 580 para Rua Y, 179". Usado pra retomar o assunto se o cliente escrever de novo depois.'
          ),
      }),
      execute: async () => ({ ok: true }),
    }),
    encerrarPedido: tool({
      description:
        'Encerra a solicitação em aberto que já tinha sido passada pra um atendente humano. Use só depois que o cliente confirmar explicitamente que ela já foi atendida/resolvida.',
      inputSchema: z.object({}),
      execute: async () => ({ ok: true }),
    }),
  };

  const withMaps = process.env.GOOGLE_MAPS_API_KEY
    ? {
        ...tools,
        buscarEndereco: tool({
          description:
            "Busca e valida um endereço (origem ou destino) informado pelo cliente, retornando o endereço formatado e a localização. Use antes de confirmar um pedido de corrida.",
          inputSchema: z.object({
            endereco: z.string().describe("Endereço completo ou parcial informado pelo cliente."),
          }),
          execute: async ({ endereco }) => buscarEndereco(endereco),
        }),
      }
    : tools;

  return { ...withMaps, ...(await buildDynamicTools(connectionId, fromPhone)) };
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
  const { connectionId, fromPhone, customerName } = input;
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
  if (conversation.reopenedFrom) {
    await logBotEvent("info", "conversation_reopened", {
      connectionId,
      fromPhone,
      conversationId: conversation.id,
      reopenedFrom: conversation.reopenedFrom,
    });
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
      // Filtra por `contextStartAt` em TODO turno, não só no da reabertura —
      // confirmado em produção que um filtro de turno único (baseado em
      // reopenedFrom) deixava o turno seguinte voltar a arrastar um pedido
      // já encerrado, porque listRecentBotMessages por si só não sabe de
      // nenhum "corte". `contextStartAt` é um campo persistido (ver
      // getOrCreateActiveBotConversation/closeBotConversation) que avança
      // sempre que a conversa reabre ou um pedido é encerrado.
      const relevantHistory = history.filter((message) => message.createdAt >= conversation.contextStartAt);
      const messages: ModelMessage[] = relevantHistory.map((message) => ({
        role: message.direction === "IN" ? "user" : "assistant",
        content: message.body,
      }));

      // Só pede confirmação de "isso já foi atendido?" quando reabriu de um
      // ESCALATED com um resumo guardado — reabrir de CLOSED já é um
      // recomeço de verdade (ninguém deixou nada pendente).
      const pendingRequestSummary =
        conversation.reopenedFrom === "ESCALATED" ? conversation.pendingRequestSummary : null;

      const result = await generateText({
        model: resolveModel(settings.model),
        instructions: buildSystemPrompt(
          config.vertical?.systemPrompt ?? null,
          config.businessProfile,
          customerName,
          pendingRequestSummary
        ),
        messages,
        tools: await buildTools(connectionId, fromPhone),
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

  const escalatedCall = result.toolCalls.find((call) => call.toolName === "escalarParaHumano");
  const closedCall = result.toolCalls.find((call) => call.toolName === "encerrarPedido");
  const escalated = !!escalatedCall;
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
  if (escalatedCall) {
    const resumoPedido = (escalatedCall.input as { resumoPedido?: string }).resumoPedido ?? null;
    await escalateBotConversation(conversation.id, resumoPedido);
  } else if (closedCall) {
    await closeBotConversation(conversation.id);
    await logBotEvent("info", "pending_request_closed", { connectionId, fromPhone, conversationId: conversation.id });
  } else {
    await touchBotConversation(conversation.id);
  }
}
