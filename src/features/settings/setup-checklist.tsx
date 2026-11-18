"use client";

import { ArrowUpRight, Check, Circle } from "lucide-react";
import type { ViewProps } from "@/shared/types/operation";

export function SetupChecklist({
  props,
  expanded = false,
}: {
  props: ViewProps;
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
      detail: "Cadastre os números, setores e a capacidade do salão.",
      view: "mesas",
      done: state.tables.some((table) => table.active),
    },
    {
      title: "Monte o cardápio e as receitas",
      detail: "Cadastre categorias, produtos, adicionais e ingredientes de cada receita.",
      view: "cardapio",
      done: products.length > 0,
    },
    {
      title: "Confira o estoque inicial",
      detail: "Registre entradas para os ingredientes e produtos usados no cardápio.",
      view: "estoque",
      done:
        products.length > 0 &&
        (recipeIds.size === 0 ||
          [...recipeIds].every((id) =>
            state.stockItems.some(
              (item) => item.id === id && item.active && item.quantityMilli > 0,
            ),
          )),
    },
    {
      title: "Prepare os acessos da equipe",
      detail: "Adicione as pessoas e defina quem atende, produz e recebe.",
      view: "equipe",
      done: state.team.filter((member) => member.active).length > 1,
    },
    {
      title: "Abra o primeiro caixa",
      detail: "Informe o fundo em dinheiro para registrar os recebimentos.",
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
      <p className="muted">
        Siga os atalhos para começar. A conferência acompanha os cadastros; você pode operar com o
        gestor enquanto prepara a equipe.
      </p>
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
              {step.done ? "Revisar" : "Configurar"}
              <ArrowUpRight size={15} />
            </button>
          </div>
        ))}
      </div>
    </details>
  );
}
