import { test } from "node:test";
import assert from "node:assert/strict";
import { computeReceiptDedupKey, resolveExplicitDedupKey } from "@/lib/notifications/receipt-dedup";

const base = {
  type: "corrida_mai_drive",
  to: "5546999999812",
  details: { valor_total: "R$ 16,79", distancia: "2,08 km", origem: "A", destino: "B" },
  isRideReceipt: true,
};

test("recibo repetido (mesmos dados, ordem diferente) = mesma chave", () => {
  const a = computeReceiptDedupKey(base);
  const b = computeReceiptDedupKey({
    ...base,
    to: "+55 46 99999-9812",
    details: { destino: "B", origem: "A", distancia: "2,08 km", valor_total: "R$ 16,79" },
  });
  assert.ok(a?.startsWith("c:"));
  assert.equal(a, b);
});

test("outra corrida (dado diferente) = outra chave", () => {
  const a = computeReceiptDedupKey(base);
  const b = computeReceiptDedupKey({ ...base, details: { ...base.details, valor_total: "R$ 16,80" } });
  assert.notEqual(a, b);
  assert.notEqual(a, computeReceiptDedupKey({ ...base, to: "5546999990000" }));
});

test("tipo que não é recibo de corrida não trava por conteúdo", () => {
  assert.equal(computeReceiptDedupKey({ ...base, type: "alerta_ssh", isRideReceipt: false }), null);
});

test("chave explícita vale pra qualquer tipo e ignora o conteúdo", () => {
  const a = computeReceiptDedupKey({ ...base, type: "alerta_ssh", isRideReceipt: false, explicitKey: "abc" });
  const b = computeReceiptDedupKey({ ...base, type: "alerta_ssh", isRideReceipt: false, explicitKey: "abc", details: {} });
  assert.ok(a?.startsWith("id:"));
  assert.equal(a, b);
  assert.notEqual(a, computeReceiptDedupKey({ ...base, type: "alerta_ssh", isRideReceipt: false, explicitKey: "abd" }));
});

test("id_corrida nos dados funciona como chave explícita; header tem prioridade", () => {
  assert.equal(resolveExplicitDedupKey({ details: { id_corrida: " 123 " } }), "123");
  assert.equal(resolveExplicitDedupKey({ explicitKey: "h1", details: { id_corrida: "123" } }), "h1");
  assert.equal(resolveExplicitDedupKey({ details: {} }), null);
  const a = computeReceiptDedupKey({ ...base, details: { ...base.details, id_corrida: "123" } });
  const b = computeReceiptDedupKey({ ...base, details: { id_corrida: "123" } });
  assert.equal(a, b);
});
