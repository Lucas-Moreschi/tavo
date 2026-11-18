"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRightLeft,
  Check,
  CheckCheck,
  GitMerge,
  Minus,
  Plus,
  Printer,
  Receipt,
  Search,
  Send,
  Settings2,
  ShoppingBag,
  Users,
  Utensils,
  Wallet,
  X,
} from "lucide-react";
import { centsInput, money, splitCents } from "@/shared/lib/format";
import { accountOrigin, accountTotals, groupTabs } from "@/domain/accounts";
import { operationDates } from "@/shared/lib/datetime";
import { AccountBreakdown, splitGroup } from "@/features/service/groups";
import type { ViewProps } from "@/shared/types/operation";
import { array, field, number, select, string, tableOptions } from "@/shared/ui/form-fields";
import { Empty, Heading, Status } from "@/shared/ui/primitives";
import { paymentForm } from "@/features/finance/payment-form";
import { channelNames, elapsed, tabTotals, visitLabel } from "@/shared/lib/operation-utils";

export function VisitDetail(props: ViewProps & { visitId: string; onBack: () => void }) {
  const { state, visitId } = props;
  const visit = state.visits.find((entry) => entry.id === visitId);
  const group = state.groups.find((entry) => entry.id === visit?.groupId);
  const tabs = group
    ? groupTabs(state, group.id)
    : state.tabs.filter((tab) => tab.visitId === visitId);
  const [scope, setScope] = useState<"group" | "tab">(group?.mode === "unica" ? "group" : "tab");
  const [tabId, setTabId] = useState(
    tabs.find((tab) => tab.status === "aberta")?.id || tabs[0]?.id || "",
  );
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [split, setSplit] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    setSelected([]);
  }, [state.version]);
  useEffect(() => {
    if (!tabs.some((tab) => tab.id === tabId)) setTabId(tabs[0]?.id || "");
  }, [tabs, tabId]);
  if (!visit)
    return (
      <Empty title="Atendimento não encontrado" text="Atualize a operação ou volte para o salão." />
    );
  const tab = tabs.find((entry) => entry.id === tabId);
  const consolidated = scope === "group" && !!group;
  const attendance = consolidated
    ? visit
    : state.visits.find((entry) => entry.id === tab?.visitId) || visit;
  const groupPeople = group
    ? state.visits
        .filter((entry) => entry.groupId === group.id)
        .reduce((sum, entry) => sum + entry.people, 0)
    : visit.people;
  const accountTabs = consolidated ? tabs : tabs.filter((entry) => entry.id === tabId);
  const accountIds = accountTabs.map((entry) => entry.id);
  const items = state.items.filter((item) => accountIds.includes(item.tabId));
  const totals = accountTotals(state, accountTabs);
  const { fullDate } = operationDates(state.restaurant.timezone);
  const products = state.products.filter(
    (product) =>
      product.active &&
      state.categories.some((entry) => entry.id === product.categoryId && entry.active) &&
      (!category || product.categoryId === category) &&
      product.name.toLowerCase().includes(search.toLowerCase()),
  );
  const hasDraft = items.some((item) => item.status === "rascunho");
  const canServe = ["gestor", "garcom"].includes(state.actor.role);
  const canReceive = ["gestor", "caixa"].includes(state.actor.role);
  const payableTabs = accountTabs
    .filter((entry) => entry.status === "aberta" && tabTotals(state, entry.id).balanceCents > 0)
    .map((entry) => entry.id);
  const openTabs = accountTabs.filter((entry) => entry.status === "aberta");
  function closeGroup() {
    props.edit({
      title: "Encerrar grupo e liberar mesas",
      description:
        "Todas as comandas precisam estar quitadas, com os itens entregues. A conferência e a liberação ocorrem juntas.",
      children: <AccountBreakdown state={state} tabs={tabs} />,
      fields: [field("reason", "Motivo / observação (obrigatório sem consumo)", "textarea", false)],
      submitLabel: "Encerrar grupo",
      submit: async (values) => {
        await props.command("group.close", { groupId: group!.id, reason: values.reason });
        props.onBack();
      },
    });
  }
  function add(productId: string) {
    const product = state.products.find((entry) => entry.id === productId)!;
    props.edit({
      title: product.name,
      description: `${money(product.priceCents)} · ${product.description}`,
      fields: [
        field("quantity", "Quantidade", "number"),
        ...(product.options.length
          ? [
              {
                ...select(
                  "optionIds",
                  "Opções e adicionais",
                  product.options.map((option) => ({
                    value: option.id,
                    label: `${option.name} ${option.priceCents ? `+ ${money(option.priceCents)}` : ""}`,
                  })),
                  true,
                ),
                required: false,
              },
            ]
          : []),
        field("notes", "Observações / restrições", "textarea", false),
      ],
      initial: { quantity: 1 },
      submitLabel: "Adicionar à comanda",
      submit: async (values) => {
        await props.command("item.add", {
          tabId,
          productId,
          quantity: number(values, "quantity"),
          notes: values.notes,
          optionIds: array(values, "optionIds"),
        });
      },
    });
  }
  function closeVisit() {
    props.edit({
      title: "Encerrar atendimento",
      description:
        "Todas as comandas devem estar quitadas e encerradas. As mesas serão liberadas após a validação.",
      fields: [field("reason", "Motivo / observação (obrigatório sem consumo)", "textarea", false)],
      submitLabel: "Encerrar e liberar mesa",
      submit: async (values) => {
        await props.command("visit.close", { visitId: attendance.id, reason: values.reason });
        props.onBack();
      },
    });
  }
  function adjustment() {
    if (!tab) return;
    props.edit({
      title: "Ajustar conta",
      description: "Alterações financeiras exigem autorização do gestor e ficam no histórico.",
      fields: [
        field("serviceRate", "Taxa de serviço (%)", "number"),
        field("discount", "Desconto (R$)"),
        field("extra", "Acréscimo / taxa de entrega (R$)"),
        field("reason", "Motivo", "textarea"),
      ],
      initial: {
        serviceRate: tab.serviceRateBps / 100,
        discount: (tab.discountCents / 100).toFixed(2),
        extra: (tab.extraCents / 100).toFixed(2),
      },
      submit: async (values) => {
        await props.command("tab.adjust", {
          tabId,
          serviceRateBps: Math.round(number(values, "serviceRate") * 100),
          discountCents: centsInput(string(values, "discount")),
          extraCents: centsInput(string(values, "extra")),
          reason: values.reason,
        });
      },
    });
  }
  return (
    <>
      <button className="back-link no-print" onClick={props.onBack}>
        <ArrowLeft size={16} />
        Voltar para a operação
      </button>
      <Heading
        eyebrow={
          attendance.channel === "salao"
            ? "ATENDIMENTO NO SALÃO"
            : channelNames[attendance.channel].toUpperCase()
        }
        title={consolidated ? group!.label : visitLabel(state, attendance.id)}
        description={`${consolidated ? `${groupPeople} pessoas` : attendance.customerName || `${attendance.people} pessoas`} · aberto há ${elapsed(attendance.openedAt)}${group ? ` · ${group.label}` : ""}`}
      >
        <button className="btn btn-secondary" onClick={() => window.print()}>
          <Printer size={16} />
          Imprimir conta
        </button>
        {canServe && !consolidated && !attendance.closedAt && (
          <button
            className="btn btn-secondary"
            disabled={props.disabled}
            onClick={() =>
              props.edit({
                title: "Editar atendimento",
                fields: [field("people", "Pessoas", "number"), field("label", "Identificação")],
                initial: { people: attendance.people, label: attendance.label },
                submit: async (values) => {
                  await props.command("visit.update", {
                    visitId: attendance.id,
                    people: number(values, "people"),
                    label: values.label,
                  });
                },
              })
            }
          >
            <Settings2 size={16} />
            Editar
          </button>
        )}
        {canReceive && !attendance.closedAt && (
          <button
            className="btn btn-secondary"
            disabled={props.disabled}
            onClick={consolidated ? closeGroup : closeVisit}
          >
            {consolidated ? "Encerrar grupo" : "Encerrar atendimento"}
          </button>
        )}
      </Heading>
      {group && (
        <div className="notice-banner no-print">
          <GitMerge size={18} />
          <span>
            Parte de <strong>{group.label}</strong> ·{" "}
            {group.mode === "unica" ? "Conta consolidada" : "Contas separadas"}. Pagamentos
            anteriores são preservados.
          </span>
          {canServe && !group.closedAt && (
            <button
              className="text-button"
              disabled={props.disabled}
              onClick={() => splitGroup(props, group.id)}
            >
              Separar
            </button>
          )}
        </div>
      )}
      {attendance.channel === "delivery" && (
        <div className="notice-banner no-print">
          <ShoppingBag size={18} />
          <span>
            {attendance.customerName} · {attendance.phone} · {attendance.address}
          </span>
          <Status value={attendance.deliveryStatus} />
          {attendance.deliveryStatus !== "entregue" && (
            <button
              className="text-button"
              disabled={props.disabled}
              onClick={() =>
                props.run(() =>
                  props.command("visit.update", {
                    visitId: attendance.id,
                    deliveryStatus:
                      attendance.deliveryStatus === "aguardando" ? "despachado" : "entregue",
                  }),
                )
              }
            >
              {attendance.deliveryStatus === "aguardando"
                ? "Despachar entrega"
                : "Confirmar entrega"}
            </button>
          )}
        </div>
      )}
      <div className="visit-layout">
        <section className="panel tab-panel">
          <div className="panel-heading">
            <div>
              <h2>
                {consolidated ? "Conta do grupo" : "Comanda"}{" "}
                <span className="small-count">
                  {items
                    .filter((item) => item.status !== "cancelado")
                    .reduce((sum, item) => sum + item.quantity, 0)}{" "}
                  itens
                </span>
              </h2>
              <p>Cada pedido tem seu lugar.</p>
            </div>
            {canServe && !attendance.closedAt && (
              <button
                className="text-button"
                disabled={props.disabled}
                onClick={() =>
                  props.edit({
                    title: "Nova comanda individual",
                    fields: [field("label", "Nome, apelido ou número")],
                    submitLabel: "Abrir comanda",
                    submit: async (values) => {
                      await props.command("tab.create", {
                        visitId: tab?.visitId || visitId,
                        label: values.label,
                      });
                    },
                  })
                }
              >
                <Plus size={15} />
                Comanda
              </button>
            )}
          </div>
          <div className="tab-selector no-print">
            {group?.mode === "unica" && (
              <button
                className={consolidated ? "active" : ""}
                onClick={() => {
                  setScope("group");
                  setSelected([]);
                }}
              >
                <GitMerge size={15} />
                Conta do grupo
              </button>
            )}
            {tabs.map((entry) => (
              <button
                className={!consolidated && entry.id === tabId ? "active" : ""}
                key={entry.id}
                onClick={() => {
                  setTabId(entry.id);
                  setScope("tab");
                  setSelected([]);
                }}
              >
                <Receipt size={15} />
                {entry.label}
                {group && ` (${accountOrigin(state, entry)})`}
                {entry.status === "fechada" && <Check size={13} />}
              </button>
            ))}
          </div>
          {consolidated && <AccountBreakdown state={state} tabs={accountTabs} />}
          <div className="comanda-items">
            {items.length ? (
              items.map((item) => (
                <div
                  className={`comanda-item ${item.status === "cancelado" ? "item-cancelled" : ""}`}
                  key={item.id}
                >
                  <div className="comanda-item-title">
                    {canReceive &&
                      item.status !== "cancelado" &&
                      item.status !== "rascunho" &&
                      state.tabs.find((entry) => entry.id === item.tabId)?.status === "aberta" && (
                        <input
                          className="no-print"
                          type="checkbox"
                          aria-label={`Selecionar ${item.name} para pagamento`}
                          checked={selected.includes(item.id)}
                          onChange={(event) =>
                            setSelected(
                              event.target.checked
                                ? [...selected, item.id]
                                : selected.filter((id) => id !== item.id),
                            )
                          }
                        />
                      )}
                    <span className="item-count">{item.quantity}×</span>
                    <div>
                      <strong>{item.name}</strong>
                      {consolidated && (
                        <p>
                          {accountOrigin(
                            state,
                            state.tabs.find((entry) => entry.id === item.tabId)!,
                          )}{" "}
                          / {state.tabs.find((entry) => entry.id === item.tabId)?.label}
                        </p>
                      )}
                      {item.optionLabels?.length ? <p>{item.optionLabels.join(" - ")}</p> : null}
                      {item.notes && <p>{item.notes}</p>}
                      <Status value={item.status} />
                    </div>
                    <strong className="item-price">
                      {money(item.unitPriceCents * item.quantity)}
                    </strong>
                  </div>
                  <div className="comanda-item-actions no-print">
                    {item.status === "rascunho" && canServe && (
                      <div className="quantity-stepper">
                        <button
                          disabled={props.disabled}
                          onClick={() =>
                            props.run(() =>
                              props.command("item.quantity", {
                                itemId: item.id,
                                quantity: item.quantity - 1,
                              }),
                            )
                          }
                          aria-label={`Diminuir ${item.name}`}
                        >
                          <Minus size={13} />
                        </button>
                        <span>{item.quantity}</span>
                        <button
                          disabled={props.disabled}
                          onClick={() =>
                            props.run(() =>
                              props.command("item.quantity", {
                                itemId: item.id,
                                quantity: item.quantity + 1,
                              }),
                            )
                          }
                          aria-label={`Aumentar ${item.name}`}
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                    )}
                    {item.status !== "cancelado" &&
                      (item.readyQuantity ?? (item.status === "pronto" ? item.quantity : 0)) >
                        (item.deliveredQuantity ?? 0) &&
                      ["gestor", "garcom"].includes(state.actor.role) && (
                        <button
                          className="text-button green-text"
                          disabled={props.disabled}
                          onClick={() =>
                            props.run(() => props.command("item.deliver", { itemId: item.id }))
                          }
                        >
                          <CheckCheck size={14} />
                          Entregue
                        </button>
                      )}
                    {item.status !== "cancelado" && canServe && (
                      <button
                        className="text-button"
                        disabled={props.disabled}
                        onClick={() =>
                          props.edit({
                            title: "Transferir consumo",
                            description:
                              "Os estados da produção e os movimentos de estoque permanecem iguais.",
                            fields: [
                              select(
                                "targetTabId",
                                "Comanda de destino",
                                state.tabs
                                  .filter(
                                    (entry) => entry.id !== item.tabId && entry.status === "aberta",
                                  )
                                  .map((entry) => ({
                                    value: entry.id,
                                    label: `${entry.label} · ${visitLabel(state, entry.visitId)}`,
                                  })),
                              ),
                            ],
                            submit: async (values) => {
                              await props.command("item.transfer", {
                                itemId: item.id,
                                targetTabId: values.targetTabId,
                              });
                            },
                          })
                        }
                      >
                        Transferir
                      </button>
                    )}
                    {item.status !== "cancelado" &&
                      ((item.status === "rascunho" && canServe) ||
                        state.actor.role === "gestor") && (
                        <button
                          className="text-button muted"
                          disabled={props.disabled}
                          onClick={() =>
                            props.edit({
                              title:
                                item.status === "rascunho"
                                  ? "Remover item"
                                  : "Cancelar item enviado",
                              description:
                                item.status === "rascunho"
                                  ? "O item será retirado do rascunho."
                                  : "A operação preservará histórico e aplicará liberação de reserva ou perda conforme o preparo.",
                              fields: [
                                field("quantity", "Quantidade a cancelar", "number"),
                                field("reason", "Motivo", "textarea"),
                              ],
                              initial: { quantity: item.quantity },
                              submitLabel: "Confirmar cancelamento",
                              submit: async (values) => {
                                await props.command(
                                  item.status === "rascunho" ? "item.quantity" : "item.cancel",
                                  item.status === "rascunho"
                                    ? {
                                        itemId: item.id,
                                        quantity: Math.max(
                                          0,
                                          item.quantity - number(values, "quantity"),
                                        ),
                                      }
                                    : {
                                        itemId: item.id,
                                        quantity: number(values, "quantity"),
                                        reason: values.reason,
                                      },
                                );
                              },
                            })
                          }
                        >
                          <X size={13} />
                          Cancelar
                        </button>
                      )}
                  </div>
                </div>
              ))
            ) : (
              <Empty
                title="A mesa está pronta para pedir"
                text="Escolha os produtos no cardápio ao lado."
              />
            )}
          </div>
          <div className="tab-summary">
            <div>
              <span>Subtotal</span>
              <strong>{money(totals.subtotalCents)}</strong>
            </div>
            <div>
              <span>
                {consolidated
                  ? "Serviço (por comanda)"
                  : `Serviço (${(tab?.serviceRateBps ?? 0) / 100}%)`}
              </span>
              <span>{money(totals.serviceCents)}</span>
            </div>
            {totals.discountCents > 0 && (
              <div>
                <span>Desconto</span>
                <span>− {money(totals.discountCents)}</span>
              </div>
            )}
            {totals.extraCents > 0 && (
              <div>
                <span>Acréscimos / entrega</span>
                <span>{money(totals.extraCents)}</span>
              </div>
            )}
            <div className="summary-total">
              <span>{consolidated ? "Total do grupo" : "Total da comanda"}</span>
              <strong>{money(totals.totalCents)}</strong>
            </div>
            <div>
              <span>Recebido</span>
              <strong className="green-text">{money(totals.paidCents)}</strong>
            </div>
            <div className="summary-balance">
              <span>Falta receber</span>
              <strong>{money(totals.dueCents)}</strong>
            </div>
            {totals.refundCents > 0 && (
              <div className="form-error">
                <span>
                  Devolução pendente: {money(totals.refundCents)}. O gestor deve registrar o estorno
                  antes de receber ou encerrar o grupo.
                </span>
              </div>
            )}
            {!consolidated && state.actor.role === "gestor" && tab?.status === "aberta" && (
              <button
                className="text-button no-print"
                onClick={adjustment}
                disabled={props.disabled}
              >
                <Settings2 size={14} />
                Ajustar serviço, desconto e acréscimos
              </button>
            )}
            <div className="split-calculator no-print">
              <label>
                Dividir igualmente por{" "}
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={split}
                  onChange={(event) =>
                    setSplit(
                      Math.max(1, Math.min(100, Math.floor(Number(event.target.value) || 1))),
                    )
                  }
                />
              </label>
              <small>
                {splitCents(totals.dueCents, split)
                  .map((part) => money(part))
                  .join(" + ")}
              </small>
            </div>
            <div className="tab-primary-actions no-print">
              {canReceive && consolidated && !group?.closedAt && (
                <button
                  className="btn btn-secondary"
                  disabled={props.disabled}
                  onClick={closeGroup}
                >
                  Encerrar grupo e liberar mesas
                </button>
              )}
              {canServe && openTabs.length > 0 && (
                <button
                  className="btn btn-primary"
                  disabled={props.disabled || !hasDraft}
                  onClick={() =>
                    props.run(() =>
                      props.command("order.send", { tabIds: openTabs.map((entry) => entry.id) }),
                    )
                  }
                >
                  <Send size={16} />
                  Enviar para produção
                </button>
              )}
              {canReceive && openTabs.length > 0 && totals.dueCents > 0 && (
                <button
                  className="btn btn-primary"
                  disabled={props.disabled || totals.refundCents > 0}
                  onClick={() =>
                    paymentForm(
                      props,
                      payableTabs.length ? payableTabs : [tabId],
                      selected.length
                        ? { itemIds: selected }
                        : split > 1
                          ? { amountCents: splitCents(totals.dueCents, split)[0] }
                          : undefined,
                    )
                  }
                >
                  <Wallet size={16} />
                  {selected.length
                    ? `Receber ${selected.length} itens`
                    : consolidated
                      ? "Receber conta do grupo"
                      : split > 1
                        ? "Receber uma parte"
                        : "Registrar recebimento"}
                </button>
              )}
              {canReceive &&
                !consolidated &&
                tab?.status === "aberta" &&
                totals.balanceCents === 0 && (
                  <button
                    className="btn btn-secondary"
                    disabled={props.disabled}
                    onClick={() => props.run(() => props.command("tab.close", { tabId }))}
                  >
                    <Check size={16} />
                    Fechar comanda
                  </button>
                )}
              {!consolidated && state.actor.role === "gestor" && tab?.status === "fechada" && (
                <button
                  className="btn btn-secondary"
                  disabled={props.disabled}
                  onClick={() =>
                    props.edit({
                      title: "Reabrir comanda",
                      description: "A mesa física não será reocupada automaticamente.",
                      fields: [field("reason", "Motivo", "textarea")],
                      submitLabel: "Reabrir",
                      submit: async (values) => {
                        await props.command("tab.reopen", { tabId, reason: values.reason });
                      },
                    })
                  }
                >
                  Reabrir comanda
                </button>
              )}
            </div>
          </div>
          <div className="print-only receipt-footer">
            <h3>Recebimentos externos</h3>
            {state.payments
              .filter((payment) =>
                payment.allocations.some((allocation) => accountIds.includes(allocation.tabId)),
              )
              .map((payment) => (
                <p key={payment.id}>
                  {payment.method}:{" "}
                  {money(
                    payment.allocations
                      .filter((allocation) => accountIds.includes(allocation.tabId))
                      .reduce((sum, allocation) => sum + allocation.amountCents, 0),
                  )}{" "}
                  - #{payment.id.slice(-8)}
                </p>
              ))}
            {state.refunds
              .filter((refund) =>
                refund.allocations.some((allocation) => accountIds.includes(allocation.tabId)),
              )
              .map((refund) => (
                <p key={refund.id}>
                  Estorno:{" "}
                  {money(
                    refund.allocations
                      .filter((allocation) => accountIds.includes(allocation.tabId))
                      .reduce((sum, allocation) => sum + allocation.amountCents, 0),
                  )}
                </p>
              ))}
            <p>
              {state.restaurant.name} · {state.restaurant.address}
            </p>
            <p>
              {consolidated ? `Grupo #${group!.id.slice(-8)}` : `Comanda #${tabId.slice(-8)}`} ·{" "}
              {fullDate(new Date().toISOString())}
            </p>
            <strong>DOCUMENTO NÃO FISCAL</strong>
            <p>Obrigado pela visita. Volte sempre!</p>
          </div>
        </section>
        <section className="menu-panel no-print">
          <label className="field">
            <span>Adicionar pedidos na comanda</span>
            <select
              aria-label="Comanda dos novos pedidos"
              value={tabId}
              onChange={(event) => setTabId(event.target.value)}
            >
              {tabs.map((entry) => (
                <option value={entry.id} key={entry.id} disabled={entry.status !== "aberta"}>
                  {accountOrigin(state, entry)} / {entry.label}
                  {entry.status === "fechada" ? " (fechada)" : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="menu-panel-heading">
            <div>
              <span className="eyebrow">FEITO PARA RECEBER BEM</span>
              <h2>O que vamos pedir?</h2>
            </div>
            <span>{state.products.filter((product) => product.active).length} opções</span>
          </div>
          <label className="search-box menu-search">
            <Search size={17} />
            <input
              placeholder="Encontre um prato, bebida ou sobremesa"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className="category-tabs menu-categories">
            <button className={!category ? "active" : ""} onClick={() => setCategory("")}>
              Todos
            </button>
            {state.categories
              .filter((entry) => entry.active)
              .map((entry) => (
                <button
                  key={entry.id}
                  className={category === entry.id ? "active" : ""}
                  onClick={() => setCategory(entry.id)}
                >
                  {entry.name}
                </button>
              ))}
          </div>
          <div className="order-menu-grid">
            {products.map((product) => (
              <article className="menu-product" key={product.id}>
                <div className={`menu-product-art visual-${product.station}`}>
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt="" />
                  ) : product.station === "cozinha" ? (
                    <Utensils size={32} />
                  ) : (
                    <ShoppingBag size={32} />
                  )}
                </div>
                <div className="menu-product-copy">
                  <small>
                    {state.categories.find((entry) => entry.id === product.categoryId)?.name}
                  </small>
                  <h3>{product.name}</h3>
                  <p>{product.description}</p>
                  <div>
                    <strong>{money(product.priceCents)}</strong>
                    <button
                      className="add-product"
                      disabled={
                        props.disabled ||
                        !canServe ||
                        tab?.status !== "aberta" ||
                        !!state.visits.find((entry) => entry.id === tab.visitId)?.closedAt
                      }
                      aria-label={`Adicionar ${product.name}`}
                      onClick={() => add(product.id)}
                    >
                      <Plus size={20} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {!products.length && (
            <Empty
              title="Nenhum produto encontrado"
              text="Ajuste os filtros ou confira o cadastro do cardápio."
            />
          )}
          <div className="visit-tools">
            {canServe &&
              !consolidated &&
              attendance.channel === "salao" &&
              !attendance.closedAt && (
                <button
                  className="btn btn-secondary"
                  disabled={props.disabled}
                  onClick={() =>
                    props.edit({
                      title: "Transferir atendimento",
                      description:
                        "Pedidos e pagamentos continuam com a visita; muda apenas a mesa ocupada.",
                      fields: [select("tableId", "Nova mesa", tableOptions(state, true))],
                      submitLabel: "Transferir",
                      submit: async (values) => {
                        await props.command("visit.transfer", {
                          visitId: attendance.id,
                          tableId: values.tableId,
                        });
                      },
                    })
                  }
                >
                  <ArrowRightLeft size={16} />
                  Trocar de mesa
                </button>
              )}
            <button
              className="btn btn-secondary"
              disabled={props.disabled}
              onClick={() =>
                props.edit({
                  title: "Pedir apoio",
                  fields: [
                    select("destination", "Destino", [
                      { value: "cozinha", label: "Cozinha" },
                      { value: "bar", label: "Bar" },
                      { value: "salao", label: "Salão" },
                    ]),
                    field("message", "Mensagem", "textarea"),
                  ],
                  submitLabel: "Enviar chamado",
                  submit: async (values) => {
                    await props.command("call.create", { ...values, visitId: attendance.id });
                  },
                })
              }
            >
              <Users size={16} />
              Pedir apoio
            </button>
          </div>
        </section>
      </div>
    </>
  );
}
