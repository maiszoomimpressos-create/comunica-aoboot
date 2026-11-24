import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canContinueSequence,
  canStartSequence,
  estimateSequenceMs,
  maxPartIntervalForBudget,
  partsFromCampaign,
  pickPartGapSeconds,
  remainingParts,
  renderSequence,
  sequenceFitsBudget,
  summarizePartsText,
  validateParts,
  withPartMessageId,
  parsePartMessageIds,
  type CampaignPart,
} from "@/lib/campaigns/sequence";
import { splitCaption } from "@/lib/campaigns/caption";

const ctx = { name: "Maria Silva", phone: "5511912345678", businessName: "Mais Zap" };
const FOOTER = "Para não receber mais mensagens, responda SAIR.";
const IMG = "https://blob.example.com/promo.jpg";

const text = (t: string): CampaignPart => ({ type: "text", text: t, mediaUrl: null, fileName: null });
const image = (caption: string | null, url = IMG): CampaignPart => ({ type: "image", text: caption, mediaUrl: url, fileName: null });
const audio = (url = "https://blob.example.com/a.ogg"): CampaignPart => ({ type: "audio", text: null, mediaUrl: url, fileName: null });

// --- Compatibilidade com campanhas antigas -----------------------------------

test("campanha antiga só texto vira [texto]", () => {
  const parts = partsFromCampaign({ parts: null, messageText: "Oi {{nome}}", mediaType: null, mediaUrl: null, mediaFileName: null });
  assert.deepEqual(parts, [text("Oi {{nome}}")]);
});

test("campanha antiga imagem+texto vira [imagem com legenda]", () => {
  const parts = partsFromCampaign({ parts: null, messageText: "Promo", mediaType: "image", mediaUrl: IMG, mediaFileName: null });
  assert.deepEqual(parts, [image("Promo")]);
});

test("campanha antiga áudio+texto vira [áudio, texto] (como o envio antigo)", () => {
  const parts = partsFromCampaign({
    parts: [],
    messageText: "Ouça!",
    mediaType: "audio",
    mediaUrl: "https://blob.example.com/a.ogg",
    mediaFileName: null,
  });
  assert.deepEqual(parts, [audio(), text("Ouça!")]);
});

test("partes gravadas têm prioridade e lixo no JSON é ignorado", () => {
  const parts = partsFromCampaign({
    parts: [{ type: "image", text: "a", mediaUrl: IMG }, { type: "xyz" }, 42, { type: "text", text: "b" }],
    messageText: "ignorado",
    mediaType: "video",
    mediaUrl: IMG,
    mediaFileName: null,
  });
  assert.deepEqual(parts, [image("a"), text("b")]);
});

// --- Validação -------------------------------------------------------------

test("validateParts aceita sequência imagem → texto → imagem", () => {
  assert.equal(validateParts([image(null), text("Oi {{primeiro_nome}}"), image("Até já")]), null);
});

test("validateParts aponta qual mensagem está errada", () => {
  assert.match(validateParts([text("ok"), text("  ")]) ?? "", /^Mensagem 2: escreva o texto/);
  assert.match(validateParts([image("x", "http://inseguro.com/a.jpg")]) ?? "", /^Mensagem 1: .*https/);
  assert.match(validateParts([text("Oi {{apelido}}")]) ?? "", /^Mensagem 1: variável desconhecida \{\{apelido\}\}/);
  assert.match(
    validateParts([{ type: "document", text: null, mediaUrl: IMG, fileName: "catalogo" }]) ?? "",
    /extensão/
  );
  assert.match(validateParts([]) ?? "", /pelo menos uma/);
  assert.match(validateParts(Array.from({ length: 6 }, () => text("a"))) ?? "", /No máximo 5/);
});

test("summarizePartsText junta só os textos", () => {
  assert.equal(summarizePartsText([image(null), text("Oi"), audio(), image("Tchau")]), "Oi\n\nTchau");
});

// --- Montagem -------------------------------------------------------------

test("renderSequence aplica variáveis/variação em todas as partes e o rodapé só na última com texto", () => {
  const seq = renderSequence([image("Oi {{primeiro_nome}}!"), text("{Promo|Promo} da {{empresa}}"), audio()], ctx, FOOTER, () => 0);
  assert.equal(seq.length, 3);
  assert.equal(seq[0].text, "Oi Maria!");
  assert.equal(seq[1].text, `Promo da Mais Zap\n\n${FOOTER}`);
  assert.equal(seq[2].type, "audio");
  assert.equal(seq[2].text, "");
  assert.deepEqual(
    seq.map((p) => p.index),
    [0, 1, 2]
  );
});

