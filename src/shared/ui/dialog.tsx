"use client";

import { FormEvent, ReactNode, useEffect, useId, useRef, useState } from "react";
import { LoaderCircle, X } from "lucide-react";

export interface FormField {
  name: string;
  label: string;
  type?:
    | "text"
    | "email"
    | "password"
    | "number"
    | "datetime-local"
    | "textarea"
    | "select"
    | "checkbox"
    | "multiselect";
  required?: boolean;
  placeholder?: string;
  hint?: string;
  options?: { value: string; label: string }[];
  min?: number;
  step?: string;
}

export function Modal({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      prior?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={headingId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="modal-heading">
        <div>
          <p className="eyebrow">TAVO · OPERAÇÃO</p>
          <h2 id={headingId}>{title}</h2>
          {description && (
            <p id={descriptionId} className="muted">
              {description}
            </p>
          )}
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Fechar janela">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function FormModal({
  title,
  description,
  fields,
  initial = {},
  submitLabel = "Salvar",
  onSubmit,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  fields: FormField[];
  initial?: Record<string, unknown>;
  submitLabel?: string;
  onSubmit: (values: Record<string, string | boolean | string[]>) => Promise<void>;
  onClose: () => void;
  children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const values: Record<string, string | boolean | string[]> = {};
    fields.forEach((field) => {
      values[field.name] =
        field.type === "checkbox"
          ? data.has(field.name)
          : field.type === "multiselect"
            ? data.getAll(field.name).map(String)
            : String(data.get(field.name) ?? "");
    });
    setBusy(true);
    setError("");
    try {
      await onSubmit(values);
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível concluir. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={title}
      description={description}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="modal-form" onSubmit={submit}>
        {children}
        <div className="form-grid">
          {fields.map((field) => (
            <label
              className={`field ${field.type === "textarea" || field.type === "multiselect" ? "field-wide" : ""} ${field.type === "checkbox" ? "field-check" : ""}`}
              key={field.name}
            >
              <span>
                {field.label}
                {field.required && <span className="required"> *</span>}
              </span>
              {field.type === "select" ? (
                <select
                  name={field.name}
                  required={field.required}
                  defaultValue={String(initial[field.name] ?? "")}
                >
                  <option value="">Selecione</option>
                  {field.options?.map((option) => (
                    <option value={option.value} key={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : field.type === "multiselect" ? (
                <select
                  name={field.name}
                  multiple
                  size={Math.min(6, Math.max(3, field.options?.length ?? 3))}
                  required={field.required}
                  defaultValue={
                    Array.isArray(initial[field.name]) ? (initial[field.name] as string[]) : []
                  }
                >
                  {field.options?.map((option) => (
                    <option value={option.value} key={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : field.type === "textarea" ? (
                <textarea
                  name={field.name}
                  defaultValue={String(initial[field.name] ?? "")}
                  placeholder={field.placeholder}
                  required={field.required}
                  rows={3}
                />
              ) : field.type === "checkbox" ? (
                <input
                  type="checkbox"
                  role="switch"
                  name={field.name}
                  defaultChecked={Boolean(initial[field.name])}
                />
              ) : (
                <input
                  type={field.type ?? "text"}
                  name={field.name}
                  defaultValue={String(initial[field.name] ?? "")}
                  placeholder={field.placeholder}
                  required={field.required}
                  min={field.min}
                  step={field.step}
                  autoComplete={field.type === "password" ? "new-password" : undefined}
                />
              )}
              {field.hint && <small>{field.hint}</small>}
            </label>
          ))}
        </div>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div className="modal-footer">
          <button className="btn btn-secondary" type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy && <LoaderCircle size={16} className="spin" />}
            {busy ? "Salvando…" : submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
