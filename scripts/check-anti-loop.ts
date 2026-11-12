import {
  FAST_REPLY_MIN_COUNT,
  MAX_AUTO_REPLIES_PER_DAY,
  MAX_AUTO_REPLIES_PER_HOUR,
  autoReplyPhoneMatches,
  countFastReplies,
  countInWindow,
  dedupeInboundSamples,
  evaluateLongWindowCap,
  isMenuLikeText,
  largestNearDuplicateGroup,
  textSimilarity,
  countRecentAutoReplies,
  detectAutomaticSender,
  hasRegularRhythm,
  hasRepeatedText,
  isOperatorLikeName,
  maskContactPhone,
  normalizeInboundText,
  type InboundSample,
} from "../src/lib/whatsapp/anti-loop";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const now = new Date("2026-11-11T15:08:00.000Z");

function at(secondsAgo: number): Date {
  return new Date(now.getTime() - secondsAgo * 1000);
}

function samples(rows: Array<{ ago: number; text?: string | null; chatName?: string | null }>): InboundSample[] {
  return rows.map((row) => ({
    at: at(row.ago),
    text: row.text ?? null,
    chatName: row.chatName ?? null,
  }));
}

assert(maskContactPhone("554699990621").startsWith("55"), "mask keeps DDI");
assert(maskContactPhone("554699990621").endsWith("0621"), "mask keeps last 4");
assert(!maskContactPhone("554699990621").includes("9999"), "mask hides middle digits");

assert(isOperatorLikeName("Minha Claro"), "minha claro");
assert(isOperatorLikeName("Meu Vivo"), "meu vivo");
assert(isOperatorLikeName("TIM"), "tim exact");
assert(isOperatorLikeName("Oi Fibra"), "oi fibra");
assert(!isOperatorLikeName("Maria Clara"), "human name is not operator");
assert(!isOperatorLikeName("João"), "plain name");

assert(
  normalizeInboundText("_*Sinto muito, tive um problema.*_ https://claro.com.br/r/abc") ===
    normalizeInboundText("Sinto muito, tive um problema"),
  "normalize strips markdown and urls"
);

const burst = samples([
  { ago: 50, text: "oi" },
  { ago: 40, text: "oi" },
  { ago: 30, text: "oi" },
  { ago: 20, text: "oi" },
  { ago: 10, text: "oi" },
  { ago: 2, text: "oi" },
]);
const burstResult = detectAutomaticSender(burst, now);
assert(burstResult.detected, "6 messages in 60s is detected");
assert(burstResult.reasons.some((r) => r.includes("60s")), "burst reason mentions 60s");

const fiveOnly = samples([
  { ago: 58, text: "quero uma corrida" },
  { ago: 41, text: "para o centro" },
  { ago: 37, text: "pode ser agora" },
  { ago: 10, text: "valeu" },
  { ago: 1, text: "obrigado" },
]);
assert(!detectAutomaticSender(fiveOnly, now).detected, "5 varied human messages in 60s are not enough");

const flood: InboundSample[] = [];
for (let i = 0; i < 15; i++) {
  flood.push({ at: at(40 + i * 18), text: `msg ${i}`, chatName: "Ana" });
}
const floodResult = detectAutomaticSender(flood, now);
assert(floodResult.detected, "15 messages in 5 min is detected");
assert(floodResult.signals.inboundLast60s < 6, "flood fixture is not a 60s burst");

const claro = samples([
  { ago: 45, text: "Não entendi. Escreva apenas o assunto, por exemplo, fatura.", chatName: "Minha Claro" },
  { ago: 30, text: "Não entendi. Escreva apenas o assunto, por exemplo, fatura.", chatName: "Minha Claro" },
  { ago: 16, text: "Não entendi. Escreva apenas o assunto, por exemplo, fatura.", chatName: "Minha Claro" },
  { ago: 3, text: "Não entendi. Escreva apenas o assunto, por exemplo, fatura.", chatName: "Minha Claro" },
]);
const claroResult = detectAutomaticSender(claro, now);
assert(claroResult.detected, "operator name + repeated text + volume is detected");
assert(claroResult.signals.operatorLikeName, "claro name signal");
assert(claroResult.signals.repeatedText, "claro repeated text");

