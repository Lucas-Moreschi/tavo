"use client";

import { useState } from "react";
import { Plus, Search, ShoppingBag, Utensils } from "lucide-react";
import { money } from "@/shared/lib/format";
import type { ViewProps } from "@/shared/types/operation";
import type { Product } from "@/domain/types";
import { ProductEditor } from "@/features/catalog/product-editor";
import { Empty, Heading } from "@/shared/ui/primitives";

import { field } from "@/shared/ui/form-fields";

export function CatalogView(props: ViewProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const products = props.state.products.filter(
    (product) =>
      product.name.toLowerCase().includes(search.toLowerCase()) &&
      (!category || product.categoryId === category),
  );
  return (
    <>
      <Heading
        eyebrow="GESTÃO"
        title="Seu cardápio"
        description="Pratos que contam sua história. Informações que ajudam sua equipe."
      >
        <button
          className="btn btn-secondary"
          disabled={props.disabled}
          onClick={() =>
            props.edit({
              title: "Nova categoria",
              fields: [field("name", "Nome da categoria")],
              submit: async (values) => {
                await props.command("category.save", { name: values.name, active: true });
              },
            })
          }
        >
          <Plus size={16} />
          Categoria
        </button>
        <button
          className="btn btn-primary"
          disabled={props.disabled}
          onClick={() => setEditing("new")}
        >
          <Plus size={17} />
          Adicionar produto
        </button>
      </Heading>
      <div className="filter-bar">
        <div className="category-tabs">
          <button onClick={() => setCategory("")} className={!category ? "active" : ""}>
            Todos os produtos <span>{props.state.products.length}</span>
          </button>
          {props.state.categories
            .filter((entry) => entry.active)
            .map((entry) => (
              <button
                className={category === entry.id ? "active" : ""}
                onClick={() => setCategory(entry.id)}
                key={entry.id}
              >
                {entry.name}
              </button>
            ))}
        </div>
        <label className="search-box">
          <Search size={17} />
          <input
            placeholder="Buscar no cardápio"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>
      <div className="catalog-grid">
        {products.map((product) => (
          <article className="product-card" key={product.id}>
            <div className={`product-visual visual-${product.station}`}>
              {product.imageUrl ? (
                <img src={product.imageUrl} alt={product.name} />
              ) : (
                <span>
                  {product.station === "bar" ? (
                    <WineIcon />
                  ) : product.station === "direto" ? (
                    <ShoppingBag size={42} />
                  ) : (
                    <Utensils size={42} />
                  )}
                </span>
              )}
              {product.tag && <span className="product-tag">{product.tag}</span>}
              <span className={`availability ${product.active ? "" : "paused"}`}>
                <i />
                {product.active ? "Disponível" : "Pausado"}
              </span>
            </div>
            <div className="product-copy">
              <p className="product-category">
                {props.state.categories.find((entry) => entry.id === product.categoryId)?.name} ·{" "}
                {product.station === "direto" ? "Entrega direta" : product.station}
              </p>
              <h3>{product.name}</h3>
              <p>{product.description || "Sem descrição cadastrada."}</p>
              <div className="product-price">
                <strong>{money(product.priceCents)}</strong>
                <button
                  className="btn btn-secondary btn-small"
                  disabled={props.disabled}
                  onClick={() => setEditing(product)}
                >
                  Editar
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {!products.length && (
        <Empty
          title="Seu próximo destaque começa aqui"
          text="Cadastre os primeiros produtos e suas fichas técnicas."
        />
      )}
      {editing && (
        <ProductEditor
          {...props}
          product={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function WineIcon() {
  return (
    <svg
      width="46"
      height="46"
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M10 8h28L24 26 10 8Zm14 18v15m-9 0h18M14 13h20" />
    </svg>
  );
}
