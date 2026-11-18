import { AppError } from "@/shared/lib/errors";

const formatters = new Map<string, Intl.DateTimeFormat>();
function parts(value: number, timeZone: string) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timeZone, formatter);
  }
  return Object.fromEntries(
    formatter
      .formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

export function localDate(value: string | number | Date, timeZone: string): string {
  const p = parts(new Date(value).getTime(), timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

export function localDateTime(value: string | number | Date, timeZone: string): string {
  const p = parts(new Date(value).getTime(), timeZone);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Converte o horário informado no restaurante sem usar o fuso do navegador. */
export function zonedToIso(value: string, timeZone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new AppError("Informe data e horário válidos.");
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(naive);
  if (
    year < 1900 ||
    year > 9999 ||
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59
  )
    throw new AppError("Informe data e horário válidos.");
  const offsets = new Set<number>();
  for (const delta of [-36, -12, 0, 12, 36]) {
    const instant = naive + delta * 3_600_000;
    const p = parts(instant, timeZone);
    offsets.add(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - instant);
  }
  const candidates = [...offsets]
    .map((offset) => naive - offset)
    .filter((instant) => localDateTime(instant, timeZone) === value);
  if (!candidates.length)
    throw new AppError(`Esse horário não existe no fuso ${timeZone}. Escolha outro horário.`);
  if (candidates.length > 1)
    throw new AppError(
      `Esse horário é ambíguo no fuso ${timeZone}. Escolha um horário fora da mudança de relógio.`,
    );
  return new Date(candidates[0]).toISOString();
}

export function addDays(value: string, days: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AppError("Informe uma data válida.");
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new AppError("Informe uma data válida.");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function startOfDay(value: string, timeZone: string): string {
  addDays(value, 0);
  // Em fusos que avançam à meia-noite, o dia começa no primeiro horário existente.
  for (let minute = 0; minute < 180; minute++) {
    const clock = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
    try {
      return zonedToIso(`${value}T${clock}`, timeZone);
    } catch (error) {
      if (!(error instanceof AppError) || !error.message.includes("não existe")) throw error;
    }
  }
  throw new AppError("Não foi possível determinar o início do dia nesse fuso.");
}

export function dateRange(from: string, through: string, timeZone: string) {
  if (from > through) throw new AppError("A data inicial deve ser anterior ou igual à final.");
  return { since: startOfDay(from, timeZone), until: startOfDay(addDays(through, 1), timeZone) };
}

export function operationDates(timeZone: string) {
  const display = (value: string | null, options: Intl.DateTimeFormatOptions) =>
    value
      ? new Intl.DateTimeFormat("pt-BR", { ...options, timeZone }).format(new Date(value))
      : "—";
  return {
    shortTime: (value: string | null) => display(value, { hour: "2-digit", minute: "2-digit" }),
    shortDate: (value: string | null) => display(value, { day: "2-digit", month: "short" }),
    fullDate: (value: string | null) =>
      display(value, {
        year: "numeric",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
  };
}
