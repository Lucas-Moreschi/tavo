"use client";

import type { ViewProps } from "@/shared/types/operation";
import { field, number } from "@/shared/ui/form-fields";
import { operationDates } from "@/shared/lib/datetime";

export function SettingsManagement(props: ViewProps) {
  const { state } = props;
  const { fullDate } = operationDates(state.restaurant.timezone);
  return (
    <>
      <section className="panel section-gap">
        <div className="panel-heading">
          <div>
            <h2>Mesas e setores</h2>
            <p>
              Edite capacidade, identificação e disponibilidade. Mesas ocupadas não podem ser
              bloqueadas.
            </p>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>MESA</th>
                <th>SETOR</th>
                <th>CAPACIDADE</th>
                <th>SITUAÇÃO</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {state.tables.map((table) => (
                <tr key={table.id}>
                  <td>Mesa {table.number}</td>
                  <td>{table.sector}</td>
                  <td>{table.capacity}</td>
                  <td>{table.active ? "Ativa" : "Bloqueada"}</td>
                  <td>
                    <button
                      className="text-button"
                      disabled={props.disabled}
                      onClick={() =>
                        props.edit({
                          title: `Configurar mesa ${table.number}`,
                          fields: [
                            field("number", "Número", "number"),
                            field("capacity", "Capacidade", "number"),
                            field("sector", "Setor"),
                            field("active", "Disponível para atendimento", "checkbox", false),
                          ],
                          initial: { ...table },
                          submit: async (values) => {
                            await props.command("table.save", {
                              id: table.id,
                              number: number(values, "number"),
                              capacity: number(values, "capacity"),
                              sector: values.sector,
                              active: values.active,
                            });
                          },
                        })
                      }
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel section-gap">
        <div className="panel-heading">
          <div>
            <h2>Categorias do cardápio</h2>
            <p>
              Arquivar mantém os produtos e o histórico. Produtos de uma categoria arquivada não
              podem ser enviados.
            </p>
          </div>
        </div>
        <div className="list-rows">
          {state.categories.map((category) => (
            <div className="list-row" key={category.id}>
              <div>
                <strong>{category.name}</strong>
                <small>{category.active ? "Ativa" : "Arquivada"}</small>
              </div>
              <button
                className="text-button"
                disabled={props.disabled}
                onClick={() =>
                  props.edit({
                    title: "Editar categoria",
                    fields: [field("name", "Nome"), field("active", "Ativa", "checkbox", false)],
                    initial: { ...category },
                    submit: async (values) => {
                      await props.command("category.save", { id: category.id, ...values });
                    },
                  })
                }
              >
                Editar
              </button>
            </div>
          ))}
        </div>
      </section>
      <section className="panel section-gap">
        <div className="panel-heading">
          <div>
            <h2>Auditoria recente</h2>
            <p>Operações registradas com autor, horário e identificador de origem.</p>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>OPERAÇÃO</th>
                <th>AUTOR</th>
                <th>DATA</th>
                <th>DETALHE</th>
              </tr>
            </thead>
            <tbody>
              {state.audits
                .slice(-50)
                .reverse()
                .map((event) => (
                  <tr key={event.id}>
                    <td>
                      {event.action}
                      <small>#{event.entityId?.slice(-8)}</small>
                    </td>
                    <td>{event.actorName}</td>
                    <td>{fullDate(event.createdAt)}</td>
                    <td>
                      <details>
                        <summary>Ver registro</summary>
                        <pre
                          style={{
                            whiteSpace: "pre-wrap",
                            overflowWrap: "anywhere",
                            maxWidth: 380,
                          }}
                        >
                          {event.detail}
                        </pre>
                      </details>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
