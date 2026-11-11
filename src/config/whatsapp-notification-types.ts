import type { SegmentoNiche } from "@/generated/prisma/client";
import { resolveGreetingFirstName, type GreetingNameField } from "@/lib/notifications/greeting-name";
import { presentDetailValue } from "@/lib/notifications/detail-value";

/**
 * Catalog of WhatsApp notification types the purchase-confirmation API
 * supports — same philosophy as WHATSAPP_PRODUCTS and the provider
 * abstraction: a small, curated, code-owned list (never free text from the
 * caller) so message wording stays consistent, with adding a new niche's
 * notification type being a one-entry addition here, not a new endpoint.
 *
 * Each type owns its own message template and declares what it needs:
 * `requiresQr` gates whether `qrData` is mandatory in the request (tickets,
 * parking vouchers — anything meant to be scanned); `requiredDetailKeys`
 * gates which free-form `details` keys must be present (e.g. an
 * appointment needs a date/time that nothing else does).
 */

export interface NotificationDetails {
  [key: string]: string;
}

export interface BuildMessageInput {
  /** The recipient's own WhatsApp display name — best-effort, see
   * ZApiProvider.getContactName. Null when unavailable; templates must
   * greet generically in that case. */
  whatsappName: string | null;
  /** The name registered for this person in the caller's own system —
   * never the WhatsApp profile name (see whatsapp-connection.service.ts
   * for why both matter). */
  recipientName: string;
  /** Tenant's configured business name (Minha Empresa), falls back to the
   * tenant's regular name — resolved by the caller before invoking this. */
  businessName: string;
  details: NotificationDetails;
}

export interface NotificationTypeDef {
  key: string;
  label: string;
  /** Explicação curta do que a mensagem faz, em português simples — exibida
   * no painel de "Funções" (NotificationTypesPanel) pra ajudar o tenant a
   * decidir se marca esse tipo antes de precisar ler o código. */
  description: string;
  requiresQr: boolean;
  requiredDetailKeys: string[];
  /** Which WHATSAPP_SERVICES key gates this type (see whatsapp-services.ts)
   * — checked in sendPurchaseConfirmation before anything else. Lets a
   * notification type live on its own opt-in toggle instead of inheriting
   * purchase_confirmation's, for types that aren't actually about a
   * purchase (e.g. codigo_verificacao). */
  serviceKey: string;
  /** Which Segmento.niche(s) (config/segmento-niches.ts) this type is
   * specific to — `null` means cross-niche/generic, always shown regardless
   * of which nicho(s) a connection's Segmentos declare. Used only to filter
   * what NotificationTypesPanel shows per connection (getNotificationTypesForNiches
   * below); never enforced server-side — a tenant can still enable any type
   * on any connection, this is just a UI narrowing to cut noise. */
  niches: SegmentoNiche[] | null;
  buildMessage(input: BuildMessageInput): string;
}

// WhatsApp renders *text* as bold client-side — no special API support
// needed, just send the asterisks as part of the plain text.
function bold(text: string): string {
  return `*${text}*`;
}

/** Exportada pra ser reaproveitada ao montar mensagens de funções
 * personalizadas (ver sendPurchaseConfirmation em whatsapp-connection.service.ts)
 * — mesma saudação dos tipos fixos deste catálogo, pro tom ficar consistente. */
export function greet(whatsappName: string | null): string {
  return whatsappName ? `Olá, ${bold(whatsappName)}!` : "Olá!";
}

export type GreetingStyle = "FIXO" | "HORARIO";
export type GreetingNameSource = "PERFIL_WHATSAPP" | "CADASTRO";

/** Monta a saudação pra um envio — usada tanto pelos tipos fixos do
 * catálogo (ex: corrida_concluida) quanto pelo render de funções
 * personalizadas (ver sendPurchaseConfirmation em
 * whatsapp-connection.service.ts). A saudação usa só o primeiro nome,
 * capitalizado, nesta ordem (independente de `nameSource`, que continua
 * salvo no tipo por compatibilidade): 1) nome enviado pelo sistema
 * cliente (`recipientName` ou um campo como `nome_passageiro`); 2) nome
 * do perfil no WhatsApp, se houver; 3) sem nome válido, só "Olá!" /
 * "Bom dia!". `HORARIO` calcula o período em America/Sao_Paulo. */
