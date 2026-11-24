import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appendOptOutFooter,
  findUnknownVariables,
  renderCampaignMessage,
  renderSpintax,
  renderVariables,
} from "@/lib/campaigns/template";

const ctx = { name: "Maria Silva", phone: "5511912345678", businessName: "Mais Zap" };

test("renderVariables troca as variáveis conhecidas", () => {
  assert.equal(
    renderVariables("Oi {{primeiro_nome}}, aqui é da {{empresa}} ({{telefone}}) — {{nome}}", ctx),
    "Oi Maria, aqui é da Mais Zap (5511912345678) — Maria Silva"
  );
  assert.equal(renderVariables("Oi {{ NOME }}", ctx), "Oi Maria Silva");
});

test("renderVariables usa fallback e arruma espaço/pontuação quando vazio", () => {
  const noName = { ...ctx, name: null };
  assert.equal(renderVariables("Olá {{nome|cliente}}!", noName), "Olá cliente!");
  assert.equal(renderVariables("Olá {{primeiro_nome}}, tudo bem?", noName), "Olá, tudo bem?");
});

test("findUnknownVariables aponta erro de digitação", () => {
  assert.deepEqual(findUnknownVariables("Oi {{nmoe}} e {{nome}}"), ["nmoe"]);
  assert.deepEqual(findUnknownVariables("Sem variáveis"), []);
});

test("renderSpintax sorteia uma opção por grupo (rng injetado)", () => {
  assert.equal(renderSpintax("{Olá|Oi|E aí}, tudo {bem|certo}?", () => 0), "Olá, tudo bem?");
  assert.equal(renderSpintax("{Olá|Oi|E aí}, tudo {bem|certo}?", () => 0.99), "E aí, tudo certo?");
  assert.equal(renderSpintax("chave sem barra {x}", () => 0), "chave sem barra {x}");
});

test("appendOptOutFooter acrescenta só se o texto não fala em SAIR", () => {
  assert.equal(appendOptOutFooter("Promo", "Responda SAIR."), "Promo\n\nResponda SAIR.");
  assert.equal(appendOptOutFooter("Promo. Digite sair pra parar", "Responda SAIR."), "Promo. Digite sair pra parar");
  assert.equal(appendOptOutFooter("Promo", null), "Promo");
});

test("renderCampaignMessage: variáveis → variação → rodapé", () => {
  assert.equal(
    renderCampaignMessage("{Oi|Olá} {{primeiro_nome}}!", ctx, "Responda SAIR.", () => 0),
    "Oi Maria!\n\nResponda SAIR."
  );
});
