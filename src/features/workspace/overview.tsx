"use client";

import { SetupChecklist } from "@/features/settings/setup-checklist";
import { operationDates } from "@/shared/lib/datetime";
import {
  ArrowUpRight,
  CheckCheck,
  ChefHat,
  ChevronRight,
  CreditCard,
  Package,
  Plus,
  TrendingUp,
  Users,
  Utensils,
  Wallet,
} from "lucide-react";
import { money, quantity } from "@/shared/lib/format";
import { tabTotals, visitLabel } from "@/shared/lib/operation-utils";
import type { ViewProps } from "@/shared/types/operation";
import { Status, Empty, Heading, Stat } from "@/shared/ui/primitives";

import { openVisit } from "@/features/service/open-visit";
import { TableCard } from "@/features/service/table-card";

export function Overview(props: ViewProps) {
  const { fullDate, shortDate, shortTime } = operationDates(props.state.restaurant.timezone);
  const { state, navigate, inspect } = props;
  const visits = state.visits.filter((visit) => !visit.closedAt);
  const occupied = state.occupancies.filter((occupancy) => !occupancy.releasedAt);
  const activeTabs = state.tabs.filter((tab) => tab.status === "aberta");
  const balance = activeTabs.reduce((sum, tab) => sum + tabTotals(state, tab.id).balanceCents, 0);
  const received =
    state.payments.reduce((sum, payment) => sum + payment.amountCents, 0) -
    state.refunds.reduce((sum, refund) => sum + refund.amountCents, 0);
  const production = state.items.filter((item) => ["enviado", "preparo"].includes(item.status));
  const ready = state.items.filter(
    (item) =>
      item.status !== "cancelado" &&
      (item.readyQuantity ?? (item.status === "pronto" ? item.quantity : 0)) >
        (item.deliveredQuantity ?? 0),
  );
  const lowStock = state.stockItems.filter(
    (item) => item.active && item.quantityMilli - item.reservedMilli <= item.minimumMilli,
  );
  const recentItems = state.items
    .filter((item) => item.status !== "rascunho")
    .slice()
    .reverse()
    .slice(0, 5);
  const lastName = state.profile.name.split(" ")[0];
  return (
    <>
      <Heading
        eyebrow="SEU RESTAURANTE, EM SINTONIA"
        title={`Tudo pronto, ${lastName}?`}
        description="Acompanhe o que acontece agora e cuide do que mais importa."
      >
        <button className="btn btn-secondary" onClick={() => navigate("relatorios")}>
          <ChartIcon />
          Ver relatórios
        </button>
        {["gestor", "garcom"].includes(state.actor.role) && (
          <button
            className="btn btn-primary"
            disabled={props.disabled}
            onClick={() => openVisit(props)}
          >
            <Plus size={17} />
            Abrir mesa
          </button>
        )}
      </Heading>
      <SetupChecklist props={props} />
      <div className="stats-grid">
        <Stat
          label="Recebido na operação"
          value={money(received)}
          detail={`${state.payments.length} recebimentos registrados`}
          icon={Wallet}
          accent
        />
        <Stat
          label="Contas em aberto"
          value={money(balance)}
          detail={`${activeTabs.length} comandas abertas`}
          icon={CreditCard}
          line={1}
        />
        <Stat
          label="Mesas ocupadas"
          value={`${occupied.length} / ${state.tables.filter((table) => table.active).length}`}
          detail={`${visits.reduce((sum, visit) => sum + visit.people, 0)} pessoas em atendimento`}
          icon={Utensils}
        />
        <Stat
          label="Na cozinha e no bar"
          value={String(production.length).padStart(2, "0")}
          detail={`${ready.length} itens prontos para servir`}
          icon={ChefHat}
          line={1}
        />
      </div>
      <div className="dashboard-grid">
        <section className="panel overview-salon">
          <div className="panel-heading">
            <div>
              <h2>
                O salão, agora{" "}
                <span className="live-chip">
                  <span />
                  Ao vivo
                </span>
              </h2>
              <p>Uma boa experiência começa com atenção.</p>
            </div>
            <button className="text-button" onClick={() => navigate("mesas")}>
              Ver todas as mesas <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="overview-tables">
            {state.tables
              .filter((table) => table.active)
              .slice(0, 6)
              .map((table) => (
                <TableCard key={table.id} {...props} tableId={table.id} compact />
              ))}
          </div>
          <div className="salon-legend">
            <span>
              <i className="legend-orange" />
              Em atendimento
            </span>
            <span>
              <i className="legend-green" />
              Livre para receber
            </span>
            <span>
              <i className="legend-blue" />
              Pedido pronto
            </span>
          </div>
        </section>
        <section className="panel attention-panel">
          <div className="panel-heading">
            <div>
              <h2>Precisa de atenção</h2>
              <p>Os próximos passos da sua equipe.</p>
            </div>
            <span className="attention-count">{ready.length + lowStock.length}</span>
          </div>
          <div className="attention-list">
            {ready.slice(0, 3).map((item) => {
              const tab = state.tabs.find((entry) => entry.id === item.tabId);
              return (
                <button
                  className="attention-row"
                  key={item.id}
                  onClick={() => tab && inspect(tab.visitId)}
                >
                  <span className="attention-icon green">
                    <CheckCheck size={19} />
                  </span>
                  <span>
                    <strong>
                      {tab ? visitLabel(state, tab.visitId) : "Pedido"} · pronto para servir
                    </strong>
                    <small>
                      {item.quantity}× {item.name}
                    </small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              );
            })}
            {lowStock.slice(0, 2).map((item) => (
              <button className="attention-row" key={item.id} onClick={() => navigate("estoque")}>
                <span className="attention-icon orange">
                  <Package size={19} />
                </span>
                <span>
                  <strong>{item.name}</strong>
                  <small>
                    Estoque baixo · {quantity(item.quantityMilli - item.reservedMilli, item.unit)}{" "}
                    disponíveis
                  </small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
            {!ready.length && !lowStock.length && (
              <Empty title="Tudo em dia por aqui" text="Avisaremos quando algo precisar de você." />
            )}
          </div>
          <div className="team-note">
            <span className="team-note-icon">
              <Users size={20} />
            </span>
            <div>
              <strong>Um time conectado faz a diferença.</strong>
              <p>Use os chamados para alinhar salão e produção.</p>
            </div>
            <button
              className="icon-btn"
              onClick={() => navigate("chamados")}
              aria-label="Abrir chamados"
            >
              <ArrowUpRight size={18} />
            </button>
          </div>
        </section>
      </div>
      <div className="dashboard-bottom">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Últimos pedidos</h2>
              <p>Da comanda para a cozinha, sem perder o ritmo.</p>
            </div>
            <button className="text-button" onClick={() => navigate("producao")}>
              Acompanhar produção <ArrowUpRight size={15} />
            </button>
          </div>
          {recentItems.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>ITEM / PEDIDO</th>
                    <th>ATENDIMENTO</th>
                    <th>HORÁRIO</th>
                    <th>SITUAÇÃO</th>
                    <th>VALOR</th>
                  </tr>
                </thead>
                <tbody>
                  {recentItems.map((item) => {
                    const tab = state.tabs.find((entry) => entry.id === item.tabId);
                    return (
                      <tr key={item.id}>
                        <td>
                          <strong>
                            {item.quantity}× {item.name}
                          </strong>
                          <small>
                            {item.station === "bar"
                              ? "Bar"
                              : item.station === "direto"
                                ? "Entrega direta"
                                : "Cozinha"}
                          </small>
                        </td>
                        <td>{tab ? visitLabel(state, tab.visitId) : "—"}</td>
                        <td>{shortTime(item.sentAt)}</td>
                        <td>
                          <Status value={item.status} />
                        </td>
                        <td className="money">{money(item.unitPriceCents * item.quantity)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="Os primeiros pedidos aparecem aqui"
              text="Abra uma mesa e envie os itens para a produção."
            />
          )}
        </section>
        <section className="operation-note">
          <span className="eyebrow">BOA OPERAÇÃO, BOAS EXPERIÊNCIAS</span>
          <h2>
            Cada detalhe
            <br />
            faz parte
            <br />
            <span>do cuidado.</span>
          </h2>
          <p>Cardápio organizado, equipe alinhada e mais tempo para receber bem.</p>
          <button
            className="text-button"
            onClick={() => navigate(state.actor.role === "gestor" ? "cardapio" : "mesas")}
          >
            Cuidar da operação <ArrowUpRight size={16} />
          </button>
          <Utensils size={90} className="note-decoration" />
        </section>
      </div>
    </>
  );
}

function ChartIcon() {
  return <TrendingUp size={17} />;
}