assert(!detectAutomaticSender(samples([{ ago: 2, text: "fatura", chatName: "Minha Claro" }]), now).detected, "name alone is not enough");

assert(hasRepeatedText(claro), "repeated helper");
assert(!hasRepeatedText(fiveOnly), "varied texts are not repeated");

const rhythmic = samples([
  { ago: 32, text: "ping", chatName: "Bot" },
  { ago: 24, text: "ping", chatName: "Bot" },
  { ago: 16, text: "ping", chatName: "Bot" },
  { ago: 8, text: "ping", chatName: "Bot" },
  { ago: 0, text: "ping", chatName: "Bot" },
]);
assert(hasRegularRhythm(rhythmic), "regular 8s interval");
assert(!hasRegularRhythm(fiveOnly), "irregular human rhythm");

assert(countInWindow(burst, 60_000, now) === 6, "count 60s window");

assert(autoReplyPhoneMatches("554699990621", "554699990621", null), "same phone matches");
assert(autoReplyPhoneMatches("159999999995240", "554699990621", "159999999995240@lid"), "sent lid matches chatLid");
assert(!autoReplyPhoneMatches("554699990000", "554699990621", "159999999995240@lid"), "other phone does not match");

const replies = [
  { at: at(50), phone: "159999999995240" },
  { at: at(40), phone: "159999999995240" },
  { at: at(30), phone: "159999999995240" },
  { at: at(20), phone: "159999999995240" },
  { at: at(10), phone: "159999999995240" },
];
assert(
  countRecentAutoReplies(replies, "554699990621", "159999999995240@lid", now) === 5,
  "counts 5 sent to matching lid"
);
assert(
  countRecentAutoReplies(replies, "554699990621", "159999999995240@lid", now) >= 5,
  "rate limit cap would trigger at 5"
);

console.log("ok: anti-loop checks passed");

// --- Robô x robô (incidente 12/11, "Grupo Rei Jesus") -----------------------
const reiJesusMenu =
  "Grupo Rei Jesus agradece seu contato! Para direcionarmos seu atendimento, escolha uma das opções:\n1 - Sou Fornecedor\n2 - Sou Cliente\n3 - Entrevistas\n4 - Administrativo";
const reiJesusRetry =
  "Desculpe, não consegui identificar sua solicitação. Para direcionarmos seu atendimento, por favor escolha uma das opções:\n1 - Sou Fornecedor\n2 - Sou Cliente";

assert(isMenuLikeText(reiJesusMenu), "menu numerado é menu de chatbot");
assert(isMenuLikeText(reiJesusRetry), "frase de URA é menu de chatbot");
assert(!isMenuLikeText("Oi, cheguei no local, pode descer?"), "frase humana não é menu");
assert(!isMenuLikeText("Paguei 2 - 3 reais a mais"), "uma linha com número não é menu");
assert(textSimilarity(reiJesusMenu, reiJesusMenu) === 1, "mesmo texto similaridade 1");
assert(textSimilarity(reiJesusMenu, "Oi tudo bem, quero saber da corrida de ontem") < 0.3, "textos diferentes");

// Linha do tempo real (segundos antes de "agora" = 2ª mensagem do contato):
// nossa notificação -34s, contato -19s, nossa resposta -11s, contato 0s.
const incidentSent = [at(34), at(11)];
const incidentTwo = samples([
  { ago: 19, text: reiJesusMenu, chatName: "Juliana Jesus" },
  { ago: 0, text: reiJesusMenu, chatName: "Juliana Jesus" },
]);
const incidentResult = detectAutomaticSender(incidentTwo, now, { sentAt: incidentSent });
assert(incidentResult.detected, "menu repetido 2x após nossa resposta é detectado já na 2ª mensagem");
assert(incidentResult.signals.menuLike === true, "sinal menuLike");
assert(incidentResult.signals.nearDuplicateCount === 2, "2 quase idênticos");
assert(
  !detectAutomaticSender(samples([{ ago: 0, text: reiJesusMenu, chatName: "Juliana Jesus" }]), now, {
    sentAt: [at(15)],
  }).detected,
  "um menu sozinho (resposta automática de saudação) não pausa"
);

