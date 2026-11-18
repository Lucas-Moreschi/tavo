"use client";

import {
  ArrowUpRight,
  CalendarDays,
  CheckCheck,
  ChefHat,
  Settings2,
  Truck,
  Utensils,
  Wallet,
} from "lucide-react";
import type { Role } from "@/domain/types";
import { SetupChecklist } from "@/features/settings/setup-checklist";
import type { ViewProps } from "@/shared/types/operation";
import { Modal } from "@/shared/ui/dialog";

type GuideAction = {
  title: string;
  detail: string;
  button: string;
  view: string;
  roles: Role[];
  icon: typeof Utensils;
};

const actions: GuideAction[] = [
  {
    title: "Abrir uma mesa e lançar pedidos",
    detail:
      "Escolha uma mesa livre, abra o atendimento e adicione os itens à comanda. Clique em Enviar para produção.",
    button: "Ir para mesas",
    view: "mesas",
    roles: ["gestor", "garcom"],
    icon: Utensils,
  },
  {
    title: "Preparar itens de um pedido",
    detail:
      "Na fila da sua estação, clique em Iniciar preparo e depois em Marcar pronto. Informe a quantidade se for preparar só parte do pedido.",
    button: "Ver produção",
    view: "producao",
    roles: ["gestor", "cozinha", "bar"],
    icon: ChefHat,
  },
  {
    title: "Entregar pedidos prontos",
    detail: "Na central de chamados, localize o item e confirme quantas unidades foram entregues.",
    button: "Ver pedidos prontos",
    view: "chamados",
    roles: ["gestor", "garcom"],
    icon: CheckCheck,
  },
  {
    title: "Receber e fechar uma conta",
    detail:
      "No Caixa, abra o turno se precisar e escolha a conta em aberto. Registre o recebimento externo e feche a comanda quando o saldo estiver zerado e os itens entregues.",
    button: "Ir para caixa",
    view: "caixa",
    roles: ["gestor", "caixa"],
    icon: Wallet,
  },
  {
    title: "Gerenciar reservas e fila",
    detail:
      "Em Nova reserva, escolha o início e o fim. Na chegada, use Recepcionar para a reserva ou Sentar para quem está na fila.",
    button: "Ver reservas e fila",
    view: "reservas",
    roles: ["gestor", "garcom", "caixa"],
    icon: CalendarDays,
  },
  {
    title: "Criar um pedido fora do salão",
    detail:
      "Clique em Novo atendimento e escolha balcão, retirada ou delivery. Para delivery, informe o endereço e ajuste a taxa daquele pedido.",
    button: "Ver balcão e delivery",
    view: "canais",
    roles: ["gestor", "garcom", "caixa"],
    icon: Truck,
  },
  {
    title: "Ajustar os padrões do restaurante",
    detail:
      "Revise a taxa de serviço, a duração sugerida das reservas e o valor inicial da taxa de entrega.",
    button: "Ir para configurações",
    view: "configuracoes",
    roles: ["gestor"],
    icon: Settings2,
  },
];

export function OperationGuide({
  state,
  navigate,
  onClose,
}: Pick<ViewProps, "state" | "navigate"> & { onClose: () => void }) {
  function goTo(view: string) {
    onClose();
    navigate(view);
  }

  return (
    <Modal
      title="Guia de operação"
      description="Escolha o que você precisa fazer agora."
      onClose={onClose}
    >
      <div className="operation-guide">
        <div className="setup-steps">
          {actions
            .filter((action) => action.roles.includes(state.actor.role))
            .map((action) => (
              <div className="setup-step" key={action.view}>
                <action.icon className="setup-step-icon" size={18} aria-hidden />
                <div>
                  <h3>{action.title}</h3>
                  <p>{action.detail}</p>
                </div>
                <button className="text-button" onClick={() => goTo(action.view)}>
                  {action.button}
                  <ArrowUpRight size={15} aria-hidden />
                </button>
              </div>
            ))}
        </div>
        <SetupChecklist props={{ state, navigate: goTo }} />
      </div>
    </Modal>
  );
}
