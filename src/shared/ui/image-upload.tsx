"use client";

import { useState } from "react";
import { ImagePlus, LoaderCircle, X } from "lucide-react";

export function ImageUpload({
  name,
  initial = "",
  label = "Foto",
}: {
  name: string;
  initial?: string;
  label?: string;
}) {
  const [url, setUrl] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="field field-wide">
      <span>{label}</span>
      <input name={name} type="hidden" value={url} />
      <div className="image-uploader">
        {url ? (
          <img src={url} alt="Prévia da imagem" />
        ) : (
          <span className="image-uploader-placeholder">
            <ImagePlus size={25} />
          </span>
        )}
        <div>
          <label className="btn btn-secondary btn-small">
            <input
              type="file"
              className="sr-only"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (!navigator.onLine) {
                  setError("Conecte-se para enviar a imagem.");
                  return;
                }
                setBusy(true);
                setError("");
                window.dispatchEvent(new CustomEvent("tavo:mutation-start"));
                try {
                  const form = new FormData();
                  form.set("file", file);
                  const response = await fetch("/api/files", { method: "POST", body: form });
                  const data = await response.json();
                  if (!response.ok)
                    throw new Error(data.erro || "Não foi possível enviar a imagem.");
                  setUrl(data.url);
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : "Falha no envio.");
                } finally {
                  setBusy(false);
                  window.dispatchEvent(new CustomEvent("tavo:mutation-end"));
                }
              }}
            />
            {busy ? <LoaderCircle size={15} className="spin" /> : <ImagePlus size={15} />}{" "}
            {busy ? "Enviando…" : url ? "Trocar foto" : "Enviar foto"}
          </label>
          <small>JPG, PNG ou WebP. Até 3 MB.</small>
          {url && (
            <button
              className="text-button"
              type="button"
              disabled={busy}
              onClick={() => setUrl("")}
            >
              <X size={13} />
              Remover foto
            </button>
          )}
        </div>
      </div>
      {error && (
        <small className="red-text" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}
