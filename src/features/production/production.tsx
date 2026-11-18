"use client";

import { ProductionNotices } from "@/features/production/production-notices";
import { useState } from "react";
import { Check, CheckCheck, ChefHat, Clock3, Printer, ShoppingBag } from "lucide-react";
import { quantity } from "@/shared/lib/format";
import { elapsed, visitLabel } from "@/shared/lib/operation-utils";
import type { ViewProps } from "@/shared/types/operation";
import { Heading } from "@/shared/ui/primitives";
import { field, number } from "@/shared/ui/form-fields";

export function ProductionView(props: ViewProps) {
  const { state } = props;
  const [station, setStation] = useState(
    state.actor.role === "bar" ? "bar" : state.actor.role === "cozinha" ? "cozinha" : "todas",
  );
  const items = state.items.filter(
    (item) =>
      ["enviado", "preparo", "pronto"].includes(item.status) &&
      (station === "todas" || item.station === station),
  );
  function advance(itemId: string, action: string, max: number) {
    props.edit({
      title:
        action === "item.start"
          ? "Iniciar preparo / separação"
          : action === "item.ready"
            ? "Concluir preparo"
            : "Confirmar entrega",
      description: "A quantidade pode ser parcial. O restante continua na produção.",
      fields: [{ ...field("quantity", "Quantidade", "number"), min: 1 }],
      initial: { quantity: max },
      submitLabel: "Confirmar",
      submit: async (values) => {
        await props.command(action, { itemId, quantity: number(values, "quantity") });
      },
    });
  }
  return (
    <>
      <Heading
        eyebrow="OPERAÇÃO CONECTADA"
        title="Cozinha e bar"
        description="Cada pedido no seu tempo. Toda a equipe no mesmo ritmo."
      >
        <button className="btn btn-secondary" onClick={() => window.print()}>
          <Printer size={16} />
          Imprimir fila
        </button>
      </Heading>
      <div className="filter-bar">
        <div className="segmented">
          {["todas", "cozinha", "bar", "direto"]
            .filter(
              (value) =>
                !["cozinha", "bar"].includes(state.actor.role) || value === state.actor.role,
            )
            .map((value) => (
              <button
                className={station === value ? "active" : ""}
                key={value}
                onClick={() => setStation(value)}
              >
                {value === "todas"
                  ? "Todas as estações"
                  : value === "direto"
                    ? "Entrega direta"
                    : value === "bar"
                      ? "Bar"
                      : "Cozinha"}
              </button>
            ))}
        </div>
        <span className="live-chip">
          <span />
          Atualização automática
        </span>
      </div>
      <ProductionNotices props={props} station={station} />
      <div className="production-board">
        {[
          { id: "enviado", name: "Na fila", icon: ClipboardIcon },
          { id: "preparo", name: "Em preparo", icon: ChefHat },
          { id: "pronto", name: "Prontos para servir", icon: CheckCheck },
        ].map((column) => {
          const entries = items.filter((item) => item.status === column.id);
          return (
            <section className={`production-column production-${column.id}`} key={column.id}>
              <div className="production-column-title">
                <span>
                  <column.icon size={18} />
                  {column.name}
                </span>
                <i>{entries.length}</i>
              </div>
              <div className="production-cards">
                {entries.map((item) => {
                  const tab = state.tabs.find((entry) => entry.id === item.tabId);
                  const partial = item as typeof item & {
                    startedQuantity?: number;
                    readyQuantity?: number;
                    deliveredQuantity?: number;
                  };
                  const started =
                    partial.startedQuantity ?? (item.status !== "enviado" ? item.quantity : 0);
                  const ready =
                    partial.readyQuantity ?? (item.status === "pronto" ? item.quantity : 0);
                  const delivered = partial.deliveredQuantity ?? 0;
                  return (
                    <article className="kitchen-card" key={item.id}>
                      <div className="kitchen-card-top">
                        <span>{tab ? visitLabel(state, tab.visitId) : "Pedido"}</span>
                        <span className="kitchen-clock">
                          <Clock3 size={12} />
                          {elapsed(item.sentAt || item.createdAt)}
                        </span>
                      </div>
                      <p className="kitchen-tab">
                        {tab?.label} ·{" "}
                        {item.station === "bar"
                          ? "Bar"
                          : item.station === "direto"
                            ? "Direto"
                            : "Cozinha"}
                      </p>
                      <div className="kitchen-item">
                        <strong>{item.quantity}×</strong>
                        <h3>{item.name}</h3>
                      </div>
                      {item.optionLabels?.length ? (
                        <p className="kitchen-notes">{item.optionLabels.join(" - ")}</p>
                      ) : null}
                      {item.notes && <p className="kitchen-notes">{item.notes}</p>}
                      <p className="kitchen-progress">
                        {started}/{item.quantity} iniciados · {ready}/{item.quantity} prontos ·{" "}
                        {delivered} entregues
                      </p>
                      <div className="kitchen-actions">
                        {item.quantity > started &&
                          (state.actor.role === "gestor" ||
                            state.actor.role === item.station ||
                            (item.station === "direto" && state.actor.role === "garcom")) && (
                            <button
                              className="btn btn-secondary btn-small"
                              disabled={props.disabled}
                              onClick={() =>
                                advance(item.id, "item.start", item.quantity - started)
                              }
                            >
                              Iniciar {item.station === "direto" ? "separação" : "preparo"}
                            </button>
                          )}
                        {started > ready &&
                          (state.actor.role === "gestor" || state.actor.role === item.station) && (
                            <button
                              className="btn btn-primary btn-small"
                              disabled={props.disabled}
                              onClick={() => advance(item.id, "item.ready", started - ready)}
                            >
                              <Check size={15} />
                              Marcar pronto
                            </button>
                          )}
                        {ready > delivered && ["gestor", "garcom"].includes(state.actor.role) && (
                          <button
                            className="btn btn-primary btn-small"
                            disabled={props.disabled}
                            onClick={() => advance(item.id, "item.deliver", ready - delivered)}
                          >
                            <CheckCheck size={15} />
                            Confirmar entrega
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
                {!entries.length && (
                  <div className="production-empty">
                    <column.icon size={25} />
                    <span>
                      {column.id === "enviado"
                        ? "Nenhum pedido aguardando"
                        : column.id === "preparo"
                          ? "Nenhum preparo em andamento"
                          : "Tudo servido por enquanto"}
                    </span>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

function ClipboardIcon({ size = 18 }: { size?: number }) {
  return <ShoppingBag size={size} />;
}
