import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isRideReceiptNotificationType,
  renderAppPromoImageCaption,
  renderAppPromoLinkMessage,
  renderAppPromoLinkTitle,
  renderAppPromoLinkDescription,
  randomAppPromoLinkGapMs,
  randomAppPromoDelayMs,
  APP_PROMO_MIN_DELAY_MS,
  APP_PROMO_MAX_DELAY_MS,
} from "../../src/config/ride-receipt-app-promo";

test("recibo de corrida: tipo fixo e a função corrida_mai_drive", () => {
  assert.equal(isRideReceiptNotificationType("corrida_concluida"), true);
  assert.equal(isRideReceiptNotificationType("corrida_mai_drive"), true);
  assert.equal(isRideReceiptNotificationType("convite_app"), false);
  assert.equal(isRideReceiptNotificationType("compra_confirmada"), false);
  assert.equal(isRideReceiptNotificationType(null), false);
  assert.equal(isRideReceiptNotificationType(""), false);
});

test("legenda da imagem NUNCA leva link (nem {{link}} nem URL colada)", () => {
  const link = "https://play.google.com/store/apps/details?id=com.maidrive.passenger";
  const padrao = renderAppPromoImageCaption(null, { businessName: "MAI Drive", link });
  assert.ok(padrao.startsWith("Valeu pela corrida!"));
  assert.ok(padrao.includes("*MAI Drive*"));
  assert.ok(!padrao.includes("http"));
  const antiga = "Valeu pela corrida! 🚗💛 Baixa agora 👇\n{{link}}\nA gente te espera na próxima! 😉";
  assert.equal(renderAppPromoImageCaption(antiga, { businessName: "X", link }), "Valeu pela corrida! 🚗💛 Baixa agora 👇\n\nA gente te espera na próxima! 😉");
  const colada = `Valeu! Baixe: ${link}`;
  assert.equal(renderAppPromoImageCaption(colada, { businessName: "X", link }), "Valeu! Baixe:");
  assert.ok(!renderAppPromoImageCaption("só https://x.com", { businessName: "X" }).includes("https"));
});

test("mensagem do link: convite + link SEMPRE na última linha (exigência do send-link)", () => {
  const link = "https://play.google.com/store/apps/details?id=x";
  assert.equal(renderAppPromoLinkMessage(null, { link, businessName: "MAI" }), `Baixa agora, leva 1 minutinho 👇\n${link}`);
  assert.equal(renderAppPromoLinkMessage("Baixe o app {{link}} já!", { link, businessName: "MAI" }), `Baixe o app  já!\n${link}`);
  assert.equal(renderAppPromoLinkMessage("   ", { link, businessName: "MAI" }), `Baixa agora, leva 1 minutinho 👇\n${link}`);
  const msg = renderAppPromoLinkMessage("App da {{nome_empresa}}", { link, businessName: "MAI" });
  assert.ok(msg.endsWith(link));
  assert.ok(msg.startsWith("App da MAI"));
});

test("título e descrição da prévia", () => {
  assert.equal(renderAppPromoLinkTitle(null, "MAI Drive"), "MAI Drive");
  assert.equal(renderAppPromoLinkTitle("MAI Drive Passageiro", "X"), "MAI Drive Passageiro");
  assert.equal(renderAppPromoLinkDescription(null, "X"), "Baixe grátis na Google Play");
  assert.ok(renderAppPromoLinkTitle("a".repeat(200), "X").length <= 80);
});

test("intervalo entre imagem e link: 3 a 6 s", () => {
  for (let i = 0; i < 50; i++) {
    const d = randomAppPromoLinkGapMs();
    assert.ok(d >= 3000 && d <= 6000);
  }
});

test("atraso entre 3 e 5 minutos", () => {
  for (let i = 0; i < 50; i++) {
    const d = randomAppPromoDelayMs();
    assert.ok(d >= APP_PROMO_MIN_DELAY_MS && d <= APP_PROMO_MAX_DELAY_MS);
  }
});
