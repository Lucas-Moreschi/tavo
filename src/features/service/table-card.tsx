"use client";

import { Clock3, Plus, Users } from "lucide-react";
import { money, quantity } from "@/shared/lib/format";
import { elapsed, tabTotals } from "@/shared/lib/operation-utils";
import type { ViewProps } from "@/shared/types/operation";
import { openVisit } from "@/features/service/open-visit";
import { number } from "@/shared/ui/form-fields";

export function TableCard(props: ViewProps & { tableId: string; compact?: boolean }) {
  const { state, tableId, compact } = props;
  const table = state.tables.find((entry) => entry.id === tableId)!;
  const occupancy = state.occupancies.find(
    (entry) => entry.tableId === tableId && !entry.releasedAt,
  );
  const visit = state.visits.find((entry) => entry.id === occupancy?.visitId);
  const tabs = state.tabs.filter((tab) => tab.visitId === visit?.id);
  const items = state.items.filter((item) => tabs.some((tab) => tab.id === item.tabId));
  const ready = items.some(
    (item) =>
      item.status !== "cancelado" &&
      (item.readyQuantity ?? (item.status === "pronto" ? item.quantity : 0)) >
        (item.deliveredQuantity ?? 0),
  );
  const total = tabs.reduce((sum, tab) => sum + tabTotals(state, tab.id).balanceCents, 0);
  const status = !visit ? "livre" : ready ? "pronto" : "ocupada";
  return (
    <button
      className={`table-card table-${status} ${compact ? "table-card-compact" : ""}`}
      onClick={() => (visit ? props.inspect(visit.id) : openVisit(props, table.id))}
      disabled={!visit && (props.disabled || !["gestor", "garcom"].includes(state.actor.role))}
    >
      <div className="table-card-top">
        <span className="table-number">{String(table.number).padStart(2, "0")}</span>
        <span className={`table-state state-${status}`}>
          <i />
          {!visit ? "Livre" : ready ? "Pronto para servir" : "Em atendimento"}
        </span>
      </div>
      <div className="table-card-middle">
        <strong>Mesa {String(table.number).padStart(2, "0")}</strong>
        <span>
          <Users size={13} />
          {visit ? `${visit.people} pessoas` : `${table.capacity} lugares`}
          {visit?.groupId && " · Agrupada"}
        </span>
      </div>
      <div className="table-card-bottom">
        {visit ? (
          <>
            <span>
              <Clock3 size={12} />
              {elapsed(visit.openedAt)}
            </span>
            <strong>{money(total)}</strong>
          </>
        ) : (
          <>
            <span>{table.sector || "Salão principal"}</span>
            <Plus size={16} />
          </>
        )}
      </div>
    </button>
  );
}
