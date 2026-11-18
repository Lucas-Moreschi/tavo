"use client";

import { localDateTime, zonedToIso, operationDates } from "@/shared/lib/datetime";
import { useState } from "react";
import { Plus, Users, X } from "lucide-react";
import { elapsed } from "@/shared/lib/operation-utils";
import type { ViewProps } from "@/shared/types/operation";
import type { Reservation } from "@/domain/types";
import { Status, Empty, Heading } from "@/shared/ui/primitives";

import { field, select, number, string, array, tableOptions } from "@/shared/ui/form-fields";

export function ReservationsView(props: ViewProps) {
  const { fullDate, shortDate, shortTime } = operationDates(props.state.restaurant.timezone);
  const [tab, setTab] = useState("reservas");
  const { state } = props;
  function reserve(existing?: Reservation) {
    props.edit({
      title: existing ? "Editar reserva" : "Nova reserva",
      description: `Horários do restaurante: ${state.restaurant.timezone}.`,
      fields: [
        field("customerName", "Nome do cliente"),
        field("phone", "Telefone"),
        field("people", "Pessoas", "number"),
        field("startsAt", "Início", "datetime-local"),
        field("endsAt", "Fim", "datetime-local"),
        { ...select("tableIds", "Mesas (opcional)", tableOptions(state), true), required: false },
        field("notes", "Observações", "textarea", false),
      ],
      initial: existing
        ? {
            ...existing,
            startsAt: localDateTime(existing.startsAt, state.restaurant.timezone),
            endsAt: localDateTime(existing.endsAt, state.restaurant.timezone),
          }
        : {
            people: 2,
            startsAt: localDateTime(Date.now(), state.restaurant.timezone),
            endsAt: localDateTime(
              Date.now() + state.restaurant.reservationMinutes * 60000,
              state.restaurant.timezone,
            ),
          },
      submit: async (values) => {
        await props.command("reservation.save", {
          ...(existing ? { id: existing.id } : {}),
          ...values,
          people: number(values, "people"),
          startsAt: zonedToIso(string(values, "startsAt"), state.restaurant.timezone),
          endsAt: zonedToIso(string(values, "endsAt"), state.restaurant.timezone),
          tableIds: array(values, "tableIds"),
        });
      },
    });
  }
  function seat(id: string, reservation: boolean) {
    props.edit({
      title: "Receber clientes",
      description: "Escolha uma mesa livre para iniciar o atendimento.",
      fields: [select("tableId", "Mesa", tableOptions(state, true))],
      submitLabel: "Abrir atendimento",
      submit: async (values) => {
        const result = (await props.command(reservation ? "reservation.checkin" : "waitlist.seat", {
          [reservation ? "reservationId" : "waitId"]: id,
          tableId: values.tableId,
        })) as { entityId?: string };
        if (result?.entityId) props.inspect(result.entityId);
      },
    });
  }
  return (
    <>
      <Heading
        eyebrow="RECEPÇÃO"
        title="Cada chegada, um bom começo"
        description="Organize reservas e acompanhe quem está esperando por uma mesa."
      >
        <button
          className="btn btn-secondary"
          disabled={props.disabled}
          onClick={() =>
            props.edit({
              title: "Adicionar à fila",
              fields: [
                field("customerName", "Nome"),
                field("phone", "Telefone", "text", false),
                field("people", "Pessoas", "number"),
              ],
              initial: { people: 2 },
              submit: async (values) => {
                await props.command("waitlist.add", {
                  ...values,
                  people: number(values, "people"),
                });
              },
            })
          }
        >
          <Users size={16} />
          Adicionar à fila
        </button>
        <button className="btn btn-primary" disabled={props.disabled} onClick={() => reserve()}>
          <Plus size={17} />
          Nova reserva
        </button>
      </Heading>
      <div className="filter-bar">
        <div className="segmented">
          <button className={tab === "reservas" ? "active" : ""} onClick={() => setTab("reservas")}>
            Reservas
            <span>
              {state.reservations.filter((entry) => entry.status === "confirmada").length}
            </span>
          </button>
          <button className={tab === "fila" ? "active" : ""} onClick={() => setTab("fila")}>
            Fila de espera
            <span>
              {
                state.waitlist.filter((entry) => ["aguardando", "chamado"].includes(entry.status))
                  .length
              }
            </span>
          </button>
        </div>
      </div>
      <section className="panel">
        {tab === "reservas" ? (
          state.reservations.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>CLIENTE</th>
                    <th>DATA / HORÁRIO</th>
                    <th>PESSOAS / MESAS</th>
                    <th>SITUAÇÃO</th>
                    <th>AÇÕES</th>
                  </tr>
                </thead>
                <tbody>
                  {state.reservations
                    .slice()
                    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
                    .map((reservation) => (
                      <tr key={reservation.id}>
                        <td>
                          <strong>{reservation.customerName}</strong>
                          <small>{reservation.phone}</small>
                        </td>
                        <td>
                          {fullDate(reservation.startsAt)}
                          <small>Até {shortTime(reservation.endsAt)}</small>
                        </td>
                        <td>
                          {reservation.people} pessoas
                          <small>
                            {reservation.tableIds
                              .map(
                                (id) =>
                                  `Mesa ${state.tables.find((table) => table.id === id)?.number}`,
                              )
                              .join(", ") || "Mesa a definir"}
                          </small>
                        </td>
                        <td>
                          <Status value={reservation.status} />
                        </td>
                        <td>
                          {reservation.status === "confirmada" && (
                            <div className="inline-actions">
                              <button
                                className="text-button"
                                disabled={props.disabled}
                                onClick={() => reserve(reservation)}
                              >
                                Editar
                              </button>
                              <button
                                className="text-button"
                                disabled={props.disabled}
                                onClick={() => seat(reservation.id, true)}
                              >
                                Recepcionar
                              </button>
                              <button
                                className="text-button"
                                disabled={props.disabled}
                                onClick={() =>
                                  props.run(() =>
                                    props.command("reservation.status", {
                                      reservationId: reservation.id,
                                      status: "cancelada",
                                    }),
                                  )
                                }
                              >
                                Cancelar
                              </button>
                              <button
                                className="text-button"
                                disabled={props.disabled}
                                onClick={() =>
                                  props.run(() =>
                                    props.command("reservation.status", {
                                      reservationId: reservation.id,
                                      status: "ausente",
                                    }),
                                  )
                                }
                              >
                                Ausente
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="A agenda está livre"
              text="Cadastre uma reserva para preparar a próxima chegada."
            />
          )
        ) : state.waitlist.length ? (
          <div className="list-rows">
            {state.waitlist.map((entry, index) => (
              <div className="list-row" key={entry.id}>
                <span className="queue-number">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{entry.customerName}</strong>
                  <small>
                    {entry.people} pessoas · {elapsed(entry.createdAt)} de espera · {entry.phone}
                  </small>
                </div>
                <Status value={entry.status} />
                {["aguardando", "chamado"].includes(entry.status) && (
                  <div className="inline-actions">
                    {entry.status === "aguardando" && (
                      <button
                        className="btn btn-secondary btn-small"
                        disabled={props.disabled}
                        onClick={() =>
                          props.run(() =>
                            props.command("waitlist.status", {
                              waitId: entry.id,
                              status: "chamado",
                            }),
                          )
                        }
                      >
                        Chamar
                      </button>
                    )}
                    <button
                      className="btn btn-primary btn-small"
                      disabled={props.disabled}
                      onClick={() => seat(entry.id, false)}
                    >
                      Sentar
                    </button>
                    <button
                      className="icon-btn"
                      disabled={props.disabled}
                      aria-label={`Cancelar espera de ${entry.customerName}`}
                      onClick={() =>
                        props.run(() =>
                          props.command("waitlist.status", {
                            waitId: entry.id,
                            status: "cancelado",
                          }),
                        )
                      }
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <Empty
            title="Ninguém esperando por enquanto"
            text="As próximas pessoas da fila aparecerão aqui."
          />
        )}
      </section>
    </>
  );
}
