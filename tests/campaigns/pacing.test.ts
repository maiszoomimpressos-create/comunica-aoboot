import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideAfterSend,
  earliestSendTime,
  isTemporaryFailure,
  pickGapSeconds,
  remainingToday,
  retryDelayMs,
  shouldAutoPauseForFailures,
  shouldAutoPauseForInvalidRate,
  warmupDailyCap,
  WARMUP_SCHEDULE,
} from "@/lib/campaigns/pacing";

const gap = {
  batchSize: 3,
  minMessageIntervalSeconds: 20,
  maxMessageIntervalSeconds: 40,
  minBatchPauseSeconds: 300,
  maxBatchPauseSeconds: 300,
};
const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-11-23T13:00:00.000Z");

test("pickGapSeconds: intervalo normal dentro do min/max, pausa de lote a cada batchSize", () => {
  assert.equal(pickGapSeconds(1, gap, () => 0), 20);
  assert.equal(pickGapSeconds(1, gap, () => 0.9999), 40);
  assert.equal(pickGapSeconds(3, gap, () => 0.5), 300);
  assert.equal(pickGapSeconds(0, gap, () => 0), 20); // primeira mensagem não é pausa de lote
});

test("earliestSendTime: nunca antes de lastSentAt + gap (sem rajada no backlog)", () => {
  const overdue = new Date(now.getTime() - 60 * 60 * 1000); // vencido há 1 h
  const lastSent = new Date(now.getTime() - 5_000);
  assert.equal(earliestSendTime(overdue, lastSent, 30).getTime(), lastSent.getTime() + 30_000);
  assert.equal(earliestSendTime(overdue, null, 30).getTime(), overdue.getTime());
  const future = new Date(now.getTime() + 10 * 60 * 1000);
  assert.equal(earliestSendTime(future, lastSent, 30).getTime(), future.getTime());
});

test("warmupDailyCap sobe por dia e libera depois da rampa", () => {
  assert.equal(warmupDailyCap(null, now), WARMUP_SCHEDULE[0]);
  assert.equal(warmupDailyCap(now, now), 30);
  assert.equal(warmupDailyCap(new Date(now.getTime() - 3 * DAY), now), 120);
  assert.equal(warmupDailyCap(new Date(now.getTime() - 30 * DAY), now), Number.POSITIVE_INFINITY);
});

test("remainingToday respeita o menor entre limite diário e aquecimento", () => {
  assert.equal(remainingToday({ dailyLimit: 200, dailySentCount: 10, warmupEnabled: true, warmupStartedAt: now }, now), 20);
  assert.equal(remainingToday({ dailyLimit: 200, dailySentCount: 10, warmupEnabled: false, warmupStartedAt: null }, now), 190);
  assert.equal(remainingToday({ dailyLimit: 200, dailySentCount: 250, warmupEnabled: false, warmupStartedAt: null }, now), 0);
  assert.equal(
    remainingToday({ dailyLimit: null, dailySentCount: 999, warmupEnabled: false, warmupStartedAt: null }, now),
    Number.POSITIVE_INFINITY
  );
});

test("isTemporaryFailure: rede/timeout/429/5xx sim; 4xx definitivos não", () => {
  assert.equal(isTemporaryFailure({ networkError: true }), true);
  assert.equal(isTemporaryFailure({ httpStatus: 429 }), true);
  assert.equal(isTemporaryFailure({ httpStatus: 503 }), true);
  assert.equal(isTemporaryFailure({ httpStatus: 408 }), true);
  assert.equal(isTemporaryFailure({ httpStatus: 400 }), false);
  assert.equal(isTemporaryFailure({ httpStatus: 401 }), false);
  assert.equal(isTemporaryFailure({}), false);
});

test("retryDelayMs dobra e tem teto de 30 min", () => {
  assert.equal(retryDelayMs(1), 2 * 60 * 1000);
  assert.equal(retryDelayMs(2), 4 * 60 * 1000);
  assert.equal(retryDelayMs(10), 30 * 60 * 1000);
});

test("decideAfterSend: só re-tenta erro temporário e até maxAttempts", () => {
  assert.deepEqual(decideAfterSend(true, {}, 1, 3, now), { kind: "sent" });
  assert.deepEqual(decideAfterSend(false, { httpStatus: 400 }, 1, 3, now), { kind: "failed" });
  const retry = decideAfterSend(false, { httpStatus: 500 }, 1, 3, now);
  assert.equal(retry.kind, "retry");
  assert.equal(retry.kind === "retry" && retry.at.getTime(), now.getTime() + 2 * 60 * 1000);
  assert.deepEqual(decideAfterSend(false, { networkError: true }, 3, 3, now), { kind: "failed" });
});

test("disjuntor de falhas seguidas", () => {
  assert.equal(shouldAutoPauseForFailures(["FAILED", "FAILED", "FAILED"], 3), true);
  assert.equal(shouldAutoPauseForFailures(["FAILED", "SENT", "FAILED"], 3), false);
  assert.equal(shouldAutoPauseForFailures(["FAILED", "FAILED"], 3), false);
  assert.equal(shouldAutoPauseForFailures(["FAILED", "FAILED", "FAILED", "SENT"], 3), true);
});

test("disjuntor de lista ruim só depois da amostra mínima", () => {
  assert.equal(shouldAutoPauseForInvalidRate(10, 15), false);
  assert.equal(shouldAutoPauseForInvalidRate(7, 20), true);
  assert.equal(shouldAutoPauseForInvalidRate(6, 20), false);
});
