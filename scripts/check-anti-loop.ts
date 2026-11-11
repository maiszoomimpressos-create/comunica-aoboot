import {
  autoReplyPhoneMatches,
  countInWindow,
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
