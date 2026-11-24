import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isRideReceiptNotificationType,
  renderAppPromoCaption,
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

test("legenda sempre leva o link", () => {
  const link = "https://play.google.com/store/apps/details?id=x";
  assert.ok(renderAppPromoCaption(null, { link, businessName: "MAI" }).includes(link));
  assert.equal(renderAppPromoCaption("Baixe o app da {{nome_empresa}}", { link, businessName: "MAI" }), `Baixe o app da MAI\n\n${link}`);
  assert.equal(renderAppPromoCaption("App: {{link}}", { link, businessName: "MAI" }), `App: ${link}`);
});

test("atraso entre 3 e 5 minutos", () => {
  for (let i = 0; i < 50; i++) {
    const d = randomAppPromoDelayMs();
    assert.ok(d >= APP_PROMO_MIN_DELAY_MS && d <= APP_PROMO_MAX_DELAY_MS);
  }
});
