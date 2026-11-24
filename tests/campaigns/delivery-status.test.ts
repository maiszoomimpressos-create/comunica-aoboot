import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractProviderMessageId,
  mapProviderStatus,
  parseMessageStatusCallback,
  statusesUpgradableTo,
} from "@/lib/campaigns/delivery-status";

test("mapProviderStatus", () => {
  assert.equal(mapProviderStatus("RECEIVED"), "DELIVERED");
  assert.equal(mapProviderStatus("read"), "READ");
  assert.equal(mapProviderStatus("PLAYED"), "READ");
  assert.equal(mapProviderStatus("SENT"), null);
  assert.equal(mapProviderStatus("READ_BY_ME"), null);
});

test("parseMessageStatusCallback lê ids e momment", () => {
  const parsed = parseMessageStatusCallback({
    type: "MessageStatusCallback",
    status: "RECEIVED",
    ids: ["3EB0ABC", "3EB0DEF"],
    momment: 1795000000000,
    phone: "5511912345678",
  });
  assert.deepEqual(parsed, {
    update: "DELIVERED",
    messageIds: ["3EB0ABC", "3EB0DEF"],
    at: new Date(1795000000000),
  });
});

test("parseMessageStatusCallback ignora o que não é status útil", () => {
  assert.equal(parseMessageStatusCallback({ type: "ReceivedCallback", status: "READ", ids: ["x"] }), null);
  assert.equal(parseMessageStatusCallback({ type: "MessageStatusCallback", status: "SENT", ids: ["x"] }), null);
  assert.equal(parseMessageStatusCallback({ type: "MessageStatusCallback", status: "READ", ids: [] }), null);
  assert.equal(parseMessageStatusCallback(null), null);
});

test("statusesUpgradableTo nunca rebaixa", () => {
  assert.deepEqual(statusesUpgradableTo("DELIVERED"), ["SENT"]);
  assert.deepEqual(statusesUpgradableTo("READ"), ["SENT", "DELIVERED"]);
});

test("extractProviderMessageId prioriza messageId", () => {
  assert.equal(extractProviderMessageId({ zaapId: "z", messageId: "m", id: "i" }), "m");
  assert.equal(extractProviderMessageId({ zaapId: "z" }), "z");
  assert.equal(extractProviderMessageId("texto"), null);
});
