/**
 * Testes das Publicidades — seleção, rodízio, limite de frequência,
 * bloqueios e "falha da publicidade não afeta o recibo". Sem banco (todas
 * as dependências são falsas) e sem rede (provedor falso).
 * Rode com: node --env-file=.env scripts/run-ts.mjs scripts/check-advertisements.ts
 */
import {
  computeDeleteAt,
  isMissingTableError,
  ADVERTISEMENT_BUTTONS_ENABLED,
  planAdvertisementMessage,
  selectAdvertisement,
  validateAdvertisementInput,
  type AdvertisementRuleInput,
} from "../src/lib/advertisements/advertisement-rules";
import { buildZApiRequest } from "../src/lib/notifications/message-blocks";
import {
  dispatchAdvertisementAfterNotification,
  phoneVariants,
  scheduleAdvertisementTask,
  type AdvertisementDispatchDeps,
} from "../src/services/advertisement-dispatch.service";
import type { WhatsappProvider } from "../src/lib/whatsapp/provider";
import type { LinkButtonAction, WhatsappConnectionConfig } from "../src/lib/whatsapp/types";
import type { AdvertisementDeliveryInput } from "../src/repositories/advertisement.repository";

let failures = 0;
function check(cond: unknown, msg: string) {
  if (!cond) {
    failures++;
    console.error(`FALHOU: ${msg}`);
  }
}

const NOW = new Date("2026-11-15T12:00:00-03:00");
const H = 3_600_000;
function ad(id: string, patch: Partial<AdvertisementRuleInput> = {}): AdvertisementRuleInput {
  return {
    id,
    name: `Publicidade ${id}`,
    imageUrl: "https://exemplo.blob.vercel-storage.com/mensagens/banner.jpg",
    messageText: "🎉 *10% OFF* na próxima corrida com o cupom VOLTA10",
    buttonLabel: "Ver oferta",
    buttonUrl: "https://maidrive.com.br/oferta",
    active: true,
    startsAt: null,
    endsAt: null,
    triggerTypeKeys: ["corrida_mai_drive"],
    frequencyMode: "PER_DAY",
    frequencyValue: 1,
    deleteAfterHours: null,
    lastSentAt: null,
    createdAt: new Date(NOW.getTime() - 10 * 24 * H),
    ...patch,
  };
}
const fresh = { adsLast24h: 0, sendsSinceLastAd: 1 };
const ctx = (history = fresh) => ({ notificationType: "corrida_mai_drive", now: NOW, history });

// 1) Seleção e filtros.
check(selectAdvertisement([ad("a", { active: false })], ctx()).reason === "nenhuma_ativa", "pausada não vai");
check(selectAdvertisement([ad("a", { startsAt: new Date(NOW.getTime() + H) })], ctx()).reason === "nenhuma_ativa", "agendada para depois não vai");
check(selectAdvertisement([ad("a", { endsAt: new Date(NOW.getTime() - H) })], ctx()).reason === "nenhuma_ativa", "encerrada não vai");
check(selectAdvertisement([ad("a", { triggerTypeKeys: ["outra_funcao"] })], ctx()).reason === "nenhuma_ativa", "outra função não dispara");
check(selectAdvertisement([ad("a")], ctx()).ad?.id === "a", "ativa no período e ligada à função vai");

// 2) Rodízio: nunca enviada primeiro, depois a que saiu há mais tempo.
{
  const ads = [
    ad("recente", { lastSentAt: new Date(NOW.getTime() - 1 * H) }),
    ad("antiga", { lastSentAt: new Date(NOW.getTime() - 5 * H) }),
    ad("nunca", { lastSentAt: null, createdAt: new Date(NOW.getTime() - 1 * H) }),
  ];
  check(selectAdvertisement(ads, ctx()).ad?.id === "nunca", "rodízio: nunca enviada primeiro");
  check(selectAdvertisement(ads.slice(0, 2), ctx()).ad?.id === "antiga", "rodízio: a que saiu há mais tempo");
  // Simula 4 envios seguidos atualizando lastSentAt: alterna entre as três.
  const pool = ads.map((a) => ({ ...a }));
  const order: string[] = [];
  for (let i = 0; i < 4; i++) {
    const pick = selectAdvertisement(pool, ctx()).ad!;
    order.push(pick.id);
    pick.lastSentAt = new Date(NOW.getTime() + i * H);
  }
  check(order.join(",") === "nunca,antiga,recente,nunca", `rodízio alterna (${order.join(",")})`);
}

