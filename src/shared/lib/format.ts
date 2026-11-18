export const money = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const quantity = (milli: number, unit = "") =>
  `${(milli / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}${unit ? ` ${unit}` : ""}`;
export function centsInput(value: string | number): number {
  const text = String(value).trim().replace(/R\$/g, "").replace(/\s/g, "");
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  const number = Number(normalized);
  return Number.isFinite(number) ? Math.round(number * 100) : NaN;
}
export function splitCents(total: number, parts: number): number[] {
  if (
    !Number.isSafeInteger(total) ||
    total < 0 ||
    !Number.isInteger(parts) ||
    parts < 1 ||
    parts > 100
  )
    return [];
  const base = Math.floor(total / parts);
  return Array.from({ length: parts }, (_, i) => base + (i < total % parts ? 1 : 0));
}
