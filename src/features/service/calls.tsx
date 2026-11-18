"use client";

import { operationDates } from "@/shared/lib/datetime";
import { Bell, CheckCheck, Plus } from "lucide-react";
import { quantity } from "@/shared/lib/format";
import { visitLabel } from "@/shared/lib/operation-utils";
import type { ViewProps } from "@/shared/types/operation";
import { Status, Empty, Heading } from "@/shared/ui/primitives";

import { field, select } from "@/shared/ui/form-fields";

export function CallsView(props: ViewProps) {
  const { fullDate, shortDate, shortTime } = operationDates(props.state.restaurant.timezone);
  const { state } = props;
  return (
    <>
      <Heading
        eyebrow="EQUIPE CONECTADA"
        title="Central de chamados"
        description="Apoio no momento certo e nenhuma mensagem perdida."
      >
        <button
          className="btn btn-primary"
          disabled={props.disabled}
          onClick={() =>
            props.edit({
              title: "Novo chamado",
              fields: [
                select(
                  "destination",
                  "Destino",
                  ["salao", "cozinha", "bar"].map((value) => ({
                    value,
                    label:
                      value === "salao"
                        ? "Equipe do salão"
                        : value === "cozinha"
                          ? "Cozinha"
                          : "Bar",
                  })),
                ),
                field("message", "Como podemos ajudar?", "textarea"),
              ],
              submitLabel: "Enviar chamado",
              submit: async (values) => {
                await props.command("call.create", values);
              },
            })
          }
        >
          <Plus size={17} />
          Pedir apoio
        </button>
      </Heading>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Pedidos prontos</h2>
            <p>Leve até o cliente e confirme a entrega.</p>
          </div>
        </div>
        <div className="list-rows">
          {state.items
            .filter(
              (item) =>
                item.status !== "cancelado" &&
                (item.readyQuantity ?? (item.status === "pronto" ? item.quantity : 0)) >
                  (item.deliveredQuantity ?? 0),
            )
            .map((item) => {
              const tab = state.tabs.find((entry) => entry.id === item.tabId);
              return (
                <div className="list-row" key={item.id}>
                  <span className="row-icon green">
                    <CheckCheck size={21} />
                  </span>
                  <div>
                    <strong>
                      {item.quantity}× {item.name}
                    </strong>
                    <small>
                      {tab && visitLabel(state, tab.visitId)} · {tab?.label}
                    </small>
                  </div>
                  {["gestor", "garcom"].includes(state.actor.role) && (
                    <button
                      className="btn btn-primary btn-small"
                      disabled={props.disabled}
                      onClick={() =>
                        props.run(() => props.command("item.deliver", { itemId: item.id }))
                      }
                    >
                      Entregue
                    </button>
                  )}
                </div>
              );
            })}
          {!state.items.some(
            (item) =>
              item.status !== "cancelado" &&
              (item.readyQuantity ?? (item.status === "pronto" ? item.quantity : 0)) >
                (item.deliveredQuantity ?? 0),
          ) && <Empty title="Nenhum pedido pronto agora" />}
        </div>
      </section>
      <section className="panel section-gap">
        <div className="panel-heading">
          <h2>Chamados da equipe</h2>
        </div>
        <div className="list-rows">
          {state.calls
            .slice()
            .reverse()
            .map((call) => (
              <div className="list-row" key={call.id}>
                <span className="row-icon">
                  <Bell size={20} />
                </span>
                <div>
                  <strong>{call.message}</strong>
                  <small>
                    {call.destination === "salao" ? "Salão" : call.destination} ·{" "}
                    {fullDate(call.createdAt)}
                  </small>
                </div>
                <Status value={call.status} />
                {call.status !== "concluido" &&
                  (state.actor.role === "gestor" ||
                    state.actor.role === call.destination ||
                    (call.destination === "salao" &&
                      ["garcom", "caixa"].includes(state.actor.role))) && (
                    <button
                      className="btn btn-secondary btn-small"
                      disabled={props.disabled}
                      onClick={() =>
                        props.run(() =>
                          props.command("call.status", {
                            callId: call.id,
                            status: call.status === "aberto" ? "atendido" : "concluido",
                          }),
                        )
                      }
                    >
                      {call.status === "aberto" ? "Atender" : "Concluir"}
                    </button>
                  )}
              </div>
            ))}
          {!state.calls.length && (
            <Empty
              title="Nenhum chamado por aqui"
              text="Quando a equipe precisar de apoio, você verá aqui."
            />
          )}
        </div>
      </section>
    </>
  );
}