// 3) Limite de frequência (padrão: 1 por pessoa por dia).
check(selectAdvertisement([ad("a")], ctx({ adsLast24h: 1, sendsSinceLastAd: 5 })).reason === "limite_frequencia", "padrão: 1 por dia");
check(selectAdvertisement([ad("a", { frequencyValue: 2 })], ctx({ adsLast24h: 1, sendsSinceLastAd: 1 })).ad?.id === "a", "2 por dia: segunda passa");
{
  const every3 = ad("a", { frequencyMode: "EVERY_N_SENDS", frequencyValue: 3 });
  const results = [1, 2, 3].map((n) => selectAdvertisement([every3], ctx({ adsLast24h: 0, sendsSinceLastAd: n })).ad?.id ?? "-");
  check(results.join(",") === "-,-,a", `a cada 3 envios: só no 3º (${results.join(",")})`);
}

// 4) Mensagem da publicidade: banner + texto num balão só (botão desligado:
// a Z-API não entrega send-button-actions; o link vai no texto).
check(!ADVERTISEMENT_BUTTONS_ENABLED, "botão de link das publicidades está desligado");
const plan = planAdvertisementMessage(ad("a"));
check(
  plan.deliveries.length === 1 &&
    plan.deliveries[0].kind === "image" &&
    !plan.deliveries[0].buttons &&
    !!plan.deliveries[0].image &&
    (plan.deliveries[0].text ?? "").includes("https://maidrive.com.br/oferta"),
  "publicidade: 1 balão (send-image) com banner e texto; link do botão antigo vai no texto"
);
check(buildZApiRequest("5546999990000", plan.deliveries[0]).endpoint === "send-image", "publicidade usa send-image");
check(
  planAdvertisementMessage(ad("c", { imageUrl: null })).deliveries.every((d) => d.kind === "text" && !d.buttons),
  "publicidade sem banner: send-text"
);
check(
  planAdvertisementMessage(ad("d", { messageText: "x".repeat(1100) })).deliveries.map((d) => d.kind).join(",") === "image,text",
  "texto longo: imagem e depois texto, sem botões"
);
check(validateAdvertisementInput({ ...ad("a"), buttonLabel: "x", buttonUrl: null }).length === 0, "campos de botão ignorados na validação");
const req = buildZApiRequest("5546999990000", plan.deliveries[0]);
console.log("===== PUBLICIDADE (alguns segundos depois do recibo) =====");
console.log(`POST <URL da instância>/${req.endpoint}`);
console.log(JSON.stringify(req.body, null, 2));
check(planAdvertisementMessage(ad("b", { buttonLabel: null, buttonUrl: null })).deliveries[0].kind === "image", "sem botão: send-image com legenda");
check(computeDeleteAt(NOW, 24)?.getTime() === NOW.getTime() + 24 * H && computeDeleteAt(NOW, null) === null && computeDeleteAt(NOW, 168) === null, "apagar depois de: 24h ok, 7 dias recusado");
check(validateAdvertisementInput({ ...ad("a"), triggerTypeKeys: [] }).length > 0, "validação: precisa de função");
check(validateAdvertisementInput({ ...ad("a"), deleteAfterHours: 168 }).some((e) => e.includes("Apagar")), "validação: 7 dias não é aceito");
check(validateAdvertisementInput({ ...ad("a") }).length === 0, "validação: publicidade completa ok");
check(isMissingTableError({ code: "P2021" }) && !isMissingTableError(new Error("timeout")), "detecta tabela ausente");
check(phoneVariants("5546988212387").includes("554688212387") && phoneVariants("554688212387").includes("5546988212387"), "telefone com e sem 9º dígito");

// 5) Disparo com dependências falsas.
type Sent = { endpoint: string; body: Record<string, unknown> };
function fakeProvider(mode: "ok" | "fail" | "throw", sent: Sent[]): WhatsappProvider {
  const respond = async (endpoint: string, body: Record<string, unknown>) => {
    sent.push({ endpoint, body });
    if (mode === "throw") throw new Error("explodiu");
    return mode === "ok"
      ? { ok: true, message: "ok", raw: { messageId: `msg${sent.length}` } }
      : { ok: false, message: "Erro ao enviar (HTTP 500)." };
  };
  return {
    key: "fake",
    sendMessage: (_c: WhatsappConnectionConfig, to: string, text: string) => respond("send-text", { phone: to, message: text }),
    sendImage: (_c: WhatsappConnectionConfig, to: string, image: string, caption?: string) =>
      respond("send-image", { phone: to, image, caption }),
    sendLinkButtons: async (
      _c: WhatsappConnectionConfig,
      to: string,
      text: string,
      buttons: LinkButtonAction[],
      options?: { image?: string }
    ) => ({
      ...(await respond("send-button-actions", { phone: to, message: text, image: options?.image, buttons })),
      fallbackSafe: false,
    }),
  } as unknown as WhatsappProvider;
}