// Reentrega do mesmo webhook (mesmo messageId) não conta como repetição.
const redelivered: InboundSample[] = [
  { at: at(5), text: reiJesusMenu, chatName: "Empresa", messageId: "ABC" },
  { at: at(2), text: reiJesusMenu, chatName: "Empresa", messageId: "ABC" },
];
assert(dedupeInboundSamples(redelivered).length === 1, "dedupe por messageId");
assert(!detectAutomaticSender(redelivered, now, { sentAt: [at(10)] }).detected, "reentrega não é robô");

// Pessoa que repete a mesma frase longa 2x (sem cara de menu) não é pausada.
const humanRepeat = samples([
  { ago: 40, text: "Moço, o motorista ainda não chegou aqui na portaria do prédio", chatName: "Ana" },
  { ago: 5, text: "Moço, o motorista ainda não chegou aqui na portaria do prédio", chatName: "Ana" },
]);
assert(!detectAutomaticSender(humanRepeat, now, { sentAt: [at(30)] }).detected, "humano repetindo 2x não pausa");

// Texto longo quase idêntico 3x pausa sozinho (sem menu, sem nome de operadora).
const nearDup3 = samples([
  { ago: 100, text: "Obrigado pela sua mensagem. Retornaremos o contato em breve, protocolo 1234" },
  { ago: 60, text: "Obrigado pela sua mensagem. Retornaremos o contato em breve, protocolo 1235" },
  { ago: 20, text: "Obrigado pela sua mensagem. Retornaremos o contato em breve, protocolo 1236" },
]);
assert(largestNearDuplicateGroup(nearDup3) === 3, "3 quase idênticos (muda só o protocolo)");
assert(detectAutomaticSender(nearDup3, now).detected, "3 quase idênticos longos pausam");
assert(largestNearDuplicateGroup(samples([{ ago: 9, text: "ok" }, { ago: 5, text: "ok" }, { ago: 1, text: "ok" }])) === 0, "texto curto fica fora");

// Respostas instantâneas (< 3s após nossa mensagem), textos variados.
const fastInbound = samples([
  { ago: 98, text: "Recebido" },
  { ago: 68, text: "Mensagem recebida" },
  { ago: 38, text: "Aguarde" },
]);
const fastSent = [at(100), at(70), at(40)];
assert(countFastReplies(fastInbound, fastSent) === 3, "3 respostas em 2s");
const fastResult = detectAutomaticSender(fastInbound, now, { sentAt: fastSent });
assert(fastResult.detected, "respostas instantâneas repetidas pausam");
assert(fastResult.signals.fastReplies === FAST_REPLY_MIN_COUNT, "sinal fastReplies");
const slowHuman = samples([
  { ago: 90, text: "oi" },
  { ago: 50, text: "qual o valor?" },
  { ago: 10, text: "ok obrigado" },
]);
assert(countFastReplies(slowHuman, [at(100), at(60), at(20)]) === 0, "humano responde em 10s");
assert(!detectAutomaticSender(slowHuman, now, { sentAt: [at(100), at(60), at(20)] }).detected, "humano normal não pausa");
assert(countFastReplies(fastInbound, [at(100)]) === 1, "cada envio nosso conta uma vez só");

// Teto em janela maior (1h / 24h).
assert(evaluateLongWindowCap({ inbound1h: 10, sent1h: 12, inbound24h: 20, sent24h: 25 }) === null, "abaixo do teto");
assert(
  evaluateLongWindowCap({ inbound1h: MAX_AUTO_REPLIES_PER_HOUR, sent1h: 40, inbound24h: 30, sent24h: 40 })?.includes("1h"),
  "30 respostas em 1h pausa"
);
assert(
  evaluateLongWindowCap({ inbound1h: 5, sent1h: 5, inbound24h: MAX_AUTO_REPLIES_PER_DAY, sent24h: 70 })?.includes("24h"),
  "60 respostas em 24h pausa"
);
assert(
  evaluateLongWindowCap({ inbound1h: 2, sent1h: 50, inbound24h: 2, sent24h: 80 }) === null,
  "muitas notificações sem resposta do contato não contam como loop"
);

console.log("ok: robô x robô checks passed");
