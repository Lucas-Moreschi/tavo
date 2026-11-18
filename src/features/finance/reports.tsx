"use client";

import { useState } from "react";
import { Download, Printer, Wallet, ShoppingBag, HandCoins, ArrowDownRight } from "lucide-react";
import type { ViewProps } from "@/shared/types/operation";
import { money, quantity } from "@/shared/lib/format";
import { addDays, dateRange, localDate } from "@/shared/lib/datetime";
import { csvCell, reportData, reportRows, type ReportExport } from "@/domain/reports";
import { channelNames } from "@/shared/lib/operation-utils";

export function ReportsView({ state }: ViewProps) {
  const today = localDate(Date.now(), state.restaurant.timezone);
  const [period, setPeriod] = useState("30");
  const [from, setFrom] = useState(() => addDays(today, -29));
  const [through, setThrough] = useState(today);
  const [exportKind, setExportKind] = useState<ReportExport>("recebimentos");
  let range = { since: "", until: "" },
    rangeError = "";
  try {
    range = dateRange(from, through, state.restaurant.timezone);
  } catch (cause) {
    rangeError = cause instanceof Error ? cause.message : "Datas inválidas.";
  }
  const data = reportData(state, range.since || "9999-01-01", range.until || "9999-01-02");
  const manager = state.actor.role === "gestor";
  const date = (value: string | null) =>
    value
      ? new Date(value).toLocaleString("pt-BR", {
          timeZone: state.restaurant.timezone,
          dateStyle: "short",
          timeStyle: "short",
        })
      : "Em aberto";
  function exportCsv() {
    if (rangeError) return;
    const rows = reportRows(state, range.since, range.until, exportKind);
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + rows.map((row) => row.map(csvCell).join(";")).join("\n")], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `tavo-${exportKind}-${from}-${through}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const cards = [
    {
      label: "Vendas encerradas",
      value: data.sold,
      detail: `${data.sales.length} comandas fechadas no período`,
      icon: ShoppingBag,
    },
    {
      label: "Recebimentos líquidos",
      value: data.received - data.refunded,
      detail: "Registros externos menos estornos",
      icon: Wallet,
    },
    {
      label: "Saldo em aberto",
      value: data.outstanding,
      detail: "Todas as comandas ainda abertas",
      icon: HandCoins,
    },
    {
      label: "Devoluções pendentes",
      value: data.refundPending,
      detail: "Excedentes a resolver com estorno",
      icon: ArrowDownRight,
    },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">GESTÃO COM CLAREZA</p>
          <h1>Os números contam a história</h1>
          <p className="muted">
            Vendas, recebimentos e operação separados para uma conferência correta.
          </p>
        </div>
        <div className="heading-actions no-print">
          <select
            aria-label="Período do relatório"
            className="period-select"
            value={period}
            onChange={(event) => {
              const value = event.target.value;
              setPeriod(value);
              if (value !== "custom") {
                setFrom(addDays(today, 1 - Number(value)));
                setThrough(today);
              }
            }}
          >
            <option value="1">Hoje</option>
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="365">Últimos 365 dias</option>
            <option value="custom">Personalizado</option>
          </select>
          <button className="btn btn-secondary" onClick={() => window.print()}>
            <Printer size={16} />
            Imprimir
          </button>
        </div>
      </div>
      <div className="report-filters no-print">
        <label className="field">
          <span>Data inicial</span>
          <input
            type="date"
            value={from}
            onChange={(event) => {
              setPeriod("custom");
              setFrom(event.target.value);
            }}
          />
        </label>
        <label className="field">
          <span>Data final (inclusive)</span>
          <input
            type="date"
            value={through}
            min={from}
            onChange={(event) => {
              setPeriod("custom");
              setThrough(event.target.value);
            }}
          />
        </label>
        <label className="field">
          <span>Exportar</span>
          <select
            value={exportKind}
            onChange={(event) => setExportKind(event.target.value as ReportExport)}
          >
            <option value="recebimentos">Recebimentos e estornos</option>
            <option value="vendas">Vendas encerradas</option>
            <option value="produtos">Produtos vendidos</option>
            <option value="caixas">Sessões de caixa</option>
            {manager && (
              <>
                <option value="estoque">Estoque atual</option>
                <option value="perdas">Perdas do período</option>
              </>
            )}
          </select>
        </label>
        <button className="btn btn-secondary" disabled={!!rangeError} onClick={exportCsv}>
          <Download size={16} />
          Exportar CSV
        </button>
      </div>
      {rangeError && (
        <p className="form-error" role="alert">
          {rangeError}
        </p>
      )}
      <p className="muted report-period">
        {from} a {through} · Fuso: {state.restaurant.timezone}.{" "}
        {exportKind === "estoque"
          ? "O estoque mostra a posição atual."
          : "Datas incluem o dia final completo."}
      </p>
      <div className="stats-grid">
        {cards.map((card, index) => (
          <div className={`stat-card ${index === 0 ? "stat-accent" : ""}`} key={card.label}>
            <div className="stat-top">
              <span>{card.label}</span>
              <span className="stat-icon">
                <card.icon size={18} />
              </span>
            </div>
            <strong className="stat-value">{money(card.value)}</strong>
            <p className="muted">{card.detail}</p>
          </div>
        ))}
      </div>
      <div className="notice-banner">
        <span>
          Vendas usam a data de fechamento da comanda. Recebimentos e estornos usam a data de cada
          lançamento. Fuso: {state.restaurant.timezone}.
        </span>
      </div>
      <div className="dashboard-grid section-gap">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Composição das vendas</h2>
              <p>Contas encerradas, sem duplicar pagamentos parciais ou grupos.</p>
            </div>
          </div>
          <div className="list-rows">
            {[
              ["Consumo", data.subtotal],
              ["Serviço", data.service],
              ["Acréscimos e entrega", data.extra],
              ["Descontos", -data.discounts],
              ["Total vendido", data.sold],
            ].map(([label, value]) => (
              <div className="list-row" key={label}>
                <span>{label}</span>
                <strong className="money">{money(Number(value))}</strong>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Conferência por forma</h2>
              <p>Bruto, estornado e líquido por data do lançamento.</p>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>FORMA</th>
                  <th>RECEBIDO</th>
                  <th>ESTORNADO</th>
                  <th>LÍQUIDO</th>
                </tr>
              </thead>
              <tbody>
                {["pix", "credito", "debito", "dinheiro"].map((method) => {
                  const received = data.payments
                    .filter((p) => p.method === method)
                    .reduce((sum, p) => sum + p.amountCents, 0);
                  const refunded = data.refunds
                    .filter((r) =>
                      state.payments.some((p) => p.id === r.paymentId && p.method === method),
                    )
                    .reduce((sum, r) => sum + r.amountCents, 0);
                  return (
                    <tr key={method}>
                      <td>{method}</td>
                      <td>{money(received)}</td>
                      <td>{money(refunded)}</td>
                      <td>{money(received - refunded)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>Produtos e categorias</h2>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>PRODUTO</th>
                  <th>CATEGORIA ATUAL</th>
                  <th>QUANTIDADE</th>
                  <th>CONSUMO</th>
                </tr>
              </thead>
              <tbody>
                {data.products.map((product) => (
                  <tr key={product.id}>
                    <td>
                      {product.name}
                      {!product.active && " (arquivado)"}
                    </td>
                    <td>{state.categories.find((c) => c.id === product.categoryId)?.name}</td>
                    <td>{product.soldQuantity}</td>
                    <td>{money(product.soldCents)}</td>
                  </tr>
                ))}
                {!data.products.length && (
                  <tr>
                    <td colSpan={4}>Nenhuma venda encerrada no período.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Vendas por canal</h2>
          </div>
          <div className="list-rows">
            {data.channels.map((channel) => (
              <div className="list-row" key={channel.channel}>
                <div>
                  <strong>{channelNames[channel.channel]}</strong>
                  <small>{channel.tabs} comandas encerradas</small>
                </div>
                <strong>{money(channel.total)}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>
      {manager && (
        <>
          <div className="stats-grid stats-three">
            <div className="stat-card">
              <div className="stat-top">Custo das vendas encerradas</div>
              <strong className="stat-value">{money(data.costs)}</strong>
              <p className="muted">Custo capturado ao consumir os ingredientes.</p>
            </div>
            <div className="stat-card">
              <div className="stat-top">Margem gerencial estimada</div>
              <strong className="stat-value">{money(data.margin)}</strong>
              <p className="muted">
                Consumo menos descontos e custo; sem serviço, entrega e despesas fixas.
              </p>
            </div>
            <div className="stat-card">
              <div className="stat-top">Custo das perdas</div>
              <strong className="stat-value">{money(data.lossCost)}</strong>
              <p className="muted">Perdas registradas no período, separadas das vendas.</p>
            </div>
          </div>
          <section className="panel section-gap">
            <div className="panel-heading">
              <div>
                <h2>Posição atual de estoque</h2>
                <p>Inclui reservas de todos os pedidos atuais, independentemente do período.</p>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>INGREDIENTE</th>
                    <th>FÍSICO</th>
                    <th>RESERVADO</th>
                    <th>DISPONÍVEL</th>
                    <th>MÍNIMO</th>
                  </tr>
                </thead>
                <tbody>
                  {state.stockItems.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{quantity(item.quantityMilli, item.unit)}</td>
                      <td>{quantity(item.reservedMilli, item.unit)}</td>
                      <td className={item.quantityMilli < item.reservedMilli ? "red-text" : ""}>
                        {quantity(item.quantityMilli - item.reservedMilli, item.unit)}
                      </td>
                      <td>{quantity(item.minimumMilli, item.unit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <div className="dashboard-grid section-gap">
            <section className="panel">
              <div className="panel-heading">
                <h2>Tempos de produção</h2>
              </div>
              <div className="list-rows">
                <div className="list-row">
                  <span>Espera média até início</span>
                  <strong>
                    {data.averageWaitMinutes === null
                      ? "Sem registros"
                      : `${data.averageWaitMinutes.toFixed(1)} min`}
                  </strong>
                </div>
                <div className="list-row">
                  <span>Preparo médio concluído</span>
                  <strong>
                    {data.averagePreparationMinutes === null
                      ? "Sem registros"
                      : `${data.averagePreparationMinutes.toFixed(1)} min`}
                  </strong>
                </div>
              </div>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <h2>Perdas no período</h2>
              </div>
              <div className="list-rows">
                {data.losses
                  .slice(-15)
                  .reverse()
                  .map((loss) => (
                    <div className="list-row" key={loss.id}>
                      <div>
                        <strong>
                          {state.stockItems.find((i) => i.id === loss.stockItemId)?.name}
                        </strong>
                        <small>
                          {loss.reason} · {date(loss.createdAt)}
                        </small>
                      </div>
                      <strong>{money(loss.costCents)}</strong>
                    </div>
                  ))}
                {!data.losses.length && (
                  <p className="muted" style={{ padding: 22 }}>
                    Nenhuma perda registrada.
                  </p>
                )}
              </div>
            </section>
          </div>
        </>
      )}
      <section className="panel section-gap">
        <div className="panel-heading">
          <div>
            <h2>Sessões de caixa</h2>
            <p>Saldo esperado em dinheiro, conferência e diferenças registradas.</p>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>CAIXA</th>
                <th>ABERTURA</th>
                <th>FECHAMENTO</th>
                <th>ESPERADO</th>
                <th>CONTADO</th>
                <th>DIFERENÇA</th>
              </tr>
            </thead>
            <tbody>
              {data.cash.map((cash) => (
                <tr key={cash.id}>
                  <td>{cash.label}</td>
                  <td>{date(cash.openedAt)}</td>
                  <td>{date(cash.closedAt)}</td>
                  <td>{money(cash.expected)}</td>
                  <td>{cash.countedCents === null ? "—" : money(cash.countedCents)}</td>
                  <td>
                    {cash.differenceCents === null ? "—" : money(cash.differenceCents)}
                    <small>{cash.closeReason}</small>
                  </td>
                </tr>
              ))}
              {!data.cash.length && (
                <tr>
                  <td colSpan={6}>Nenhuma sessão neste período.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
