import test from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  dateRange,
  localDate,
  localDateTime,
  operationDates,
  zonedToIso,
} from "../../src/shared/lib/datetime";

test("datas operacionais usam o fuso do restaurante, inclusive na virada do dia", () => {
  const instant = "2026-11-16T03:30:00.000Z";
  assert.equal(localDate(instant, "America/Manaus"), "2026-11-15");
  assert.equal(localDate(instant, "America/Sao_Paulo"), "2026-11-16");
  assert.equal(localDateTime(instant, "America/Manaus"), "2026-11-15T23:30");
  assert.equal(zonedToIso("2026-11-15T23:30", "America/Manaus"), instant);
  assert.equal(operationDates("America/Manaus").shortTime(instant), "23:30");
  assert.equal(operationDates("America/Sao_Paulo").shortTime(instant), "00:30");
});
test("intervalo inclui o dia final e exclui a meia-noite seguinte no fuso escolhido", () => {
  assert.deepEqual(dateRange("2026-11-15", "2026-11-16", "America/Manaus"), {
    since: "2026-11-15T04:00:00.000Z",
    until: "2026-11-17T04:00:00.000Z",
  });
  assert.equal(addDays("2024-02-28", 1), "2024-02-29");
  assert.throws(() => dateRange("2026-11-17", "2026-11-16", "America/Sao_Paulo"));
  assert.throws(() => zonedToIso("2026-02-30T12:00", "America/Sao_Paulo"));
  assert.throws(() => dateRange("", "", "America/Sao_Paulo"));
});
test("mudanças de relógio não silenciam horários inexistentes ou ambíguos", () => {
  assert.throws(() => zonedToIso("2026-03-08T02:30", "America/New_York"), /não existe/);
  assert.throws(() => zonedToIso("2026-11-01T01:30", "America/New_York"), /ambíguo/);
  assert.deepEqual(dateRange("2018-11-04", "2018-11-04", "America/Sao_Paulo"), {
    since: "2018-11-04T03:00:00.000Z",
    until: "2018-11-05T02:00:00.000Z",
  });
});
