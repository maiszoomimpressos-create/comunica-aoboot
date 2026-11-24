import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeRideRequestSource,
  planPostNotificationPromotions,
  resolveRideRequestSource,
  rideAllowsPromotions,
} from "../../src/lib/notifications/ride-request-source";

test("normaliza a origem do pedido (acentos, caixa, espaços, sinônimos)", () => {
  assert.equal(normalizeRideRequestSource("app"), "app");
  assert.equal(normalizeRideRequestSource("APP"), "app");
  assert.equal(normalizeRideRequestSource("App Passageiro"), "app");
  assert.equal(normalizeRideRequestSource("aplicativo"), "app");
  assert.equal(normalizeRideRequestSource("WhatsApp"), "whatsapp");
  assert.equal(normalizeRideRequestSource("motorista"), "motorista");
  assert.equal(normalizeRideRequestSource("app-motorista"), "motorista");
  assert.equal(normalizeRideRequestSource("Maçaneta"), "macaneta");
  assert.equal(normalizeRideRequestSource("OFFLINE_MANUAL"), "macaneta");
  assert.equal(normalizeRideRequestSource("telefone"), "outro");
  assert.equal(normalizeRideRequestSource(""), null);
  assert.equal(normalizeRideRequestSource("   "), null);
  assert.equal(normalizeRideRequestSource(undefined), null);
});

test("requestSource do corpo tem prioridade sobre details.canal_pedido", () => {
  assert.equal(resolveRideRequestSource({ requestSource: "whatsapp", details: { canal_pedido: "app" } }), "whatsapp");
  assert.equal(resolveRideRequestSource({ details: { canal_pedido: "app" } }), "app");
  assert.equal(resolveRideRequestSource({ details: { origem_pedido: "maçaneta" } }), "macaneta");
  assert.equal(resolveRideRequestSource({ requestSource: "", details: { canal_pedido: "motorista" } }), "motorista");
});

test("details.origem é o ENDEREÇO de embarque, nunca o canal", () => {
  assert.equal(resolveRideRequestSource({ details: { origem: "app" } }), null);
  assert.equal(resolveRideRequestSource({ details: { origem: "Rua X, 580" } }), null);
});

test("só 'app' bloqueia; ausente envia como antes", () => {
  assert.equal(rideAllowsPromotions("app"), false);
  for (const s of ["whatsapp", "motorista", "macaneta", "outro", null] as const) {
    assert.equal(rideAllowsPromotions(s), true);
  }
});

test("recibo pedido pelo app: nem imagem da Play Store, nem Publicidade", () => {
  assert.deepEqual(planPostNotificationPromotions({ isRideReceipt: true, source: "app", appPromoActive: true }), {
    scheduleAppPromo: false,
    queueAdvertisement: false,
  });
  assert.deepEqual(planPostNotificationPromotions({ isRideReceipt: true, source: "app", appPromoActive: false }), {
    scheduleAppPromo: false,
    queueAdvertisement: false,
  });
});

test("recibo fora do app com card ligado: só a imagem (Publicidade não duplica)", () => {
  for (const source of ["whatsapp", "motorista", "macaneta", null] as const) {
    assert.deepEqual(planPostNotificationPromotions({ isRideReceipt: true, source, appPromoActive: true }), {
      scheduleAppPromo: true,
      queueAdvertisement: false,
    });
  }
});

test("recibo fora do app sem card ligado: Publicidade como antes", () => {
  assert.deepEqual(planPostNotificationPromotions({ isRideReceipt: true, source: "macaneta", appPromoActive: false }), {
    scheduleAppPromo: false,
    queueAdvertisement: true,
  });
  assert.deepEqual(planPostNotificationPromotions({ isRideReceipt: true, source: null, appPromoActive: false }), {
    scheduleAppPromo: false,
    queueAdvertisement: true,
  });
});

test("outras funções: Publicidade como sempre, mesmo com origem 'app'", () => {
  assert.deepEqual(planPostNotificationPromotions({ isRideReceipt: false, source: "app", appPromoActive: true }), {
    scheduleAppPromo: false,
    queueAdvertisement: true,
  });
});
