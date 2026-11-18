"use client";

import { useState, type FormEvent } from "react";
import { accountOrigin, accountTotals, groupTabs, joiningTabs } from "@/domain/accounts";
import { money } from "@/shared/lib/format";
import { tabTotals } from "@/domain/finance";
import type { RestaurantState, Tab } from "@/domain/types";
import type { ViewProps } from "@/shared/types/operation";
import { Modal } from "@/shared/ui/dialog";

export function AccountBreakdown({ state, tabs }: { state: RestaurantState; tabs: Tab[] }) {
  const total = accountTotals(state, tabs);
  return (
    <div className="account-breakdown">
      <div className="account-origins">
        {tabs.map((tab) => {
          const value = tabTotals(state, tab.id);
          return (
            <div className="account-origin-row" key={tab.id}>
              <div className="account-origin-title">
                <strong>{tab.label}</strong>
                <span>
                  {accountOrigin(state, tab)} · {tab.status}
                </span>
              </div>
              <dl className="account-origin-values">
                <div>
                  <dt>Total</dt>
                  <dd>{money(value.totalCents)}</dd>
                </div>
                <div>
                  <dt>Recebido</dt>
                  <dd>{money(value.paidCents)}</dd>
                </div>
                <div>
                  <dt>{value.balanceCents < 0 ? "A devolver" : "Saldo"}</dt>
                  <dd>{money(Math.abs(value.balanceCents))}</dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>
      <div className="account-totals">
        <span>
          Total <strong>{money(total.totalCents)}</strong>
        </span>
        <span>
          Recebido <strong>{money(total.paidCents)}</strong>
        </span>
        <span>
          A receber <strong>{money(total.dueCents)}</strong>
        </span>
        {total.refundCents > 0 && (
          <span>
            A devolver <strong>{money(total.refundCents)}</strong>
          </span>
        )}
      </div>
      {!tabs.length && <p className="muted">As mesas selecionadas ainda não têm consumo.</p>}
    </div>
  );
}

export function splitGroup(props: ViewProps, groupId: string) {
  props.edit({
    title: "Separar grupo",
    description:
      "Cada comanda mantém os pedidos e os pagamentos de origem. Valores já recebidos não serão redistribuídos.",
    children: <AccountBreakdown state={props.state} tabs={groupTabs(props.state, groupId)} />,
    fields: [],
    submitLabel: "Confirmar separação",
    submit: async () => {
      await props.command("group.split", { groupId });
    },
  });
}

export function GroupDialog({ props, onClose }: { props: ViewProps; onClose: () => void }) {
  const [tableIds, setTableIds] = useState<string[]>([]);
  const [mode, setMode] = useState("separadas");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tabs = joiningTabs(props.state, tableIds);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || props.disabled) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await props.command("group.join", {
        tableIds,
        mode,
        label: String(data.get("label") || ""),
        ...(data.get("people") ? { people: Number(data.get("people")) } : {}),
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível juntar as mesas.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Juntar mesas"
      description="Escolha as mesas e confira o consumo antes de confirmar."
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit} className="modal-form">
        <fieldset className="group-table-options">
          <legend>Mesas do grupo</legend>
          {props.state.tables
            .filter((table) => table.active)
            .map((table) => {
              const occupancy = props.state.occupancies.find(
                (entry) => entry.tableId === table.id && !entry.releasedAt,
              );
              return (
                <label key={table.id}>
                  <input
                    type="checkbox"
                    checked={tableIds.includes(table.id)}
                    onChange={(event) =>
                      setTableIds(
                        event.target.checked
                          ? [...tableIds, table.id]
                          : tableIds.filter((id) => id !== table.id),
                      )
                    }
                  />
                  <span>
                    Mesa {table.number}
                    <small>
                      {occupancy ? "Em atendimento" : "Livre"} · {table.capacity} lugares
                    </small>
                  </span>
                </label>
              );
            })}
        </fieldset>
        <div className="form-grid">
          <label className="field">
            <span>Organização das contas</span>
            <select value={mode} onChange={(event) => setMode(event.target.value)}>
              <option value="unica">Uma conta consolidada</option>
              <option value="separadas">Manter contas separadas</option>
            </select>
          </label>
          <label className="field">
            <span>Nome do grupo</span>
            <input name="label" maxLength={120} />
          </label>
          <label className="field">
            <span>Pessoas {tabs.length ? "(opcional)" : "(obrigatório)"}</span>
            <input name="people" type="number" min="1" required={!tabs.length} />
          </label>
        </div>
        <AccountBreakdown state={props.state} tabs={tabs} />
        <p className="muted">
          {mode === "unica"
            ? "A conta exibirá os itens de todas as comandas, com as origens preservadas."
            : "Cada comanda continuará sendo recebida separadamente."}{" "}
          Você poderá separar o grupo depois.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || props.disabled || tableIds.length < 2}
          >
            {busy ? "Agrupando…" : "Confirmar agrupamento"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
