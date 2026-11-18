"use client";

import { SetupChecklist } from "@/features/settings/setup-checklist";
import { Utensils } from "lucide-react";
import { centsInput } from "@/shared/lib/format";
import type { ViewProps } from "@/shared/types/operation";
import { SettingsManagement } from "@/features/settings/settings-management";
import { Heading } from "@/shared/ui/primitives";
import { select } from "@/shared/ui/form-fields";

export function SettingsView(props: ViewProps) {
  const restaurant = props.state.restaurant;
  return (
    <>
      <Heading
        eyebrow="SEU ESPAÇO"
        title="Tudo do seu jeito"
        description="Identidade e parâmetros que mantêm a operação em sintonia."
      />
      <div className="settings-grid">
        <section className="panel settings-card">
          <span className="settings-icon">
            <Utensils size={24} />
          </span>
          <h2>{restaurant.name}</h2>
          <p className="muted">{restaurant.slug}</p>
          <div className="settings-meta">
            <span>
              Plano selecionado<strong>{restaurant.plan}</strong>
            </span>
          </div>
          <p className="settings-disclaimer">
            O plano selecionado não gera assinatura ou cobrança. Seus dados são isolados dos demais
            restaurantes.
          </p>
        </section>
        <section className="panel settings-form">
          <h2>Configurações do restaurante</h2>
          <p className="muted">Confira os parâmetros antes de iniciar os atendimentos.</p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              props.run(() =>
                props.command("settings.update", {
                  name: String(data.get("name")),
                  phone: String(data.get("phone")),
                  address: String(data.get("address")),
                  timezone: String(data.get("timezone")),
                  serviceRateBps: Math.round(Number(data.get("serviceRate")) * 100),
                  reservationMinutes: Number(data.get("reservationMinutes")),
                  deliveryFeeCents: centsInput(String(data.get("deliveryFee"))),
                }),
              );
            }}
          >
            <div className="form-grid">
              <label className="field">
                <span>Nome do restaurante</span>
                <input name="name" required defaultValue={restaurant.name} />
              </label>
              <label className="field">
                <span>Telefone</span>
                <input name="phone" defaultValue={restaurant.phone} />
              </label>
              <label className="field field-wide">
                <span>Endereço</span>
                <input name="address" defaultValue={restaurant.address} />
              </label>
              <label className="field">
                <span>Fuso horário</span>
                <select name="timezone" defaultValue={restaurant.timezone}>
                  <option value="America/Sao_Paulo">Brasília · São Paulo</option>
                  <option value="America/Manaus">Manaus</option>
                  <option value="America/Rio_Branco">Rio Branco</option>
                  <option value="America/Noronha">Fernando de Noronha</option>
                </select>
              </label>
              <label className="field">
                <span>Taxa de serviço (%)</span>
                <input
                  name="serviceRate"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  required
                  defaultValue={restaurant.serviceRateBps / 100}
                />
              </label>
              <label className="field">
                <span>Duração padrão de reservas (min)</span>
                <input
                  name="reservationMinutes"
                  type="number"
                  min="15"
                  max="480"
                  required
                  defaultValue={restaurant.reservationMinutes}
                />
                <small>O início e o fim podem ser ajustados em cada reserva.</small>
              </label>
              <label className="field">
                <span>Taxa padrão de entrega (R$)</span>
                <input
                  name="deliveryFee"
                  required
                  defaultValue={(restaurant.deliveryFeeCents / 100).toFixed(2)}
                />
                <small>O valor pode ser ajustado para cada pedido de delivery.</small>
              </label>
            </div>
            <button className="btn btn-primary" disabled={props.disabled} type="submit">
              Salvar configurações
            </button>
          </form>
        </section>
      </div>
      <SetupChecklist props={props} expanded />
      <SettingsManagement {...props} />
    </>
  );
}
