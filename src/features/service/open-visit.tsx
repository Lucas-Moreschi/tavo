"use client";

import type { ViewProps } from "@/shared/types/operation";
import { field, select, number, string, array, tableOptions } from "@/shared/ui/form-fields";

export function openVisit(props: ViewProps, tableId?: string) {
  props.edit({
    title: tableId ? "Abrir mesa" : "Novo atendimento",
    description: "Comece uma visita e acompanhe cada pedido.",
    fields: [
      field("people", "Número de pessoas", "number"),
      field("label", "Identificação (opcional)", "text", false),
      ...(!tableId ? [select("tableIds", "Mesas", tableOptions(props.state, true), true)] : []),
    ],
    initial: { people: 2 },
    submitLabel: "Abrir atendimento",
    submit: async (values) => {
      const result = (await props.command("visit.open", {
        channel: "salao",
        tableIds: tableId ? [tableId] : array(values, "tableIds"),
        people: number(values, "people"),
        label: string(values, "label"),
      })) as { entityId?: string };
      if (result?.entityId) props.inspect(result.entityId);
    },
  });
}
