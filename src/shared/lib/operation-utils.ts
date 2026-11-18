import type { AppSnapshot } from "@/domain/types";

export { tabTotals } from "@/domain/finance";
export const elapsed = (value: string) => {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
};
export const roleNames: Record<string, string> = {
  gestor: "Gestor",
  garcom: "Garçom",
  caixa: "Caixa",
  cozinha: "Cozinha",
  bar: "Bar",
};
export const channelNames: Record<string, string> = {
  salao: "Salão",
  balcao: "Balcão",
  retirada: "Retirada",
  delivery: "Delivery",
};
export const statusNames: Record<string, string> = {
  rascunho: "Rascunho",
  enviado: "Na fila",
  preparo: "Em preparo",
  pronto: "Pronto",
  entregue: "Entregue",
  cancelado: "Cancelado",
  aberta: "Aberta",
  fechada: "Fechada",
  confirmada: "Confirmada",
  chegou: "Chegou",
  cancelada: "Cancelada",
  ausente: "Não compareceu",
  aguardando: "Aguardando",
  chamado: "Chamado",
  atendido: "Atendido",
  aberto: "Aberto",
  concluido: "Concluído",
  despachado: "Despachado",
};
export function visitLabel(state: AppSnapshot, visitId: string) {
  const visit = state.visits.find((entry) => entry.id === visitId);
  const tables = state.occupancies
    .filter((entry) => entry.visitId === visitId && !entry.releasedAt)
    .map((entry) => state.tables.find((table) => table.id === entry.tableId)?.number)
    .filter(Boolean);
  return tables.length
    ? `Mesa ${tables.join(" + ")}`
    : visit?.label || channelNames[visit?.channel ?? "salao"];
}
