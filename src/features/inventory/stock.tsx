"use client";

import { operationDates } from "@/shared/lib/datetime";
import { useState } from "react";
import { ArrowDownLeft, Bell, Layers3, Package, Plus, Search, Truck } from "lucide-react";
import { centsInput, quantity } from "@/shared/lib/format";
import type { ViewProps } from "@/shared/types/operation";
import { Empty, Heading, Stat } from "@/shared/ui/primitives";

import { field, select, number, string } from "@/shared/ui/form-fields";

export function StockView(props: ViewProps) {
  const { fullDate, shortDate, shortTime } = operationDates(props.state.restaurant.timezone);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("itens");
  const { state } = props;
  const items = state.stockItems.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()),
  );
  function movement(kind: "entry" | "adjust" | "loss", id?: string) {
    props.edit({
      title:
        kind === "entry"
          ? "Registrar entrada"
          : kind === "loss"
            ? "Registrar perda"
            : "Ajustar inventário",
      fields: [
        select(
          "stockItemId",
          "Item de estoque",
          state.stockItems
            .filter((item) => item.active)
            .map((item) => ({ value: item.id, label: `${item.name} (${item.unit})` })),
        ),
        {
          ...field("quantity", kind === "adjust" ? "Saldo físico contado" : "Quantidade", "number"),
          step: "0.001",
          min: 0,
        },
        ...(kind === "entry" ? [field("cost", "Custo total da entrada (R$)")] : []),
        field("reason", "Motivo / referência"),
      ],
      initial: { stockItemId: id, cost: "0,00" },
      submit: async (values) => {
        await props.command(`stock.${kind}`, {
          stockItemId: values.stockItemId,
          quantityMilli: Math.round(number(values, "quantity") * 1000),
          reason: values.reason,
          ...(kind === "entry" ? { costCents: centsInput(string(values, "cost")) } : {}),
        });
      },
    });
  }
  return (
    <>
      <Heading
        eyebrow="GESTÃO"
        title="Estoque sob controle"
        description="Ingredientes, disponibilidade e movimentos conectados à operação."
      >
        <button
          className="btn btn-secondary"
          disabled={props.disabled}
          onClick={() =>
            props.edit({
              title: "Novo item de estoque",
              fields: [
                field("name", "Nome"),
                select(
                  "unit",
                  "Unidade base",
                  ["g", "ml", "un"].map((value) => ({ value, label: value })),
                ),
                { ...field("minimum", "Saldo mínimo", "number"), step: "0.001", min: 0 },
              ],
              initial: { unit: "un", minimum: 0 },
              submit: async (values) => {
                await props.command("stock.save", {
                  name: values.name,
                  unit: values.unit,
                  minimumMilli: Math.round(number(values, "minimum") * 1000),
                  active: true,
                });
              },
            })
          }
        >
          <Plus size={16} />
          Novo item
        </button>
        <button
          className="btn btn-primary"
          disabled={props.disabled}
          onClick={() => movement("entry")}
        >
          <ArrowDownLeft size={17} />
          Registrar entrada
        </button>
      </Heading>
      <div className="stats-grid stats-three">
        <Stat
          label="Itens controlados"
          value={String(state.stockItems.filter((item) => item.active).length)}
          detail="Ingredientes e produtos de revenda"
          icon={Package}
        />
        <Stat
          label="Abaixo do mínimo"
          value={String(
            state.stockItems.filter(
              (item) => item.quantityMilli - item.reservedMilli <= item.minimumMilli,
            ).length,
          )}
          detail="Considere repor estes ingredientes"
          icon={Bell}
          accent
        />
        <Stat
          label="Movimentos registrados"
          value={String(state.stockMovements.length)}
          detail="Histórico de entradas, reservas e consumo"
          icon={Layers3}
        />
      </div>
      <div className="filter-bar">
        <div className="segmented">
          {["itens", "movimentos", "fornecedores"].map((value) => (
            <button
              key={value}
              className={tab === value ? "active" : ""}
              onClick={() => setTab(value)}
            >
              {value[0].toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>
        <label className="search-box">
          <Search size={17} />
          <input
            placeholder="Buscar ingrediente ou produto"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>
      <section className="panel">
        {tab === "itens" ? (
          items.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>ITEM</th>
                    <th>FÍSICO</th>
                    <th>RESERVADO</th>
                    <th>DISPONÍVEL</th>
                    <th>MÍNIMO</th>
                    <th>AÇÕES</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.name}</strong>
                        <small>
                          {item.active ? "Ativo" : "Inativo"} · unidade: {item.unit}
                        </small>
                      </td>
                      <td>{quantity(item.quantityMilli, item.unit)}</td>
                      <td>{quantity(item.reservedMilli, item.unit)}</td>
                      <td
                        className={
                          item.quantityMilli - item.reservedMilli <= item.minimumMilli
                            ? "orange-text"
                            : ""
                        }
                      >
                        {quantity(item.quantityMilli - item.reservedMilli, item.unit)}
                      </td>
                      <td>{quantity(item.minimumMilli, item.unit)}</td>
                      <td>
                        <div className="inline-actions">
                          <button
                            className="text-button"
                            disabled={props.disabled}
                            onClick={() =>
                              props.edit({
                                title: "Editar item de estoque",
                                fields: [
                                  field("name", "Nome"),
                                  {
                                    ...field("minimum", "Saldo mínimo", "number"),
                                    step: "0.001",
                                    min: 0,
                                  },
                                  field("active", "Ativo", "checkbox", false),
                                ],
                                initial: {
                                  name: item.name,
                                  minimum: item.minimumMilli / 1000,
                                  active: item.active,
                                },
                                submit: async (values) => {
                                  await props.command("stock.save", {
                                    id: item.id,
                                    name: values.name,
                                    unit: item.unit,
                                    minimumMilli: Math.round(number(values, "minimum") * 1000),
                                    active: values.active,
                                  });
                                },
                              })
                            }
                          >
                            Editar
                          </button>
                          <button
                            className="text-button"
                            disabled={props.disabled}
                            onClick={() => movement("entry", item.id)}
                          >
                            Entrada
                          </button>
                          <button
                            className="text-button"
                            disabled={props.disabled}
                            onClick={() => movement("adjust", item.id)}
                          >
                            Inventário
                          </button>
                          <button
                            className="text-button"
                            disabled={props.disabled}
                            onClick={() => movement("loss", item.id)}
                          >
                            Perda
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="Cadastre seu estoque inicial"
              text="Depois, vincule ingredientes aos produtos do cardápio."
            />
          )
        ) : tab === "movimentos" ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>ITEM</th>
                  <th>MOVIMENTO</th>
                  <th>QUANTIDADE</th>
                  <th>MOTIVO</th>
                  <th>DATA</th>
                </tr>
              </thead>
              <tbody>
                {state.stockMovements
                  .slice()
                  .reverse()
                  .slice(0, 100)
                  .map((move) => (
                    <tr key={move.id}>
                      <td>{state.stockItems.find((item) => item.id === move.stockItemId)?.name}</td>
                      <td>{move.kind}</td>
                      <td>
                        {quantity(
                          move.quantityMilli,
                          state.stockItems.find((item) => item.id === move.stockItemId)?.unit,
                        )}
                      </td>
                      <td>{move.reason || "Operação do pedido"}</td>
                      <td>{fullDate(move.createdAt)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            <div className="panel-heading">
              <h2>Fornecedores</h2>
              <button
                className="btn btn-secondary btn-small"
                disabled={props.disabled}
                onClick={() =>
                  props.edit({
                    title: "Novo fornecedor",
                    fields: [field("name", "Nome"), field("phone", "Telefone", "text", false)],
                    submit: async (values) => {
                      await props.command("supplier.save", { ...values, active: true });
                    },
                  })
                }
              >
                <Plus size={15} />
                Fornecedor
              </button>
            </div>
            <div className="list-rows">
              {state.suppliers.map((supplier) => (
                <div className="list-row" key={supplier.id}>
                  <span className="row-icon">
                    <Truck size={20} />
                  </span>
                  <div>
                    <strong>{supplier.name}</strong>
                    <small>
                      {supplier.phone || "Telefone não informado"} -{" "}
                      {supplier.active ? "Ativo" : "Inativo"}
                    </small>
                  </div>
                  <button
                    className="text-button"
                    disabled={props.disabled}
                    onClick={() =>
                      props.edit({
                        title: "Editar fornecedor",
                        fields: [
                          field("name", "Nome"),
                          field("phone", "Telefone", "text", false),
                          field("active", "Ativo", "checkbox", false),
                        ],
                        initial: { ...supplier },
                        submit: async (values) => {
                          await props.command("supplier.save", { id: supplier.id, ...values });
                        },
                      })
                    }
                  >
                    Editar
                  </button>
                </div>
              ))}
              {!state.suppliers.length && <Empty title="Nenhum fornecedor cadastrado" />}
            </div>
          </>
        )}
      </section>
    </>
  );
}
