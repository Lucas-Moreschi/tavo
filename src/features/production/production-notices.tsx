"use client";

import { Bell, Check } from "lucide-react";
import { operationDates } from "@/shared/lib/datetime";
import type { ViewProps } from "@/shared/types/operation";
import { visitLabel } from "@/shared/lib/operation-utils";

export function ProductionNotices({ props, station }: { props: ViewProps; station: string }) {
  const { state } = props;
  const { fullDate } = operationDates(state.restaurant.timezone);
  const notices = state.calls.filter(
    (call) =>
      call.kind === "cancelamento" &&
      (station === "todas" || call.destination === (station === "direto" ? "salao" : station)),
  );
  const pending = notices.filter((call) => call.status !== "concluido");
  const history = state.items
    .filter(
      (item) =>
        item.status === "cancelado" &&
        item.sentAt &&
        (station === "todas" || item.station === station),
    )
    .sort((a, b) => (b.cancelledAt || "").localeCompare(a.cancelledAt || ""))
    .slice(0, 20);
  return (
    <>
      {pending.length > 0 && (
        <section
          className="cancellation-notices no-print"
          aria-label="Cancelamentos pendentes"
          aria-live="polite"
        >
          <h2>
            <Bell size={20} />
            Atenção aos cancelamentos ({pending.length})
          </h2>
          {pending.map((call) => (
            <div className="list-row" key={call.id}>
              <div>
                <strong>{call.message}</strong>
                <small>
                  {call.visitId && visitLabel(state, call.visitId)} · {call.actorName} ·{" "}
                  {fullDate(call.createdAt)}
                </small>
              </div>
              {(state.actor.role === "gestor" ||
                state.actor.role === call.destination ||
                (call.destination === "salao" &&
                  ["garcom", "caixa"].includes(state.actor.role))) && (
                <button
                  className="btn btn-secondary"
                  disabled={props.disabled}
                  onClick={() =>
                    props.run(() =>
                      props.command("call.status", { callId: call.id, status: "concluido" }),
                    )
                  }
                >
                  <Check size={16} />
                  Ciente
                </button>
              )}
            </div>
          ))}
        </section>
      )}
      {history.length > 0 && (
        <details className="panel cancellation-history section-gap">
          <summary>Últimos cancelamentos ({history.length})</summary>
          <div className="list-rows">
            {history.map((item) => {
              const tab = state.tabs.find((entry) => entry.id === item.tabId);
              return (
                <div className="list-row" key={item.id}>
                  <div>
                    <strong>
                      {item.quantity}× {item.name}
                    </strong>
                    <small>
                      {tab && visitLabel(state, tab.visitId)} · {tab?.label} ·{" "}
                      {fullDate(item.cancelledAt)}
                    </small>
                    <p>{item.cancelReason}</p>
                  </div>
                  <span className="badge badge-cancelado">Cancelado</span>
                </div>
              );
            })}
          </div>
        </details>
      )}
    </>
  );
}
