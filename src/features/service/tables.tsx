"use client";

import { GroupDialog, splitGroup } from "@/features/service/groups";
import { useState } from "react";
import { GitMerge, Plus, Search } from "lucide-react";
import type { DiningTable, TableGroup } from "@/domain/types";
import type { ViewProps } from "@/shared/types/operation";
import { Empty, Heading } from "@/shared/ui/primitives";

import { openVisit } from "@/features/service/open-visit";
import { TableCard } from "@/features/service/table-card";
import { field, number } from "@/shared/ui/form-fields";

export function TablesView(props: ViewProps) {
  const [filter, setFilter] = useState("todas");
  const [search, setSearch] = useState("");
  const [grouping, setGrouping] = useState(false);
  const { state } = props;
  const occupancies = state.occupancies.filter((entry) => !entry.releasedAt);
  const occupied = new Set(occupancies.map((entry) => entry.tableId));
  const groups = new Map(
    state.groups.filter((group) => !group.closedAt).map((group) => [group.id, group]),
  );
  const visits = new Map(
    state.visits.filter((visit) => !visit.closedAt).map((visit) => [visit.id, visit]),
  );
  const groupByTable = new Map(
    occupancies.map((entry) => [
      entry.tableId,
      groups.get(visits.get(entry.visitId)?.groupId ?? ""),
    ]),
  );
  const tables = state.tables.filter(
    (table) =>
      table.active &&
      String(table.number).includes(search) &&
      (filter === "todas" ||
        (filter === "ocupadas" ? occupied.has(table.id) : !occupied.has(table.id))),
  );
  const cards = new Map<string, { group?: TableGroup; tables: DiningTable[] }>();
  for (const table of tables) {
    const group = groupByTable.get(table.id);
    const key = group ? `group-${group.id}` : `table-${table.id}`;
    const card = cards.get(key) ?? { group, tables: [] };
    card.tables.push(table);
    cards.set(key, card);
  }
  function groupTablesLabel(groupId: string) {
    const members = state.tables.filter((table) => groupByTable.get(table.id)?.id === groupId);
    const numbers = members.map((table) => String(table.number).padStart(2, "0"));
    return numbers.length
      ? `${numbers.length === 1 ? "Mesa" : "Mesas"} ${numbers.join(" + ")}`
      : "";
  }
  function newTable() {
    props.edit({
      title: "Cadastrar mesa",
      fields: [
        field("number", "Número", "number"),
        field("capacity", "Capacidade", "number"),
        field("sector", "Setor"),
      ],
      initial: { capacity: 4, sector: "Salão principal" },
      submit: async (values) => {
        await props.command("table.save", {
          number: number(values, "number"),
          capacity: number(values, "capacity"),
          sector: values.sector,
          active: true,
        });
      },
    });
  }
  return (
    <>
      {grouping && <GroupDialog props={props} onClose={() => setGrouping(false)} />}{" "}
      <Heading
        eyebrow="ATENDIMENTO"
        title="Mesas e salão"
        description="Uma visão clara de cada mesa e de cada experiência."
      >
        {state.actor.role === "gestor" && (
          <button className="btn btn-secondary" disabled={props.disabled} onClick={newTable}>
            <Plus size={16} />
            Cadastrar mesa
          </button>
        )}
        {["gestor", "garcom"].includes(state.actor.role) && (
          <>
            <button
              className="btn btn-secondary"
              disabled={props.disabled}
              onClick={() => setGrouping(true)}
            >
              <GitMerge size={16} />
              Juntar mesas
            </button>
            <button
              className="btn btn-primary"
              disabled={props.disabled}
              onClick={() => openVisit(props)}
            >
              <Plus size={17} />
              Abrir mesa
            </button>
          </>
        )}
      </Heading>
      <div className="filter-bar">
        <div className="segmented">
          {[
            ["todas", "Todas", state.tables.filter((table) => table.active).length],
            ["ocupadas", "Em atendimento", occupied.size],
            [
              "livres",
              "Livres",
              state.tables.filter((table) => table.active).length - occupied.size,
            ],
          ].map(([value, label, count]) => (
            <button
              key={value}
              className={filter === value ? "active" : ""}
              aria-pressed={filter === value}
              onClick={() => setFilter(String(value))}
            >
              {label}
              <span>{count}</span>
            </button>
          ))}
        </div>
        <label className="search-box">
          <Search size={17} />
          <input
            placeholder="Buscar número da mesa"
            aria-label="Buscar número da mesa"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>
      <div className="tables-grid">
        {[...cards].map(([key, { group, tables: members }]) =>
          group ? (
            <section
              key={key}
              className={`table-group-card ${members.length > 1 ? "table-group-card-wide" : ""}`}
              aria-labelledby={`${key}-label`}
              aria-describedby={`${key}-tables ${key}-mode`}
            >
              <header className="table-group-card-header">
                <span className="table-group-mark">
                  <GitMerge size={18} aria-hidden />
                </span>
                <div className="table-group-identity">
                  <h2 id={`${key}-label`}>{group.label}</h2>
                  <span id={`${key}-tables`}>{groupTablesLabel(group.id)}</span>
                </div>
                <span className="table-group-mode" id={`${key}-mode`}>
                  {group.mode === "unica" ? "Conta única" : "Contas separadas"}
                </span>
              </header>
              <div className="table-group-members">
                {members.map((table) => (
                  <TableCard key={table.id} tableId={table.id} {...props} />
                ))}
              </div>
            </section>
          ) : (
            <TableCard key={key} tableId={members[0].id} {...props} />
          ),
        )}
      </div>
      {!tables.length && (
        <Empty
          title="Nenhuma mesa por aqui"
          text="Cadastre mesas ou ajuste o filtro para continuar."
        />
      )}
      {groups.size > 0 && (
        <section className="panel section-gap">
          <div className="panel-heading">
            <div>
              <h2>Grupos de mesas</h2>
              <p>Operação em conjunto, histórico preservado.</p>
            </div>
          </div>
          <div className="list-rows">
            {[...groups.values()].map((group) => (
              <div className="list-row" key={group.id}>
                <span className="row-icon">
                  <GitMerge size={20} />
                </span>
                <div>
                  <strong>{group.label}</strong>
                  <small>
                    {[
                      group.mode === "unica" ? "Conta única" : "Contas separadas",
                      groupTablesLabel(group.id),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </div>
                {["gestor", "garcom"].includes(state.actor.role) && (
                  <button
                    className="btn btn-secondary btn-small"
                    disabled={props.disabled}
                    onClick={() => splitGroup(props, group.id)}
                  >
                    Separar grupo
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
