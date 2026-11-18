"use client";

import { ArrowUpRight, Check, Circle } from "lucide-react";
import type { ViewProps } from "@/shared/types/operation";

export function SetupChecklist({
  props,
  expanded = false,
}: {
  props: Pick<ViewProps, "state" | "navigate">;
  expanded?: boolean;
}) {
  const { state } = props;
  if (state.actor.role !== "gestor") return null;
  const products = state.products.filter(
    (product) =>
      product.active &&
      state.categories.some((category) => category.active && category.id === product.categoryId),
  );
  const recipeIds = new Set(
    products.flatMap((product) =>
      [...product.recipe, ...product.options.flatMap((option) => option.recipe)].map(
        (line) => line.stockItemId,
      ),
    ),
  );
  const steps = [
    {
      title: "Organize as mesas",
      detail: "Use Cadastrar mesa para informar número, setor e capacidade.",
      action: "Configurar mesas",
      view: "mesas",
      done: state.tables.some((table) => table.active),
    },
    {
      title: "Confira o estoque inicial",
      detail: "Cadastre os ingredientes em Novo item e registre a primeira entrada de cada um.",
      action: "Configurar estoque",
      view: "estoque",
      done: recipeIds.size
        ? [...recipeIds].every((id) =>
            state.stockItems.some(
              (item) => item.id === id && item.active && item.quantityMilli > 0,
            ),
          )
        : products.length > 0 ||
          state.stockItems.some((item) => item.active && item.quantityMilli > 0),
    },
    {
      title: "Monte o cardápio e as receitas",
      detail:
        "Use Categoria e depois Adicionar produto para escolher a estação e os ingredientes da receita.",
      action: "Configurar cardápio",
      view: "cardapio",
      done: products.length > 0,
    },
    {
      title: "Prepare os acessos da equipe",
      detail:
        "Use Nova pessoa para cadastrar alguém e escolher sua função. O gestor também pode operar.",
      action: "Configurar equipe",
      view: "equipe",
      done: state.team.filter((member) => member.active).length > 1,
    },
    {
      title: "Abra o primeiro caixa",
      detail: "Clique em Abrir caixa e informe quanto dinheiro tem na gaveta no início do turno.",
      action: "Preparar caixa",
      view: "caixa",
      done: state.cashSessions.length > 0,
    },
  ];
  const completed = steps.filter((step) => step.done).length;
  return (
    <details
      className="panel setup-checklist section-gap no-print"
      open={expanded || completed < steps.length}
    >
      <summary>
        <span>Prepare seu restaurante</span>
        <small>
          {completed} de {steps.length} etapas concluídas
        </small>
      </summary>
      <div className="setup-steps">
        {steps.map((step, index) => (
          <div className={`setup-step ${step.done ? "setup-complete" : ""}`} key={step.view}>
            <span className="setup-step-icon" aria-label={step.done ? "Concluída" : "Pendente"}>
              {step.done ? <Check size={18} /> : <Circle size={18} />}
            </span>
            <div>
              <h3>
                {index + 1}. {step.title}
              </h3>
              <p>{step.detail}</p>
            </div>
            <button className="text-button" onClick={() => props.navigate(step.view)}>
              {step.action}
              <ArrowUpRight size={15} />
            </button>
          </div>
        ))}
      </div>
    </details>
  );
}