function deps(over: Partial<AdvertisementDispatchDeps> & { provider?: WhatsappProvider } = {}) {
  const recorded: AdvertisementDeliveryInput[] = [];
  const marked: string[] = [];
  const d: AdvertisementDispatchDeps = {
    now: () => NOW,
    loadCandidates: async () => [ad("a", { deleteAfterHours: 24 })],
    isContactPaused: async () => false,
    isContactOptedOut: async () => false,
    loadHistory: async () => fresh,
    getSender: async () => ({
      provider: over.provider ?? fakeProvider("ok", []),
      config: { apiUrl: "https://api.z-api.io/instances/X/token/Y", apiToken: "", phoneNumber: "" },
    }),
    recordDelivery: async (data) => {
      recorded.push(data);
    },
    markSent: async (id) => {
      marked.push(id);
    },
    ...over,
  };
  return { d, recorded, marked };
}
const trigger = {
  connectionId: "conn_teste",
  tenantId: "tenant_teste",
  providerKey: "z-api",
  to: "5546999990000",
  notificationType: "corrida_mai_drive",
};

{
  const sent: Sent[] = [];
  const { d, recorded, marked } = deps({ provider: fakeProvider("ok", sent) });
  const out = await dispatchAdvertisementAfterNotification(trigger, d);
  check(out.status === "sent" && sent.length === 1 && sent[0].endpoint === "send-image", "envia 1 publicidade (send-image)");
  check(recorded.length === 1 && recorded[0].status === "SENT" && recorded[0].messageIds[0] === "msg1", "registra o envio com messageId");
  check(recorded[0].deleteAt?.getTime() === NOW.getTime() + 24 * H && recorded[0].recipientPhone === trigger.to, "guarda quando apagar");
  check(recorded[0].contactKey.startsWith("wa:") && !recorded[0].contactKey.includes("5546"), "contato guardado como hash");
  check(marked.join() === "a", "atualiza o rodízio");
}
{
  const sent: Sent[] = [];
  const out = await dispatchAdvertisementAfterNotification(trigger, deps({ provider: fakeProvider("ok", sent), isContactPaused: async () => true }).d);
  check(out.status === "skipped" && out.reason === "contato_pausado" && sent.length === 0, "contato pausado pelo anti-loop: não envia");
}
{
  const out = await dispatchAdvertisementAfterNotification(trigger, deps({ isContactOptedOut: async () => true }).d);
  check(out.status === "skipped" && out.reason === "contato_bloqueado", "contato bloqueado (SAIR): não envia");
}
{
  const out = await dispatchAdvertisementAfterNotification(
    trigger,
    deps({ loadCandidates: async () => Promise.reject(Object.assign(new Error("relation does not exist"), { code: "P2021" })) }).d
  );
  check(out.status === "skipped" && out.reason === "tabela_ausente", "sem a tabela (migration não aplicada): não faz nada");
}
{
  const out = await dispatchAdvertisementAfterNotification(trigger, deps({ loadHistory: async () => ({ adsLast24h: 1, sendsSinceLastAd: 9 }) }).d);
  check(out.status === "skipped" && out.reason === "limite_frequencia", "limite do dia atingido: não envia");
}
{
  const sent: Sent[] = [];
  const { d, recorded } = deps({ provider: fakeProvider("fail", sent) });
  const out = await dispatchAdvertisementAfterNotification(trigger, d);
  check(out.status === "failed" && recorded[0]?.status === "FAILED" && !recorded[0]?.deleteAt, "Z-API recusou: registra falha");
}
{
  const out = await dispatchAdvertisementAfterNotification(trigger, deps({ provider: fakeProvider("throw", []) }).d);
  check(out.status === "failed" || out.status === "error", "provedor lança: vira resultado, não exceção");
  const out2 = await dispatchAdvertisementAfterNotification(trigger, deps({ getSender: async () => { throw new Error("db caiu"); } }).d);
  check(out2.status === "error", "erro inesperado: vira resultado, não exceção");
}

// 6) Falha da publicidade não afeta o recibo: o agendamento nunca lança e
// nunca espera o envio.
{
  let threw = false;
  try {
    scheduleAdvertisementTask(trigger, () => {
      throw new Error("after() fora de requisição");
    });
  } catch {
    threw = true;
  }
  check(!threw, "after() falhando não derruba o recibo");
  let captured: (() => Promise<void>) | null = null;
  const started = Date.now();
  scheduleAdvertisementTask(trigger, (task) => {
    captured = task;
  }, { delayMs: 0, deps: deps({ getSender: async () => { throw new Error("Z-API fora do ar"); } }).d });
  check(captured !== null && Date.now() - started < 50, "agenda em segundo plano, sem segurar a resposta");
  let taskThrew = false;
  await (captured as unknown as () => Promise<void>)().catch(() => {
    taskThrew = true;
  });
  check(!taskThrew, "tarefa em segundo plano com erro não lança");
  const receiptResult = { ok: true, message: "Mensagem enviada com sucesso." };
  check(receiptResult.ok, "recibo continua ok");
}

console.log(`\n${failures === 0 ? "OK" : `${failures} falha(s)`}: check-advertisements`);
if (failures > 0) process.exit(1);