test("renderSequence não duplica rodapé quando alguma parte já fala em SAIR", () => {
  const seq = renderSequence([text("Responda SAIR pra sair"), text("Oi")], ctx, FOOTER);
  assert.equal(seq[1].text, "Oi");
});

test("renderSequence só com áudio: rodapé vira uma mensagem extra no fim", () => {
  const seq = renderSequence([audio()], ctx, FOOTER);
  assert.equal(seq.length, 2);
  assert.equal(seq[1].type, "text");
  assert.equal(seq[1].text, FOOTER);
});

test("legenda longa é dividida por parte (regra de 1024)", () => {
  const long = "Palavra ".repeat(300).trim(); // ~2400 caracteres
  const seq = renderSequence([image(long), image("curta")], ctx, null);
  const first = splitCaption(seq[0].text);
  assert.ok(first.caption.length <= 1024);
  assert.ok(first.rest.length > 0);
  assert.equal(splitCaption(seq[1].text).rest, "");
});

// --- Retomada --------------------------------------------------------------

test("retomada começa da parte que faltou, sem repetir as anteriores", () => {
  const seq = renderSequence([image("1"), text("2"), image("3")], ctx, null);
  const sent: number[] = [];
  let nextPartIndex = 0;
  let ids: (string | null)[] = [];

  // 1ª tentativa: parte 2 (índice 1) falha com erro temporário.
  for (const part of remainingParts(seq, nextPartIndex)) {
    if (part.index === 1) break;
    sent.push(part.index);
    ids = withPartMessageId(ids, part.index, `id-${part.index}`);
    nextPartIndex = part.index + 1;
  }
  assert.equal(nextPartIndex, 1);

  // Retentativa: só as que faltam.
  const resumed = remainingParts(seq, nextPartIndex);
  assert.deepEqual(
    resumed.map((p) => p.index),
    [1, 2]
  );
  for (const part of resumed) {
    sent.push(part.index);
    ids = withPartMessageId(ids, part.index, `id-${part.index}`);
  }
  assert.deepEqual(sent, [0, 1, 2]);
  assert.deepEqual(ids, ["id-0", "id-1", "id-2"]);
});

test("ids por parte: buracos ficam null e JSON inválido vira lista vazia", () => {
  assert.deepEqual(withPartMessageId(null, 2, "c"), [null, null, "c"]);
  assert.deepEqual(withPartMessageId(["a"], 1, null), ["a", null]);
  assert.deepEqual(parsePartMessageIds("lixo"), []);
  assert.deepEqual(parsePartMessageIds(["a", 3, ""]), ["a", null, null]);
});

// --- Orçamento de tempo ----------------------------------------------------

test("5 partes com intervalo de até 6 s cabem no orçamento padrão de 45 s", () => {
  assert.ok(sequenceFitsBudget(5, 6, 45_000));
  assert.ok(!sequenceFitsBudget(5, 10, 45_000));
  assert.equal(maxPartIntervalForBudget(5, 45_000), 6);
  assert.equal(maxPartIntervalForBudget(1, 45_000), 30);
});

test("não começa sequência que não termina antes do fim do orçamento", () => {
  const deadline = 45_000;
  const need = estimateSequenceMs(3, 6, true);
  assert.ok(canStartSequence(0, deadline, 3, 6, true));
  assert.ok(canStartSequence(deadline - need, deadline, 3, 6, true));
  assert.ok(!canStartSequence(deadline - need + 1, deadline, 3, 6, true));
  // Retomando só a última parte precisa de bem menos tempo.
  assert.ok(canStartSequence(deadline - estimateSequenceMs(1, 6, false), deadline, 1, 6, false));
});

test("no meio da sequência: só manda a próxima parte se ela começa até o fim do orçamento", () => {
  assert.ok(canContinueSequence(30_000, 45_000, 6));
  assert.ok(canContinueSequence(39_000, 45_000, 6));
  assert.ok(!canContinueSequence(40_000, 45_000, 6));
});

test("intervalo entre partes sorteado dentro do mín–máx", () => {
  assert.equal(pickPartGapSeconds(3, 6, () => 0), 3);
  assert.equal(pickPartGapSeconds(3, 6, () => 0.9999), 6);
  assert.equal(pickPartGapSeconds(5, 5, () => 0.5), 5);
});
