"use client";

import { operationDates } from "@/shared/lib/datetime";
import { ArrowUpRight, Plus, ShoppingBag, Truck, Utensils } from "lucide-react";
import { centsInput } from "@/shared/lib/format";
import { channelNames } from "@/shared/lib/operation-utils";
import type { ViewProps } from "@/shared/types/operation";
import { Status, Empty, Heading, Stat } from "@/shared/ui/primitives";

import { field, select, string } from "@/shared/ui/form-fields";

export function ChannelsView(props: ViewProps) {
  const { fullDate, shortDate, shortTime } = operationDates(props.state.restaurant.timezone);
  const { state } = props;
  function create() {
    props.edit({
      title: "Novo pedido fora do salão",
      fields: [
        select(
          "channel",
          "Canal",
          ["balcao", "retirada", "delivery"].map((value) => ({
            value,
            label: channelNames[value],
          })),
        ),
        field("customerName", "Cliente"),
        field("phone", "Telefone", "text", false),
        field("address", "Endereço (delivery)", "textarea", false),
        field("deliveryFee", "Taxa de entrega (R$)"),
        field("label", "Identificação", "text", false),
      ],
      initial: {
        channel: "balcao",
        deliveryFee: (state.restaurant.deliveryFeeCents / 100).toFixed(2),
      },
      submitLabel: "Criar atendimento",
      submit: async (values) => {
        const result = (await props.command("visit.open", {
          ...values,
          people: 1,
          deliveryFeeCents: centsInput(string(values, "deliveryFee")),
        })) as { entityId?: string };
        if (result?.entityId) props.inspect(result.entityId);
      },
    });
  }
  const visits = state.visits.filter((visit) => visit.channel !== "salao");
  return (
    <>
      <Heading
        eyebrow="ATENDIMENTO"
        title="Além do salão"
        description="Balcão, retirada e delivery. O mesmo cuidado em cada canal."
      >
        <button className="btn btn-primary" disabled={props.disabled} onClick={create}>
          <Plus size={17} />
          Novo atendimento
        </button>
      </Heading>
      <div className="stats-grid stats-three">
        {["balcao", "retirada", "delivery"].map((channel, index) => (
          <Stat
            key={channel}
            label={channelNames[channel]}
            value={String(
              visits.filter((visit) => visit.channel === channel && !visit.closedAt).length,
            )}
            detail="Atendimentos em andamento"
            icon={index === 2 ? Truck : index === 1 ? ShoppingBag : Utensils}
            accent={index === 0}
          />
        ))}
      </div>
      <section className="panel">
        {visits.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>CLIENTE / PEDIDO</th>
                  <th>CANAL</th>
                  <th>ABERTURA</th>
                  <th>ENTREGA</th>
                  <th>CONTA</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visits
                  .slice()
                  .reverse()
                  .map((visit) => (
                    <tr key={visit.id}>
                      <td>
                        <strong>{visit.customerName || visit.label}</strong>
                        <small>{visit.phone || visit.address || "Sem contato informado"}</small>
                      </td>
                      <td>{channelNames[visit.channel]}</td>
                      <td>{fullDate(visit.openedAt)}</td>
                      <td>
                        <Status value={visit.deliveryStatus} />
                      </td>
                      <td>
                        <Status value={visit.closedAt ? "fechada" : "aberta"} />
                      </td>
                      <td>
                        <button
                          className="icon-btn"
                          aria-label={`Abrir pedido de ${visit.customerName}`}
                          onClick={() => props.inspect(visit.id)}
                        >
                          <ArrowUpRight size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Pronto para ir além"
            text="Crie um atendimento de balcão, retirada ou delivery."
          />
        )}
      </section>
    </>
  );
}
