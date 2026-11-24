import { test } from "node:test";
import assert from "node:assert/strict";
import { MEDIA_CAPTION_MAX, splitCaption } from "@/lib/campaigns/caption";
import { renderCampaignMessage, usesContactName } from "@/lib/campaigns/template";

test("texto curto vai inteiro na legenda da imagem", () => {
  const text = renderCampaignMessage(
    "Oi {{primeiro_nome}}! Olha a promoção da {{empresa}}.",
    { name: "Maria Silva", phone: "5511912345678", businessName: "Mais Zap" },
    "Para não receber mais mensagens, responda SAIR."
  );
  const split = splitCaption(text);
  assert.equal(split.caption, "Oi Maria! Olha a promoção da Mais Zap.\n\nPara não receber mais mensagens, responda SAIR.");
  assert.equal(split.rest, "");
});

test("texto longo: legenda até o limite e o resto em seguida, sem perder nada", () => {
  const paragraph = "Lorem ipsum dolor sit amet. ".repeat(30).trim(); // ~840 chars
  const text = `${paragraph}\n\n${paragraph}`;
  const split = splitCaption(text);
  assert.ok(split.caption.length <= MEDIA_CAPTION_MAX);
  assert.ok(split.rest.length > 0);
  assert.equal(split.caption, paragraph); // corta no fim do parágrafo
  assert.equal(`${split.caption}\n\n${split.rest}`, text);
});

test("sem quebra boa: corta em palavra, nunca no meio", () => {
  const text = "palavra ".repeat(300).trim();
  const split = splitCaption(text, 100);
  assert.ok(split.caption.length <= 100);
  assert.ok(!split.caption.endsWith("palavr"));
  const words = (split.caption + " " + split.rest).split(" ");
  assert.ok(words.every((w) => w === "palavra"));
});

test("usesContactName detecta {{nome}} e {{primeiro_nome}}", () => {
  assert.equal(usesContactName("Oi {{nome|cliente}}"), true);
  assert.equal(usesContactName("Oi {{ PRIMEIRO_NOME }}"), true);
  assert.equal(usesContactName("Promo da {{empresa}}"), false);
});
