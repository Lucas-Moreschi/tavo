"use client";

import { operationDates } from "@/shared/lib/datetime";
import { useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { money } from "@/shared/lib/format";
import { tabTotals, visitLabel } from "@/shared/lib/operation-utils";
import type { ViewProps } from "@/shared/types/operation";
import { Empty, Heading } from "@/shared/ui/primitives";

export function TabsView(props: ViewProps) {
  const { fullDate, shortDate, shortTime } = operationDates(props.state.restaurant.timezone);
  const [filter, setFilter] = useState("aberta");
  const [search, setSearch] = useState("");
  const tabs = props.state.tabs.filter(
    (tab) =>
      tab.status === filter &&
      `${tab.label} ${visitLabel(props.state, tab.visitId)}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <Heading
        eyebrow="ATENDIMENTO"
        title="Comandas"
        description="Cada consumo no lugar certo. Do primeiro pedido à última conta."
      />
      <div className="filter-bar">
        <div className="segmented">
          {["aberta", "fechada"].map((value) => (
            <button
              key={value}
              className={filter === value ? "active" : ""}
              onClick={() => setFilter(value)}
            >
              {value === "aberta" ? "Abertas" : "Fechadas"}
              <span>{props.state.tabs.filter((tab) => tab.status === value).length}</span>
            </button>
          ))}
        </div>
        <label className="search-box">
          <Search size={17} />
          <input
            placeholder="Buscar comanda ou mesa"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>
      <section className="panel">
        {tabs.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>COMANDA</th>
                  <th>ATENDIMENTO</th>
                  <th>ABERTURA</th>
                  <th>CONSUMO</th>
                  <th>RECEBIDO</th>
                  <th>SALDO</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {tabs.map((tab) => {
                  const totals = tabTotals(props.state, tab.id);
                  return (
                    <tr key={tab.id}>
                      <td>
                        <strong>{tab.label}</strong>
                        <small>#{tab.id.slice(-6).toUpperCase()}</small>
                      </td>
                      <td>{visitLabel(props.state, tab.visitId)}</td>
                      <td>{fullDate(tab.openedAt)}</td>
                      <td className="money">{money(totals.totalCents)}</td>
                      <td className="money">{money(totals.paidCents)}</td>
                      <td className="money orange-text">{money(totals.balanceCents)}</td>
                      <td>
                        <button
                          className="icon-btn"
                          aria-label={`Abrir ${tab.label}`}
                          onClick={() => props.inspect(tab.visitId)}
                        >
                          <ArrowUpRight size={18} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={`Nenhuma comanda ${filter}`}
            text="As comandas dos atendimentos aparecerão aqui."
          />
        )}
      </section>
    </>
  );
}
