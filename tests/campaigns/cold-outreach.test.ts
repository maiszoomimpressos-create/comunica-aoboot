import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyColdPacing,
  coldRemainingToday,
  ensureOptOutInstruction,
  firstMessageIdentifiesBusiness,
  hasOptOutInstruction,
  resolveOptOutFooter,
} from "@/lib/campaigns/cold-outreach";
import { renderSequence, type CampaignPart } from "@/lib/campaigns/sequence";
import { splitCaption } from "@/lib/campaigns/caption";
import { DEFAULT_OPT_OUT_FOOTER } from "@/config/whatsapp-campaign-defaults";

const ctx = { name: "Hotel Central", phone: "5541991112222", businessName: "Mais Zap" };
const IMG = "https://blob.example.com/promo.jpg";
const text = (t: string): CampaignPart => ({ type: "text", text: t, mediaUrl: null, fileName: null });
const image = (caption: string | null): CampaignPart => ({ type: "image", text: caption, mediaUrl: IMG, fileName: null });
const video = (caption: string | null): CampaignPart => ({ type: "video", text: caption, mediaUrl: IMG, fileName: null });
const audio = (): CampaignPart => ({ type: "audio", text: null, mediaUrl: "https://blob.example.com/a.ogg", fileName: null });

/** Igual ao dispatcher numa campanha fria. */
function coldSequence(parts: CampaignPart[], settings = { optOutFooterEnabled: false, optOutFooterText: null as string | null }) {
  const footer = resolveOptOutFooter(settings, true)!;
  return ensureOptOutInstruction(renderSequence(parts, ctx, footer), footer);
}

/** O que chega no WhatsApp tem a instrução de SAIR (legenda longa
 * dividida conta as duas mensagens). */
function deliveredHasSair(seq: ReturnType<typeof coldSequence>): boolean {
  return seq.some((p) => {
    if (p.type === "audio") return false;
    const { caption, rest } = p.type === "text" ? { caption: p.text, rest: "" } : splitCaption(p.text);
    return hasOptOutInstruction(caption) || hasOptOutInstruction(rest);
  });
}

test("frio: rodapé obrigatório mesmo desligado; texto sem instrução cai no padrão", () => {
  assert.equal(resolveOptOutFooter({ optOutFooterEnabled: false, optOutFooterText: null }, true), DEFAULT_OPT_OUT_FOOTER);
  assert.equal(resolveOptOutFooter({ optOutFooterEnabled: false, optOutFooterText: "Digite SAIR para não receber." }, true), "Digite SAIR para não receber.");
  assert.equal(resolveOptOutFooter({ optOutFooterEnabled: true, optOutFooterText: "Não curtiu? SAIR" }, true), DEFAULT_OPT_OUT_FOOTER);
  // campanha normal continua respeitando o painel
  assert.equal(resolveOptOutFooter({ optOutFooterEnabled: false, optOutFooterText: null }, false), null);
});

test("frio: só texto → SAIR no fim", () => {
  const seq = coldSequence([text("Olá, aqui é da {{empresa}}.")]);
  assert.equal(seq.length, 1);
  assert.ok(seq[0].text.endsWith(DEFAULT_OPT_OUT_FOOTER));
});

test("frio: só mídia sem legenda → SAIR vira legenda da última mídia", () => {
  const seq = coldSequence([image(null), video(null)]);
  assert.equal(seq.length, 2);
  assert.equal(seq[0].text, "");
  assert.equal(seq[1].text, DEFAULT_OPT_OUT_FOOTER);
  assert.ok(deliveredHasSair(seq));
});

test("frio: só áudio → mensagem de texto extra com SAIR", () => {
  const seq = coldSequence([audio(), audio()]);
  assert.equal(seq.length, 3);
  assert.equal(seq[2].type, "text");
  assert.equal(seq[2].text, DEFAULT_OPT_OUT_FOOTER);
});

test("frio: texto que já tem a instrução não duplica", () => {
  const seq = coldSequence([text("Oi! Se não quiser receber, responda SAIR."), image("Veja")]);
  assert.equal(seq.filter((p) => /SAIR/.test(p.text)).length, 1);
  assert.equal(seq[1].text, "Veja");
});

test("frio: 'sair' solto no texto NÃO conta como instrução (renderSequence pularia o rodapé)", () => {
  const seq = coldSequence([text("Bora sair pra jantar? Promo da {{empresa}}")]);
  assert.ok(seq[0].text.endsWith(DEFAULT_OPT_OUT_FOOTER));
  assert.ok(hasOptOutInstruction(seq[0].text));
});

test("frio: legenda longa — SAIR chega na mensagem complementar", () => {
  const seq = coldSequence([image("Palavra ".repeat(200).trim())]);
  assert.ok(deliveredHasSair(seq));
});

test("instrução de SAIR reconhecida", () => {
  assert.ok(hasOptOutInstruction(DEFAULT_OPT_OUT_FOOTER));
  assert.ok(hasOptOutInstruction("Pra parar, envie *SAIR*"));
  assert.ok(!hasOptOutInstruction("SAIR"));
  assert.ok(!hasOptOutInstruction("vamos sair hoje"));
});

test("ritmo e limite de contato frio", () => {
  const rate = {
    sendWindowStart: "07:30",
    sendWindowEnd: "19:30",
    batchSize: 5,
    minMessageIntervalSeconds: 12,
    maxMessageIntervalSeconds: 18,
    minBatchPauseSeconds: 15,
    maxBatchPauseSeconds: 20,
  };
  const cold = applyColdPacing(rate, { coldMinMessageIntervalSeconds: 60, coldMaxMessageIntervalSeconds: 120 });
  assert.equal(cold.minMessageIntervalSeconds, 60);
  assert.equal(cold.maxMessageIntervalSeconds, 120);
  // se o normal já for maior, fica o maior
  const slow = applyColdPacing({ ...rate, minMessageIntervalSeconds: 90, maxMessageIntervalSeconds: 200 }, { coldMinMessageIntervalSeconds: 60, coldMaxMessageIntervalSeconds: 120 });
  assert.equal(slow.minMessageIntervalSeconds, 90);
  assert.equal(slow.maxMessageIntervalSeconds, 200);
  assert.equal(coldRemainingToday(30, 12), 18);
  assert.equal(coldRemainingToday(30, 45), 0);
});

test("1ª mensagem identifica a empresa?", () => {
  assert.ok(firstMessageIdentifiesBusiness([image(null), text("Olá, aqui é da {{empresa}}")], "Mais Zap"));
  assert.ok(firstMessageIdentifiesBusiness([text("Oi, aqui é da Mais Zap!")], "Mais Zap"));
  assert.ok(!firstMessageIdentifiesBusiness([text("Oi {{nome}}, promoção!"), text("{{empresa}}")], "Mais Zap"));
  assert.ok(!firstMessageIdentifiesBusiness([audio()], "Mais Zap"));
});
