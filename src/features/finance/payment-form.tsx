"use client";

import { AccountBreakdown } from "@/features/service/groups";
import { centsInput, money } from "@/shared/lib/format";
import { tabTotals, visitLabel } from "@/shared/lib/operation-utils";
import type { ViewProps } from "@/shared/types/operation";
import { itemPayableCents } from "@/domain/finance";
import { field, select, string, array } from "@/shared/ui/form-fields";

export function paymentForm(
  props: ViewProps,
  tabIds: string[],
  config?: { amountCents?: number; itemIds?: string[] },
) {
  const total =
    config?.amountCents ??
    (config?.itemIds?.length
      ? Math.min(
          tabIds.reduce((sum, id) => sum + Math.max(0, tabTotals(props.state, id).balanceCents), 0),
          config.itemIds.reduce((sum, id) => sum + itemPayableCents(props.state, id), 0),
        )
      : tabIds.reduce((sum, id) => sum + Math.max(0, tabTotals(props.state, id).balanceCents), 0));
  props.edit({
    title: "Registrar recebimento",
    description:
      "Confirme o pagamento recebido externamente. Nenhuma transação bancária será realizada pelo TAVO.",
    children: tabIds.length ? (
      <AccountBreakdown
        state={props.state}
        tabs={props.state.tabs.filter((tab) => tabIds.includes(tab.id))}
      />
    ) : undefined,
    fields: [
      select(
        "tabIds",
        "Comandas",
        props.state.tabs
          .filter((tab) => tab.status === "aberta" && (!tabIds.length || tabIds.includes(tab.id)))
          .map((tab) => ({
            value: tab.id,
            label: `${tab.label} · ${visitLabel(props.state, tab.visitId)} · ${money(tabTotals(props.state, tab.id).balanceCents)}`,
          })),
        true,
      ),
      field("amount", "Valor aplicado à conta (R$)"),
      select("method", "Forma de pagamento", [
        { value: "pix", label: "Pix" },
        { value: "credito", label: "Cartão de crédito" },
        { value: "debito", label: "Cartão de débito" },
        { value: "dinheiro", label: "Dinheiro" },
      ]),
      field("tendered", "Dinheiro entregue pelo cliente (R$, se aplicável)", "text", false),
      field("reference", "Referência / observação", "text", false),
    ],
    initial: { tabIds, amount: (total / 100).toFixed(2), method: "pix" },
    submitLabel: "Confirmar recebimento externo",
    submit: async (values) => {
      await props.command("payment.record", {
        tabIds: array(values, "tabIds"),
        amountCents: centsInput(string(values, "amount")),
        method: values.method,
        ...(values.tendered ? { tenderedCents: centsInput(string(values, "tendered")) } : {}),
        reference: values.reference,
        ...(config?.itemIds ? { itemIds: config.itemIds } : {}),
      });
    },
  });
}
