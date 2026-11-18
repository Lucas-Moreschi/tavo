"use client";

import type { FormField } from "@/shared/ui/dialog";
import type { Values } from "@/shared/types/operation";
import type { AppSnapshot } from "@/domain/types";

export const field = (
  name: string,
  label: string,
  type: FormField["type"] = "text",
  required = true,
): FormField => ({ name, label, type, required });

export const select = (
  name: string,
  label: string,
  options: { value: string; label: string }[],
  multiple = false,
): FormField => ({
  name,
  label,
  type: multiple ? "multiselect" : "select",
  options,
  required: true,
  hint: multiple ? "Use Ctrl/Cmd para selecionar várias opções no computador." : undefined,
});

export const number = (values: Values, key: string) => Number(values[key]);

export const string = (values: Values, key: string) => String(values[key] ?? "");

export const array = (values: Values, key: string) =>
  Array.isArray(values[key]) ? (values[key] as string[]) : [];

export const tableOptions = (state: AppSnapshot, onlyFree = false) =>
  state.tables
    .filter(
      (table) =>
        table.active &&
        (!onlyFree ||
          !state.occupancies.some(
            (occupancy) => occupancy.tableId === table.id && !occupancy.releasedAt,
          )),
    )
    .map((table) => ({
      value: table.id,
      label: `Mesa ${String(table.number).padStart(2, "0")} · ${table.capacity} lugares · ${table.sector}`,
    }));
