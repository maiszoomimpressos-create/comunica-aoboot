import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSchedule, isWithinSendWindow, startOfLocalDay } from "@/lib/campaigns/schedule";

const settings = {
  sendWindowStart: "08:00",
  sendWindowEnd: "20:00",
  batchSize: 3,
  minMessageIntervalSeconds: 10,
  maxMessageIntervalSeconds: 10,
  minBatchPauseSeconds: 100,
  maxBatchPauseSeconds: 100,
};

// 2026-11-23 10:00 em São Paulo (UTC-3) = 13:00Z
const tenAmSp = new Date("2026-11-23T13:00:00.000Z");

test("isWithinSendWindow usa o fuso de São Paulo", () => {
  assert.equal(isWithinSendWindow(tenAmSp, settings), true);
  assert.equal(isWithinSendWindow(new Date("2026-11-23T10:59:00.000Z"), settings), false); // 07:59 SP
  assert.equal(isWithinSendWindow(new Date("2026-11-23T11:00:00.000Z"), settings), true); // 08:00 SP
  assert.equal(isWithinSendWindow(new Date("2026-11-23T23:00:00.000Z"), settings), false); // 20:00 SP (fim exclusivo)
});

test("computeSchedule espaça pelo intervalo e pausa a cada lote", () => {
  const schedule = computeSchedule(5, tenAmSp, settings);
  const gaps = schedule.slice(1).map((d, i) => (d.getTime() - schedule[i].getTime()) / 1000);
  assert.deepEqual(gaps, [10, 10, 100, 10]);
  assert.equal(schedule[0].toISOString(), tenAmSp.toISOString());
});

test("computeSchedule começa na abertura da janela quando iniciado de madrugada", () => {
  const schedule = computeSchedule(1, new Date("2026-11-23T06:00:00.000Z"), settings); // 03:00 SP
  assert.equal(schedule[0].toISOString(), "2026-11-23T11:00:00.000Z"); // 08:00 SP
});

test("computeSchedule rola pro dia seguinte quando passa do fim da janela", () => {
  const nearEnd = new Date("2026-11-23T22:59:55.000Z"); // 19:59:55 SP
  const schedule = computeSchedule(2, nearEnd, settings);
  assert.equal(schedule[1].toISOString(), "2026-11-24T11:00:00.000Z"); // amanhã 08:00 SP
});

test("computeSchedule com zero destinatários", () => {
  assert.deepEqual(computeSchedule(0, tenAmSp, settings), []);
});

test("startOfLocalDay devolve meia-noite de São Paulo", () => {
  assert.equal(startOfLocalDay(tenAmSp).toISOString(), "2026-11-23T03:00:00.000Z");
});
