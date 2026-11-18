"use client";

import { operationDates } from "@/shared/lib/datetime";
import { useState } from "react";
import { ArrowUpRight, Banknote, HandCoins, Plus, Wallet } from "lucide-react";
import { centsInput, money } from "@/shared/lib/format";
import { tabTotals, visitLabel } from "@/shared/lib/operation-utils";
import type { ViewProps } from "@/shared/types/operation";
import { cashExpected } from "@/domain/finance";
import { Status, Empty, Heading, Stat } from "@/shared/ui/primitives";

import { paymentForm } from "@/features/finance/payment-form";
import { field, string } from "@/shared/ui/form-fields";

export function CashView(props: ViewProps) {
  const { fullDate, shortDate, shortTime } = operationDates(props.state.restaurant.timezone);
  const { state } = props;
  const cash = state.cashSessions.find((session) => !session.closedAt);
  const [tab, setTab] = useState("contas");
  const canReceive = ["gestor", "caixa"].includes(state.actor.role);
  const activeTabs = state.tabs.filter((entry) => entry.status === "aberta");
  const received = cash
    ? state.payments
        .filter((payment) => payment.cashSessionId === cash.id)
        .reduce((sum, payment) => sum + payment.amountCents, 0) -
      state.refunds
        .filter((refund) => refund.cashSessionId === cash.id)
        .reduce((sum, refund) => sum + refund.amountCents, 0)
    : 0;
  function openCash() {
    props.edit({
      title: "Abrir caixa",
      fields: [field("label", "Identificação"), field("opening", "Fundo inicial em dinheiro (R$)")],
      initial: { label: "Caixa principal", opening: "0,00" },
      submitLabel: "Abrir caixa",
      submit: async (values) => {
        await props.command("cash.open", {
          label: values.label,
          openingCents: centsInput(string(values, "opening")),
        });
      },
    });
  }
  function move(kind: string) {
    if (!cash) return;
    props.edit({
      title: kind === "sangria" ? "Registrar sangria" : "Registrar suprimento",
      fields: [field("amount", "Valor em dinheiro (R$)"), field("reason", "Motivo")],
      submit: async (values) => {
        await props.command("cash.move", {
          cashSessionId: cash.id,
          kind,
          amountCents: centsInput(string(values, "amount")),
          reason: values.reason,
        });
      },
    });
  }
  function closeCash() {
    if (!cash) return;
    props.edit({
      title: "Conferir e fechar caixa",
      description: `Saldo físico esperado: ${money(cashExpected(state, cash.id))}. Pix e cartões não compõem o dinheiro da gaveta.`,
      fields: [
        field("counted", "Dinheiro contado na gaveta (R$)"),
        field("reason", "Observação / justificativa de divergência", "textarea", false),
      ],
      submitLabel: "Confirmar fechamento",
      submit: async (values) => {
        await props.command("cash.close", {
          cashSessionId: cash.id,
          countedCents: centsInput(string(values, "counted")),
          reason: values.reason,
        });
      },
    });
  }
  return (
    <>
      <Heading
        eyebrow="FINANCEIRO"
        title="Caixa e recebimentos"
        description="Um fechamento tranquilo começa com cada lançamento no lugar."
      >
        {cash && canReceive ? (
          <>
            <button
              className="btn btn-secondary"
              disabled={props.disabled}
              onClick={() => move("sangria")}
            >
              <ArrowUpRight size={16} />
              Sangria
            </button>
            <button
              className="btn btn-secondary"
              disabled={props.disabled}
              onClick={() => move("suprimento")}
            >
              <Plus size={16} />
              Suprimento
            </button>
            <button className="btn btn-primary" disabled={props.disabled} onClick={closeCash}>
              Fechar caixa
            </button>
          </>
        ) : (
          canReceive && (
            <button className="btn btn-primary" disabled={props.disabled} onClick={openCash}>
              <Wallet size={17} />
              Abrir caixa
            </button>
          )
        )}
      </Heading>
      <div className="stats-grid stats-three">
        <Stat
          label="Recebido neste caixa"
          value={money(received)}
          detail={
            cash ? `${cash.label} · aberto às ${shortTime(cash.openedAt)}` : "Nenhuma sessão aberta"
          }
          icon={Wallet}
          accent
        />
        <Stat
          label="Dinheiro esperado"
          value={money(cash ? cashExpected(state, cash.id) : 0)}
          detail="Saldo físico da gaveta"
          icon={Banknote}
        />
        <Stat
          label="A receber"
          value={money(
            activeTabs.reduce((sum, entry) => sum + tabTotals(state, entry.id).balanceCents, 0),
          )}
          detail={`${activeTabs.length} comandas em aberto`}
          icon={HandCoins}
        />
      </div>
      {!cash && (
        <div className="notice-banner">
          <Wallet size={18} />
          <span>Abra o caixa para registrar recebimentos, sangrias e estornos.</span>
        </div>
      )}
      <div className="filter-bar">
        <div className="segmented">
          {["contas", "recebimentos", "sessoes"].map((value) => (
            <button
              key={value}
              className={tab === value ? "active" : ""}
              onClick={() => setTab(value)}
            >
              {value === "contas"
                ? "Contas em aberto"
                : value === "recebimentos"
                  ? "Recebimentos"
                  : "Histórico de caixas"}
            </button>
          ))}
        </div>
        {cash && canReceive && (
          <button
            className="btn btn-primary"
            disabled={props.disabled}
            onClick={() => paymentForm(props, [])}
          >
            <Plus size={16} />
            Novo recebimento
          </button>
        )}
      </div>
      <section className="panel">
        {tab === "contas" ? (
          activeTabs.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>COMANDA / MESA</th>
                    <th>TOTAL</th>
                    <th>RECEBIDO</th>
                    <th>SALDO</th>
                    <th>AÇÕES</th>
                  </tr>
                </thead>
                <tbody>
                  {activeTabs.map((entry) => {
                    const total = tabTotals(state, entry.id);
                    return (
                      <tr key={entry.id}>
                        <td>
                          <strong>{entry.label}</strong>
                          <small>{visitLabel(state, entry.visitId)}</small>
                        </td>
                        <td>{money(total.totalCents)}</td>
                        <td>{money(total.paidCents)}</td>
                        <td className="orange-text money">
                          {money(total.balanceCents)}
                          {total.balanceCents < 0 && <small>Devolução pendente</small>}
                        </td>
                        <td>
                          <div className="inline-actions">
                            <button
                              className="text-button"
                              onClick={() => props.inspect(entry.visitId)}
                            >
                              Ver conta
                            </button>
                            {canReceive && cash && total.balanceCents > 0 && (
                              <button
                                className="btn btn-primary btn-small"
                                disabled={props.disabled}
                                onClick={() => paymentForm(props, [entry.id])}
                              >
                                Receber
                              </button>
                            )}
                            {canReceive && total.balanceCents === 0 && (
                              <button
                                className="btn btn-secondary btn-small"
                                disabled={props.disabled}
                                onClick={() =>
                                  props.edit({
                                    title: "Fechar comanda",
                                    description:
                                      "O servidor verificará consumo, produção e recebimentos antes de fechar.",
                                    fields: [],
                                    submitLabel: "Fechar comanda",
                                    submit: async () => {
                                      await props.command("tab.close", { tabId: entry.id });
                                    },
                                  })
                                }
                              >
                                Fechar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="Nenhuma conta em aberto"
              text="As comandas dos atendimentos aparecerão aqui."
            />
          )
        ) : tab === "recebimentos" ? (
          state.payments.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>RECEBIMENTO</th>
                    <th>FORMA</th>
                    <th>VALOR</th>
                    <th>TROCO</th>
                    <th>HORÁRIO</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {state.payments
                    .slice()
                    .reverse()
                    .map((payment) => (
                      <tr key={payment.id}>
                        <td>
                          <strong>#{payment.id.slice(-7).toUpperCase()}</strong>
                          <small>
                            {payment.allocations
                              .map(
                                (allocation) =>
                                  state.tabs.find((entry) => entry.id === allocation.tabId)?.label,
                              )
                              .join(", ")}
                          </small>
                        </td>
                        <td>{payment.method}</td>
                        <td>{money(payment.amountCents)}</td>
                        <td>{money(payment.changeCents)}</td>
                        <td>{fullDate(payment.createdAt)}</td>
                        <td>
                          {state.actor.role === "gestor" && (
                            <button
                              className="text-button"
                              disabled={props.disabled || !cash}
                              onClick={() =>
                                props.edit({
                                  title: "Registrar estorno",
                                  description:
                                    "O recebimento original será preservado. A devolução bancária ocorre fora do TAVO.",
                                  fields: [
                                    field("amount", "Valor a estornar (R$)"),
                                    field("reason", "Motivo", "textarea"),
                                  ],
                                  initial: { amount: (payment.amountCents / 100).toFixed(2) },
                                  submitLabel: "Autorizar estorno",
                                  submit: async (values) => {
                                    await props.command("payment.refund", {
                                      paymentId: payment.id,
                                      amountCents: centsInput(string(values, "amount")),
                                      reason: values.reason,
                                    });
                                  },
                                })
                              }
                            >
                              Estornar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="Ainda sem recebimentos" />
          )
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>CAIXA</th>
                  <th>ABERTURA</th>
                  <th>FECHAMENTO</th>
                  <th>FUNDO</th>
                  <th>DIFERENÇA</th>
                </tr>
              </thead>
              <tbody>
                {state.cashSessions
                  .slice()
                  .reverse()
                  .map((session) => (
                    <tr key={session.id}>
                      <td>
                        <strong>{session.label}</strong>
                        <Status value={session.closedAt ? "fechada" : "aberta"} />
                      </td>
                      <td>{fullDate(session.openedAt)}</td>
                      <td>{fullDate(session.closedAt)}</td>
                      <td>{money(session.openingCents)}</td>
                      <td>
                        {session.differenceCents === null ? "—" : money(session.differenceCents)}
                        <small>{session.closeReason}</small>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
