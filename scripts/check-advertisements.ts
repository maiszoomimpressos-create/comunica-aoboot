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
  MAX_AD_TEXT_LENGTH,
  planAdvertisementMessage,
  withAdvertisementTitle,
  selectAdvertisement,
  validateAdvertisementInput,
  type AdvertisementRuleInput,
} from "../src/lib/advertisements/advertisement-rules";
import { buildZApiRequest } from "../src/lib/notifications/message-blocks";
import {
  enqueueAdvertisementAfterNotification,
  handleAdvertisementReceiptStatus,
  parseReceiptStatusWebhook,
  phoneVariants,
  processPendingAdvertisement,
  processPendingAdvertisements,
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
check((plan.deliveries[0].text ?? "").startsWith("📣 *Oferta*\n\n"), "título 📣 *Oferta* no começo");
check(withAdvertisementTitle("📣 *Oferta*\n\nx") === "📣 *Oferta*\n\nx", "título não duplica");
check(
  planAdvertisementMessage(ad("e", { messageText: "y".repeat(MAX_AD_TEXT_LENGTH), buttonLabel: null, buttonUrl: null })).deliveries.length === 1,
  "texto no limite + título: ainda 1 balão"
);
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

type Row = AdvertisementDeliveryInput & { id: string; createdAt: Date };
function deps(over: Partial<AdvertisementDispatchDeps> & { provider?: WhatsappProvider } = {}) {
  const rows: Row[] = [];
  const marked: string[] = [];
  const slept: number[] = [];
  const clock = { now: NOW };
  const delivered = new Map<string, Date>();
  const d: AdvertisementDispatchDeps = {
    now: () => clock.now,
    sleep: async (ms) => {
      slept.push(ms);
      clock.now = new Date(clock.now.getTime() + ms);
    },
    loadCandidates: async () => [ad("a", { deleteAfterHours: 24 })],
    loadAdvertisement: async (id) => ad(id, { deleteAfterHours: 24 }),
    isContactPaused: async () => false,
    isContactOptedOut: async () => false,
    loadHistory: async () => fresh,
    getSender: async () => ({
      provider: over.provider ?? fakeProvider("ok", []),
      config: { apiUrl: "https://api.z-api.io/instances/X/token/Y", apiToken: "", phoneNumber: "" },
    }),
    hasDeliveryForReceipt: async (_c, receiptId) => rows.some((r) => r.messageIds.includes(receiptId)),
    createPending: async (data) => {
      const row = { ...data, id: `d${rows.length + 1}`, createdAt: clock.now };
      rows.push(row);
      return { id: row.id };
    },
    getDelivery: async (id) => {
      const r = rows.find((x) => x.id === id);
      return r ? { ...r, status: r.status } : null;
    },
    findReceiptDeliveredAt: async (_c, receiptId) => delivered.get(receiptId) ?? null,
    claim: async (id) => {
      const r = rows.find((x) => x.id === id);
      if (!r || r.status !== "PENDING") return false;
      r.status = "SENDING";
      return true;
    },
    expire: async (id, error) => {
      const r = rows.find((x) => x.id === id);
      if (!r || r.status !== "PENDING") return false;
      Object.assign(r, { status: "EXPIRED", error, recipientPhone: null });
      return true;
    },
    finish: async (id, data) => {
      const r = rows.find((x) => x.id === id);
      if (r && r.status === "SENDING") Object.assign(r, data);
    },
    markSent: async (id) => {
      marked.push(id);
    },
    listPending: async () => rows.filter((r) => r.status === "PENDING").map((r) => ({ id: r.id })),
    failStuck: async () => undefined,
    ...over,
  };
  return { d, rows, marked, slept, clock, delivered };
}
const trigger = {
  connectionId: "conn_teste",
  tenantId: "tenant_teste",
  providerKey: "z-api",
  to: "5546999990000",
  notificationType: "corrida_mai_drive",
  receiptMessageId: "RECIBO1",
};
const S = 1000;
const MIN = 60 * S;

// 5a) Fila: no envio do recibo não manda nada, só deixa PENDING.
{
  const sent: Sent[] = [];
  const t = deps({ provider: fakeProvider("ok", sent) });
  const q = await enqueueAdvertisementAfterNotification(trigger, t.d);
  check(q.status === "queued" && t.rows.length === 1 && t.rows[0].status === "PENDING" && sent.length === 0, "recibo enviado: publicidade fica na fila, nada enviado");
  check(t.rows[0].messageIds[0] === "RECIBO1" && t.rows[0].recipientPhone === trigger.to, "fila guarda o id do recibo e o destino");
  check(t.rows[0].contactKey.startsWith("wa:") && !t.rows[0].contactKey.includes("5546"), "contato guardado como hash");
  const again = await enqueueAdvertisementAfterNotification(trigger, t.d);
  check(again.status === "skipped" && again.reason === "ja_na_fila" && t.rows.length === 1, "mesmo recibo de novo: não duplica");

  // Sem RECEIVED: espera (cron não envia).
  const w = await processPendingAdvertisement("d1", { wait: false }, t.d);
  check(w.status === "waiting" && w.reason === "recibo_nao_entregue" && sent.length === 0, "sem RECEIVED: não envia");

  // RECEIVED às +5 s; cron às +20 s: ainda não (precisa de 30 s).
  t.delivered.set("RECIBO1", new Date(NOW.getTime() + 5 * S));
  t.clock.now = new Date(NOW.getTime() + 20 * S);
  const early = await processPendingAdvertisement("d1", { wait: false }, t.d);
  check(early.status === "waiting" && early.reason === "aguardando_intervalo" && sent.length === 0, "RECEIVED há 15 s: ainda espera");

  // after() do webhook (wait): dorme o que falta (15 s) e envia.
  const out = await processPendingAdvertisement("d1", { wait: true }, t.d);
  check(t.slept.join() === "15000", `dorme até RECEIVED + 30 s (${t.slept.join()})`);
  check(out.status === "sent" && sent.length === 1 && sent[0].endpoint === "send-image", "envia 1 publicidade (send-image) 30 s depois do RECEIVED");
  check(String(sent[0].body.caption ?? "").startsWith("📣 *Oferta*"), "legenda começa com 📣 *Oferta*");
  const row = t.rows[0];
  check(row.status === "SENT" && row.messageIds[0] === "msg1" && row.deleteAt?.getTime() === t.clock.now.getTime() + 24 * H, "registra o envio (id da publicidade e quando apagar)");
  check(t.marked.join() === "a", "atualiza o rodízio");

  // Cron + outro webhook depois: não reenvia (idempotente).
  const twice = await processPendingAdvertisement("d1", { wait: true }, t.d);
  const cron = await processPendingAdvertisements(50, t.d);
  check(twice.status === "skipped" && cron.processed === 0 && sent.length === 1, "uma só por recibo (webhook repetido / cron)");
}

// 5b) Corrida entre after() e cron: só um reserva.
{
  const sent: Sent[] = [];
  const t = deps({ provider: fakeProvider("ok", sent) });
  await enqueueAdvertisementAfterNotification(trigger, t.d);
  t.delivered.set("RECIBO1", new Date(NOW.getTime() - 60 * S));
  const [a, b] = await Promise.all([
    processPendingAdvertisement("d1", { wait: true }, t.d),
    processPendingAdvertisement("d1", { wait: false }, t.d),
  ]);
  check(sent.length === 1 && [a.status, b.status].sort().join() === "sent,skipped", `concorrência: envia uma vez (${a.status},${b.status})`);
}

// 5c) Sem RECEIVED em 30 min: expira e não envia.
{
  const sent: Sent[] = [];
  const t = deps({ provider: fakeProvider("ok", sent) });
  await enqueueAdvertisementAfterNotification(trigger, t.d);
  t.clock.now = new Date(NOW.getTime() + 29 * MIN);
  check((await processPendingAdvertisements(50, t.d)).waiting === 1, "29 min sem RECEIVED: ainda espera");
  t.clock.now = new Date(NOW.getTime() + 30 * MIN + S);
  const c = await processPendingAdvertisements(50, t.d);
  check(c.expired === 1 && t.rows[0].status === "EXPIRED" && t.rows[0].recipientPhone === null && sent.length === 0, "30 min sem RECEIVED: expira, registra e não envia");
  t.delivered.set("RECIBO1", new Date(NOW.getTime() + 31 * MIN));
  check((await processPendingAdvertisement("d1", { wait: true }, t.d)).status === "skipped" && sent.length === 0, "RECEIVED atrasado depois de expirar: não envia");
}

// 5d) RECEIVED depois do prazo (cron atrasado): expira também.
{
  const sent: Sent[] = [];
  const t = deps({ provider: fakeProvider("ok", sent) });
  await enqueueAdvertisementAfterNotification(trigger, t.d);
  t.delivered.set("RECIBO1", new Date(NOW.getTime() + 31 * MIN));
  t.clock.now = new Date(NOW.getTime() + 32 * MIN);
  check((await processPendingAdvertisement("d1", { wait: false }, t.d)).status === "expired" && sent.length === 0, "RECEIVED após 30 min: expira");
}

// 5e) Regras na fila e na hora de enviar.
{
  const sent: Sent[] = [];
  const t = deps({ provider: fakeProvider("ok", sent), isContactPaused: async () => true });
  const q = await enqueueAdvertisementAfterNotification(trigger, t.d);
  check(q.status === "skipped" && q.reason === "contato_pausado" && t.rows.length === 0, "contato pausado pelo anti-loop: nem entra na fila");
}
{
  const q = await enqueueAdvertisementAfterNotification(trigger, deps({ isContactOptedOut: async () => true }).d);
  check(q.status === "skipped" && q.reason === "contato_bloqueado", "contato bloqueado (SAIR): não entra na fila");
}
{
  const q = await enqueueAdvertisementAfterNotification(
    trigger,
    deps({ loadCandidates: async () => Promise.reject(Object.assign(new Error("relation does not exist"), { code: "P2021" })) }).d
  );
  check(q.status === "skipped" && q.reason === "tabela_ausente", "sem a tabela: não faz nada");
}
{
  const q = await enqueueAdvertisementAfterNotification(trigger, deps({ loadHistory: async () => ({ adsLast24h: 1, sendsSinceLastAd: 9 }) }).d);
  check(q.status === "skipped" && q.reason === "limite_frequencia", "limite do dia (inclui as da fila): não entra");
}
{
  const q = await enqueueAdvertisementAfterNotification({ ...trigger, receiptMessageId: null }, deps().d);
  check(q.status === "skipped" && q.reason === "sem_id_do_recibo", "recibo sem messageId: não entra na fila");
}
{
  const sent: Sent[] = [];
  let paused = false;
  const t = deps({ provider: fakeProvider("ok", sent), isContactPaused: async () => paused });
  await enqueueAdvertisementAfterNotification(trigger, t.d);
  paused = true;
  t.delivered.set("RECIBO1", new Date(NOW.getTime() - MIN));
  const out = await processPendingAdvertisement("d1", { wait: false }, t.d);
  check(out.status === "skipped" && t.rows[0].status === "SKIPPED" && sent.length === 0, "pausou entre o recibo e o envio: não envia");
}
{
  const sent: Sent[] = [];
  const t = deps({ provider: fakeProvider("ok", sent), loadAdvertisement: async (id) => ad(id, { active: false }) });
  await enqueueAdvertisementAfterNotification(trigger, t.d);
  t.delivered.set("RECIBO1", new Date(NOW.getTime() - MIN));
  const out = await processPendingAdvertisement("d1", { wait: false }, t.d);
  check(out.status === "skipped" && out.reason === "publicidade_inativa" && sent.length === 0, "publicidade pausada antes do envio: não envia");
}
{
  const sent: Sent[] = [];
  const t = deps({ provider: fakeProvider("fail", sent) });
  await enqueueAdvertisementAfterNotification(trigger, t.d);
  t.delivered.set("RECIBO1", new Date(NOW.getTime() - MIN));
  const out = await processPendingAdvertisement("d1", { wait: false }, t.d);
  check(out.status === "failed" && t.rows[0].status === "FAILED" && !t.rows[0].deleteAt, "Z-API recusou: registra falha, não reenvia");
}
{
  const t = deps({ provider: fakeProvider("throw", []) });
  await enqueueAdvertisementAfterNotification(trigger, t.d);
  t.delivered.set("RECIBO1", new Date(NOW.getTime() - MIN));
  const out = await processPendingAdvertisement("d1", { wait: false }, t.d);
  check(out.status === "failed" || out.status === "error", "provedor lança: vira resultado, não exceção");
  const out2 = await enqueueAdvertisementAfterNotification(trigger, deps({ loadHistory: async () => { throw new Error("db caiu"); } }).d);
  check(out2.status === "error", "erro inesperado: vira resultado, não exceção");
}

// 5f) Webhook de status.
check(parseReceiptStatusWebhook({ type: "MessageStatusCallback", status: "RECEIVED", ids: ["X"] })?.ids[0] === "X", "webhook RECEIVED reconhecido");
check(parseReceiptStatusWebhook({ type: "MessageStatusCallback", status: "SENT", ids: ["X"] }) === null, "webhook SENT ignorado");
check(parseReceiptStatusWebhook({ type: "ReceivedCallback", status: "RECEIVED", ids: ["X"] }) === null, "mensagem recebida ignorada");
{
  const sent: Sent[] = [];
  const t = deps({ provider: fakeProvider("ok", sent) });
  await enqueueAdvertisementAfterNotification(trigger, t.d);
  t.delivered.set("RECIBO1", NOW);
  let task: (() => Promise<void>) | null = null;
  handleAdvertisementReceiptStatus(
    "conn_teste",
    { type: "MessageStatusCallback", status: "RECEIVED", ids: ["RECIBO1"] },
    (fn) => {
      task = fn;
    },
    t.d,
    async (_c, ids) => t.rows.filter((r) => r.status === "PENDING" && r.messageIds.some((m) => ids.includes(m))).map((r) => ({ id: r.id }))
  );
  check(task !== null && sent.length === 0, "webhook só agenda (não segura a resposta)");
  await (task as unknown as () => Promise<void>)();
  check(sent.length === 1 && t.slept.join() === "30000", "webhook RECEIVED: envia 30 s depois");
  let threw = false;
  try {
    handleAdvertisementReceiptStatus("c", { type: "MessageStatusCallback", status: "RECEIVED", ids: ["Z"] }, () => {
      throw new Error("after() fora de requisição");
    });
  } catch {
    threw = true;
  }
  check(!threw, "webhook: after() falhando não derruba nada");
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
  }, { deps: deps({ loadCandidates: async () => { throw new Error("Z-API fora do ar"); } }).d });
  check(captured !== null && Date.now() - started < 50, "agenda em segundo plano, sem segurar a resposta");
  let taskThrew = false;
  await (captured as unknown as () => Promise<void>)().catch(() => {
    taskThrew = true;
  });
  check(!taskThrew, "tarefa em segundo plano com erro não lança");
}

console.log(`\n${failures === 0 ? "OK" : `${failures} falha(s)`}: check-advertisements`);
if (failures > 0) process.exit(1);
