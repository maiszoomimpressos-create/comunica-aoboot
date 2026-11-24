import { test } from "node:test";
import assert from "node:assert/strict";
import { isOptOutKeyword, normalizeOptOutText } from "@/lib/campaigns/opt-out";

test("normalizeOptOutText tira acento, pontuação e caixa", () => {
  assert.equal(normalizeOptOutText("  Sáir!! "), "SAIR");
  assert.equal(normalizeOptOutText("não   quero"), "NAO QUERO");
});

test("isOptOutKeyword reconhece só a palavra-chave exata", () => {
  for (const text of ["SAIR", "sair", "Sair.", "parar", "Não quero", "STOP", "descadastrar"]) {
    assert.equal(isOptOutKeyword(text), true, text);
  }
  for (const text of ["quero sair da fila", "cancelar", "oi", "", "sair agora"]) {
    assert.equal(isOptOutKeyword(text), false, text);
  }
});
