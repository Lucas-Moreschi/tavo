"use client";

import { useEffect, useRef, useState } from "react";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = useState(true);
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [pending, setPending] = useState(0);
  const reloading = useRef(false);
  useEffect(() => {
    setOnline(navigator.onLine);
    const onlineHandler = () => setOnline(true),
      offlineHandler = () => setOnline(false);
    const installHandler = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallEvent);
    };
    const mutationStart = () => setPending((n) => n + 1),
      mutationEnd = () => setPending((n) => Math.max(0, n - 1));
    window.addEventListener("online", onlineHandler);
    window.addEventListener("offline", offlineHandler);
    window.addEventListener("beforeinstallprompt", installHandler);
    window.addEventListener("tavo:mutation-start", mutationStart);
    window.addEventListener("tavo:mutation-end", mutationEnd);
    let disposed = false;
    const controllerChange = () => {
      if (reloading.current) window.location.reload();
    };
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.addEventListener("controllerchange", controllerChange);
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          if (disposed) return;
          if (registration.waiting) setWaiting(registration.waiting);
          registration.addEventListener("updatefound", () => {
            const worker = registration.installing;
            worker?.addEventListener("statechange", () => {
              if (worker.state === "installed" && navigator.serviceWorker.controller && !disposed)
                setWaiting(worker);
            });
          });
        })
        .catch(() => {
          /* A aplicação continua disponível no navegador. */
        });
    }
    return () => {
      disposed = true;
      window.removeEventListener("online", onlineHandler);
      window.removeEventListener("offline", offlineHandler);
      window.removeEventListener("beforeinstallprompt", installHandler);
      window.removeEventListener("tavo:mutation-start", mutationStart);
      window.removeEventListener("tavo:mutation-end", mutationEnd);
      navigator.serviceWorker?.removeEventListener("controllerchange", controllerChange);
    };
  }, []);
  return (
    <>
      {!online && (
        <div role="alert" className="pwa-offline">
          Sem conexão. Alterações estão bloqueadas até reconectar.
        </div>
      )}
      {waiting && (
        <div role="status" className="pwa-update">
          <span>Uma nova versão está pronta. Salve seus formulários antes de atualizar.</span>
          <button
            type="button"
            className="btn btn-primary btn-small"
            disabled={pending > 0}
            onClick={() => {
              if (pending > 0) return;
              reloading.current = true;
              waiting.postMessage({ type: "ACTIVATE_UPDATE" });
            }}
          >
            Atualizar agora
          </button>
        </div>
      )}
      {children}
      {install && (
        <button
          type="button"
          className="pwa-install btn btn-secondary"
          onClick={async () => {
            await install.prompt();
            await install.userChoice;
            setInstall(null);
          }}
        >
          Instalar TAVO
        </button>
      )}
    </>
  );
}
