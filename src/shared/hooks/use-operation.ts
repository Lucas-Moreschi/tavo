"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AppSnapshot } from "@/domain/types";

function storageKeys(prefix: string) {
  try {
    return Object.keys(sessionStorage).filter((key) => key.startsWith(prefix));
  } catch {
    return [];
  }
}
function stored(key: string) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function remember(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* A memória protege a operação nesta página. */
  }
}
function forget(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* Armazenamento indisponível. */
  }
}
export function clearPendingOperations(prefix = "tavo:pending:") {
  storageKeys(prefix).forEach(forget);
}

export function useOperation() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pending = useRef(new Map<string, string>());
  const running = useRef(false);
  const scope = useRef("");
  const acceptSnapshot = useCallback(
    (next: AppSnapshot) =>
      setSnapshot((previous) =>
        !previous ||
        previous.restaurant.id !== next.restaurant.id ||
        next.version >= previous.version
          ? next
          : previous,
      ),
    [],
  );
  const refresh = useCallback(async () => {
    if (!navigator.onLine) {
      setOffline(true);
      setLoading(false);
      return;
    }
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      if (response.status === 401) {
        clearPendingOperations();
        location.assign(
          `/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`,
        );
        return;
      }
      const data = await response.json();
      if (data.code === "NO_MEMBERSHIP") {
        location.assign("/restaurantes");
        return;
      }
      if (!response.ok) throw new Error(data.erro || "Não foi possível atualizar a operação.");
      const next = data as AppSnapshot;
      const nextScope = `tavo:pending:${next.restaurant.id}:${next.actor.userId}:`;
      if (scope.current && scope.current !== nextScope) {
        clearPendingOperations(scope.current);
        pending.current.clear();
      }
      scope.current = nextScope;
      acceptSnapshot(next);
      setOffline(false);
      setError("");
      if (!running.current)
        for (const key of storageKeys(nextScope)) {
          const id = stored(key);
          if (!id) continue;
          const recovery = await fetch(`/api/account/operation?id=${encodeURIComponent(id)}`, {
            cache: "no-store",
          });
          if (!recovery.ok) continue;
          const result = await recovery.json();
          if (result.found) {
            acceptSnapshot(result.snapshot);
            forget(key);
            for (const [pendingKey, operation] of pending.current)
              if (operation === id) pending.current.delete(pendingKey);
            setNotice("Operação anterior confirmada. Os dados estão atualizados.");
          }
        }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha de conexão.");
      if (cause instanceof TypeError) setOffline(true);
    } finally {
      setLoading(false);
    }
  }, [acceptSnapshot]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && !running.current) void refresh();
    }, 10000);
    const online = () => {
        setOffline(false);
        void refresh();
      },
      disconnected = () => setOffline(true),
      visible = () => {
        if (document.visibilityState === "visible" && !running.current) void refresh();
      };
    window.addEventListener("online", online);
    window.addEventListener("offline", disconnected);
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", disconnected);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(timeout);
  }, [notice]);
  async function command(action: string, payload: Record<string, unknown>) {
    if (offline || !navigator.onLine || !snapshot)
      throw new Error("Conecte-se e atualize os dados para continuar.");
    if (running.current) throw new Error("Aguarde a operação em andamento.");
    running.current = true;
    setBusy(true);
    window.dispatchEvent(new CustomEvent("tavo:mutation-start"));
    try {
      const key = JSON.stringify({ action, payload });
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
      const storageKey = `${scope.current}${Array.from(new Uint8Array(digest))
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("")}`;
      const previousId = stored(storageKey) || pending.current.get(key);
      const operationId = previousId || crypto.randomUUID();
      pending.current.set(key, operationId);
      remember(storageKey, operationId);
      if (previousId) {
        const recovery = await fetch(
          `/api/account/operation?id=${encodeURIComponent(operationId)}`,
          { cache: "no-store" },
        );
        if (!recovery.ok)
          throw new Error(
            "Não foi possível consultar a operação anterior. Atualize e tente novamente.",
          );
        const result = await recovery.json();
        if (result.found) {
          pending.current.delete(key);
          forget(storageKey);
          acceptSnapshot(result.snapshot);
          setNotice(result.result.message);
          return result.result;
        }
      }
      const response = await fetch("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload, operationId, expectedVersion: snapshot.version }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) {
          pending.current.delete(key);
          forget(storageKey);
        }
        if (response.status === 401) {
          clearPendingOperations();
          location.assign("/login");
        }
        if (response.status === 409) await refresh();
        throw new Error(data.erro || "Não foi possível concluir a operação.");
      }
      pending.current.delete(key);
      forget(storageKey);
      acceptSnapshot(data.snapshot);
      setOffline(false);
      setNotice(data.result.message);
      return data.result;
    } catch (cause) {
      if (cause instanceof TypeError) {
        setOffline(true);
        throw new Error(
          "A resposta não chegou. Reconecte-se para verificar o resultado antes de repetir a operação.",
        );
      }
      throw cause;
    } finally {
      running.current = false;
      setBusy(false);
      window.dispatchEvent(new CustomEvent("tavo:mutation-end"));
    }
  }
  async function account(path: string, payload: Record<string, unknown>) {
    if (offline || !navigator.onLine) throw new Error("Conecte-se para salvar.");
    if (running.current) throw new Error("Aguarde a operação em andamento.");
    running.current = true;
    setBusy(true);
    window.dispatchEvent(new CustomEvent("tavo:mutation-start"));
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.erro || data.message || "Não foi possível salvar.");
      await refresh();
      setNotice(data.message || "Dados salvos.");
      return data;
    } finally {
      running.current = false;
      setBusy(false);
      window.dispatchEvent(new CustomEvent("tavo:mutation-end"));
    }
  }
  return { snapshot, loading, offline, busy, error, notice, setNotice, refresh, command, account };
}