export function buildGreeting(params: {
  style: GreetingStyle;
  nameSource: GreetingNameSource;
  whatsappName: string | null;
  recipientName: string;
  details?: Record<string, string>;
  fields?: GreetingNameField[];
  whatsappNameOnly?: boolean;
}): string {
  void params.nameSource;
  const name = resolveGreetingFirstName({
    recipientName: params.recipientName,
    whatsappName: params.whatsappName,
    details: params.details,
    fields: params.fields,
    whatsappNameOnly: params.whatsappNameOnly,
  });
  if (params.style === "FIXO") return name ? `Olá, ${bold(name)}!` : "Olá!";
  const hour = Number(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date())
  );
  const period = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  return name ? `${period}, ${bold(name)}!` : `${period}!`;
}

/** `isoDate` is UTC (ISO 8601, e.g. "2026-12-15T22:00:00.000Z") — converted
 * here to America/Sao_Paulo for display, since the caller (tipo7) sends it
 * raw in UTC and expects us to handle the timezone conversion. Returns
 * null for empty/invalid input so callers can skip the line entirely
 * instead of showing a broken date. */
function formatEventDateTime(isoDate: string | undefined): string | null {
  if (!isoDate?.trim()) return null;
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return null;
  const datePart = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
  const timePart = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${datePart} às ${timePart}`;
}

/** `local`/`cidade`/`estado` are all optional (tipo7's contract: may come
 * as "") — combines whichever are present into one line, or null if none
 * are. */
function formatLocation(details: NotificationDetails): string | null {
  const parts: string[] = [];
  if (details.local?.trim()) parts.push(details.local.trim());
  const cityState = [details.cidade?.trim(), details.estado?.trim()].filter(Boolean).join("/");
  if (cityState) parts.push(cityState);
  return parts.length > 0 ? parts.join(" - ") : null;
}

export const DEFAULT_NOTIFICATION_TYPE = "compra_confirmada";

export const NOTIFICATION_TYPES: NotificationTypeDef[] = [
  {
    key: "compra_confirmada",
    label: "Compra confirmada",
    description: "Confirma que uma compra foi aprovada — mensagem simples, sem QR code nem detalhes extras.",
    requiresQr: false,
    requiredDetailKeys: [],
    serviceKey: "purchase_confirmation",
    niches: null,
    buildMessage: ({ whatsappName, recipientName, businessName }) =>
      `${greet(whatsappName)} O pedido comprado em ${businessName}, por ${bold(recipientName)}, foi aprovado com sucesso.`,
  },
  {
    key: "ingresso_emitido",
    label: "Ingresso emitido",
    description: "Manda o ingresso com QR code quando a compra é aprovada, com evento, tipo do ingresso, data e local.",
    requiresQr: true,
    // Contrato definido pelo lado da Tipo7 (em produção desde 08/08/2026):
    // `nome_evento` e `ingresso` (tipo do ingresso — Pista/VIP/etc, sempre
    // singular já que cada chamada é 1 ingresso só) sempre vêm
    // preenchidos; `data` (ISO 8601 UTC), `local`, `cidade`, `estado`
    // podem vir "" — tratados como opcionais na mensagem (a linha
    // correspondente some quando vêm vazios, ver formatEventDateTime /
    // formatLocation).
    requiredDetailKeys: ["nome_evento", "ingresso"],
    serviceKey: "purchase_confirmation",
    niches: ["EVENTOS_INGRESSOS"],
    buildMessage: ({ whatsappName, recipientName, businessName, details }) => {
      const lines = [
        greet(whatsappName),
        "",
        `Seu ingresso ${bold(details.ingresso)} para ${bold(details.nome_evento)} em ${businessName} foi aprovado com sucesso.`,
      ];
      const when = formatEventDateTime(details.data);
      if (when) lines.push(`📅 ${when}`);
      const where = formatLocation(details);
      if (where) lines.push(`📍 ${where}`);
      lines.push("", `Comprado por: ${bold(recipientName)}`);
      return lines.join("\n");
    },
  },
  {
    key: "estacionamento_emitido",
    label: "Comprovante de estacionamento emitido",
    description: "Manda o comprovante de estacionamento com QR code, dados do veículo e data/horário.",
    requiresQr: true,
    // `local`: nome/endereço do estacionamento. `placa`/`cor`/`modelo`: do
    // veículo. `data`/`horario`: mesmos nomes de ingresso_emitido e
    // agendamento_confirmado, por consistência. Serve os 3 momentos de
    // venda (junto com o ingresso, depois pelo site, ou avulso na hora do
    // portão) — mesma estrutura de dados nos três, só muda quem dispara.
    requiredDetailKeys: ["local", "placa", "cor", "modelo", "data", "horario"],
    serviceKey: "purchase_confirmation",
    niches: ["ESTACIONAMENTO"],
    buildMessage: ({ whatsappName, recipientName, details }) =>
      `${greet(whatsappName)}\n\nSeu comprovante de estacionamento em ${bold(details.local)} foi aprovado com sucesso.\n\n🚗 ${details.modelo} - ${details.cor} - Placa ${details.placa}\n📅 ${details.data} às ${details.horario}\n\nComprado por: ${bold(recipientName)}`,
  },
  {
    key: "estacionamento_liberado",
    label: "Entrada no estacionamento liberada (ticket de saída)",
    description: "Avisa que o carro entrou no estacionamento e manda um QR code novo — é o que libera a saída depois.",
    requiresQr: true,
    // Disparado no momento em que o carro efetivamente entra — seja depois
    // de validar um estacionamento_emitido comprado antes, seja por
    // pagamento na hora do portão. O qrData aqui é um código NOVO,
    // diferente do da compra: é o que libera a SAÍDA do veículo depois,
    // não a entrada.
    requiredDetailKeys: ["local", "placa", "cor", "modelo", "horario"],
    serviceKey: "purchase_confirmation",
    niches: ["ESTACIONAMENTO"],
    buildMessage: ({ whatsappName, details }) =>
      `${greet(whatsappName)}\n\nSeu veículo ${bold(`${details.modelo} - ${details.cor} - Placa ${details.placa}`)} entrou no estacionamento ${bold(details.local)} às ${details.horario}.\n\nGuarde este QR code — você vai precisar apresentá-lo na saída para liberar o veículo.`,
  },
  {
    key: "lista_espera",
    label: "Entrada na lista de espera",
    description: "Avisa que a pessoa entrou na lista de espera e que você chama assim que abrir vaga.",
    requiresQr: false,
    requiredDetailKeys: [],
    serviceKey: "purchase_confirmation",
    niches: null,
    buildMessage: ({ whatsappName, businessName }) =>
      `${greet(whatsappName)} Você entrou na lista de espera em ${businessName}. Assim que houver uma vaga, avisamos por aqui.`,
  },
  {
    key: "agendamento_confirmado",
    label: "Agendamento confirmado",
    description: "Confirma um agendamento, com a data e o horário marcados.",
    requiresQr: false,
    requiredDetailKeys: ["data", "horario"],
    serviceKey: "purchase_confirmation",
    niches: null,
    buildMessage: ({ whatsappName, businessName, details }) =>
      `${greet(whatsappName)} Seu agendamento em ${businessName} foi confirmado para ${details.data} às ${details.horario}.`,
  },
  {
    key: "notificacao",
    label: "Notificação genérica (qualquer confirmação de ação)",
    description:
      "Pra confirmações que não têm um tipo próprio (saldo debitado, cadastro concluído, etc.) — você manda a frase pronta e a gente só embrulha com saudação e nome do negócio.",
    // The catch-all entry point for niches we haven't (and may never)
    // special-case: saldo debitado, cadastro concluído, movimentação
    // registrada, agendamento marcado, etc. Instead of one curated type per
    // niche — which would mean coming back here for every new business
    // vertical — the caller supplies the human-readable sentence itself in
    // `details.evento`; we only wrap it with the greeting and business
    // signature so it still reads consistently across tenants. Anything
    // that needs more than a sentence (a QR code, specific required
    // fields the message logic depends on) still gets its own curated
    // type instead — this one is for "something happened, say so", not
    // for special behavior.
    requiresQr: false,
    requiredDetailKeys: ["evento"],
    serviceKey: "purchase_confirmation",
    niches: null,
    buildMessage: ({ whatsappName, businessName, details }) =>
      [greet(whatsappName), "", details.evento, "", businessName].join("\n"),
  },
  {
    key: "apk_disponivel",
    label: "Link de APK disponível",
    description: "Manda o link de download de uma nova versão do app (ex: app do motorista).",
    requiresQr: false,
    // Primeiro tipo pensado pra um caller fora do contexto de compra/ingresso
    // (MAI Drive — mobility-app, 28/08/2026): manda o link de download de um
    // APK (app do motorista). `versao` é opcional — some da mensagem se não
    // vier, mesmo tratamento de opcional que formatEventDateTime/formatLocation.
    // Não usa `businessName` de propósito: o contexto aqui é "novo app
    // disponível", não uma compra feita numa empresa.
    requiredDetailKeys: ["link"],
    serviceKey: "purchase_confirmation",
    niches: ["MOBILIDADE_CORRIDAS"],
    buildMessage: ({ whatsappName, details }) => {
      const lines = [greet(whatsappName), "", "Uma nova versão do app está disponível para download:"];
      if (details.versao?.trim()) lines.push(`Versão: ${bold(details.versao.trim())}`);
      lines.push(details.link);
      return lines.join("\n");
    },
  },
  {
    key: "corrida_concluida",
    label: "Corrida concluída (resumo pro passageiro)",
    description: "Manda um resumo da corrida (distância e valor total, mais horário, tarifa, motorista e forma de pagamento quando vierem) quando ela termina.",
    requiresQr: false,
    // Disparado pelo app de corridas (MAI Drive) ao finalizar a viagem —
    // mesmo número do passageiro já capturado no início da corrida.
    // Só `distancia` e `valor_total` são obrigatórios (compatível com o
    // payload original do MAI Drive). Todo o resto é opcional e a linha
    // some quando o campo não vier ou vier vazio: inicio, fim, duracao,
    // origem, destino, tarifa, hora_parada, valor_corrida, taxa_pagamento,
    // motorista, horario, forma_pagamento, link_tarifas.
    requiredDetailKeys: ["distancia", "valor_total"],
    serviceKey: "purchase_confirmation",
    niches: ["MOBILIDADE_CORRIDAS"],
    buildMessage: ({ whatsappName, recipientName, businessName, details }) => {
      // "não informado", "N/A", "-" e vazio contam como ausentes (linha some).
      const opt = (key: string) => presentDetailValue(details[key]);
      const lines = [
        buildGreeting({ style: "HORARIO", nameSource: "CADASTRO", whatsappName, recipientName }),
        "",
        `Sua corrida com a ${bold(businessName)} foi concluída! Agradecemos por ter escolhido a nossa empresa.`,
        "",
      ];
      const push = (label: string, key: string) => {
        const value = opt(key);
        if (value) lines.push(`${label}: ${value}`);
      };
      push("🕒 Horário", "horario");
      push("Início", "inicio");
      push("Fim", "fim");
      push("Duração", "duracao");
      lines.push(`📍 Distância percorrida: ${details.distancia.trim()}`);
      push("Origem", "origem");
      push("Destino", "destino");
      push("💲 Tarifa aplicada", "tarifa");
      push("🔗 Entenda nossas tarifas", "link_tarifas");
      push("Hora parada", "hora_parada");
      push("🚗 Motorista", "motorista");
      push("Valor da corrida", "valor_corrida");
      push("Taxa da forma de pagamento", "taxa_pagamento");
      const pagamento = opt("forma_pagamento");
      lines.push(
        "",
        `💰 Valor total: ${bold(details.valor_total.trim())}${pagamento ? ` (${pagamento})` : ""}`
      );
      return lines.join("\n");
    },
  },
  {
    key: "codigo_verificacao",
    label: "Código de verificação (2FA)",
    description: "Manda um código de acesso temporário — segundo fator de login num painel ou terminal.",
    // Segundo fator de acesso a um painel/menu administrativo (ex: terminal
    // físico Tipo7 GPOS780) — não é uma confirmação de compra, por isso vive
    // no próprio serviço "verification_code" em vez de herdar
    // purchase_confirmation (ver whatsapp-services.ts).
    requiresQr: false,
    requiredDetailKeys: ["codigo"],
    serviceKey: "verification_code",
    niches: ["GENERICO_2FA"],
    buildMessage: ({ details }) =>
      `Seu código de acesso ao terminal Tipo7 é ${bold(details.codigo)}. Válido por 5 minutos, não compartilhe com ninguém.`,
  },
];

/** Used to validate the list a tenant sends when toggling which types a
 * connection can disparar — see updateConnectionEnabledNotificationTypes in
 * whatsapp-connection.service.ts. */
export function isValidNotificationTypeKey(key: string): boolean {
  return NOTIFICATION_TYPES.some((t) => t.key === key);
}

/** Narrows the catalog to what's relevant for a connection, based on the
 * niche(s) declared by its Segmentos (repositories/segmento.repository.ts).
 * `connectionNiches` empty (connection has no Segmento yet) returns the
 * full catalog unfiltered — a connection nobody has tagged with a niche
 * shouldn't have functionality hidden from it. Generic types (`niches:
 * null`) always pass through regardless. Pure UI narrowing (see the note on
 * NotificationTypeDef.niches) — never used for the actual send-time check. */
export function getNotificationTypesForNiches(
  connectionNiches: SegmentoNiche[]
): NotificationTypeDef[] {
  if (connectionNiches.length === 0) return NOTIFICATION_TYPES;
  const nicheSet = new Set(connectionNiches);
  return NOTIFICATION_TYPES.filter(
    (type) => type.niches === null || type.niches.some((n) => nicheSet.has(n))
  );
}
