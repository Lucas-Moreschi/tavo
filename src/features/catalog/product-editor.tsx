"use client";

import { FormEvent, useState } from "react";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import type { Product, ProductOption, RecipeLine, StockItem } from "@/domain/types";
import { centsInput } from "@/shared/lib/format";
import { Modal } from "@/shared/ui/dialog";
import type { ViewProps } from "@/shared/types/operation";
import { ImageUpload } from "@/shared/ui/image-upload";

function RecipeRows({
  value,
  onChange,
  stockItems,
  signed = false,
}: {
  value: RecipeLine[];
  onChange: (recipe: RecipeLine[]) => void;
  stockItems: StockItem[];
  signed?: boolean;
}) {
  return (
    <div className="recipe-builder">
      {value.map((line, index) => (
        <div className="recipe-line" key={index}>
          <select
            aria-label={`Ingrediente ${index + 1}`}
            required
            value={line.stockItemId}
            onChange={(event) =>
              onChange(
                value.map((entry, position) =>
                  position === index ? { ...entry, stockItemId: event.target.value } : entry,
                ),
              )
            }
          >
            <option value="">Selecione o ingrediente</option>
            {stockItems
              .filter((item) => item.active)
              .map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name} ({item.unit})
                </option>
              ))}
          </select>
          <input
            type="number"
            aria-label={`Quantidade do ingrediente ${index + 1}`}
            step="0.001"
            min={signed ? undefined : "0.001"}
            required
            value={line.quantityMilli / 1000 || ""}
            placeholder="Qtd."
            onChange={(event) =>
              onChange(
                value.map((entry, position) =>
                  position === index
                    ? { ...entry, quantityMilli: Math.round(Number(event.target.value) * 1000) }
                    : entry,
                ),
              )
            }
          />
          <button
            type="button"
            className="icon-btn"
            aria-label="Remover ingrediente"
            onClick={() => onChange(value.filter((_, position) => position !== index))}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-button"
        onClick={() => onChange([...value, { stockItemId: "", quantityMilli: 0 }])}
      >
        <Plus size={15} />
        Adicionar ingrediente
      </button>
    </div>
  );
}

export function ProductEditor({
  product,
  onClose,
  ...props
}: ViewProps & { product?: Product; onClose: () => void }) {
  const [recipe, setRecipe] = useState<RecipeLine[]>(product?.recipe || []);
  const [options, setOptions] = useState<ProductOption[]>(product?.options || []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await props.command("product.save", {
        ...(product ? { id: product.id } : {}),
        categoryId: String(data.get("categoryId")),
        name: String(data.get("name")),
        description: String(data.get("description")),
        priceCents: centsInput(String(data.get("price"))),
        station: String(data.get("station")),
        active: data.has("active"),
        imageUrl: String(data.get("imageUrl")) || null,
        tag: String(data.get("tag")),
        recipe,
        options,
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={product ? "Editar produto" : "Novo produto"}
      description="Cardápio, produção e estoque começam com uma boa ficha."
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={save} className="modal-form">
        <div className="form-grid">
          <label className="field field-wide">
            <span>Nome do produto</span>
            <input name="name" required defaultValue={product?.name} />
          </label>
          <label className="field">
            <span>Categoria</span>
            <select name="categoryId" required defaultValue={product?.categoryId || ""}>
              <option value="">Selecione</option>
              {props.state.categories
                .filter((category) => category.active)
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            <span>Preço (R$)</span>
            <input
              name="price"
              required
              defaultValue={product ? (product.priceCents / 100).toFixed(2) : ""}
              placeholder="0,00"
              inputMode="decimal"
            />
          </label>
          <label className="field field-wide">
            <span>Descrição</span>
            <textarea
              name="description"
              rows={2}
              maxLength={300}
              defaultValue={product?.description}
            />
          </label>
          <label className="field">
            <span>Estação de produção</span>
            <select name="station" defaultValue={product?.station || "cozinha"}>
              <option value="cozinha">Cozinha</option>
              <option value="bar">Bar</option>
              <option value="direto">Entrega direta / separação</option>
            </select>
          </label>
          <label className="field">
            <span>Selo do cardápio</span>
            <input name="tag" defaultValue={product?.tag} placeholder="Ex.: Mais pedido" />
          </label>
          <ImageUpload name="imageUrl" initial={product?.imageUrl || ""} label="Foto do produto" />
          <label className="field field-check">
            <span>Disponível no cardápio</span>
            <input
              name="active"
              type="checkbox"
              role="switch"
              defaultChecked={product?.active ?? true}
            />
          </label>
        </div>
        <section className="form-section">
          <h3>Ficha técnica</h3>
          <p className="muted">
            Quantidades na unidade base de cada item. Em revenda, selecione o próprio produto
            estocado.
          </p>
          <RecipeRows value={recipe} onChange={setRecipe} stockItems={props.state.stockItems} />
        </section>
        <section className="form-section">
          <div className="section-title">
            <h3>Opções e adicionais</h3>
            <button
              type="button"
              className="text-button"
              onClick={() =>
                setOptions([
                  ...options,
                  { id: crypto.randomUUID(), name: "", priceCents: 0, recipe: [] },
                ])
              }
            >
              <Plus size={15} />
              Adicionar opção
            </button>
          </div>
          <p className="muted">Descreva a opção, o acréscimo e seus ingredientes.</p>
          {options.map((option, index) => (
            <div className="option-editor" key={option.id}>
              <div className="recipe-line">
                <input
                  aria-label="Nome da opção"
                  required
                  placeholder="Ex.: Queijo extra"
                  value={option.name}
                  onChange={(event) =>
                    setOptions(
                      options.map((entry, position) =>
                        position === index ? { ...entry, name: event.target.value } : entry,
                      ),
                    )
                  }
                />
                <input
                  aria-label="Preço adicional em reais"
                  type="number"
                  step="0.01"
                  placeholder="R$"
                  value={option.priceCents / 100}
                  onChange={(event) =>
                    setOptions(
                      options.map((entry, position) =>
                        position === index
                          ? { ...entry, priceCents: Math.round(Number(event.target.value) * 100) }
                          : entry,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Remover opção"
                  onClick={() => setOptions(options.filter((_, position) => position !== index))}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <RecipeRows
                value={option.recipe}
                onChange={(recipeValue) =>
                  setOptions(
                    options.map((entry, position) =>
                      position === index ? { ...entry, recipe: recipeValue } : entry,
                    ),
                  )
                }
                stockItems={props.state.stockItems}
                signed
              />
            </div>
          ))}
        </section>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || props.disabled}>
            {busy && <LoaderCircle size={16} className="spin" />}Salvar produto
          </button>
        </div>
      </form>
    </Modal>
  );
}
