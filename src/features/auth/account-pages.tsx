"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, Building2, CheckCircle2, LoaderCircle } from "lucide-react";
import { Brand } from "@/shared/ui/brand";
import { clearPendingOperations } from "@/shared/hooks/use-operation";

function AccountShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="account-page">
      <Link href="/">
        <Brand />
      </Link>
      <section className="panel account-card">{children}</section>
      <Link className="text-button" href="/login">
        Voltar para o acesso
      </Link>
    </main>
  );
}
export function InvitationPage() {
  const [invitation, setInvitation] = useState<{ restaurantName: string; email: string } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState("");
  useEffect(() => {
    const value = new URLSearchParams(location.search).get("token") || "";
    setToken(value);
    fetch(`/api/account/invitations?token=${encodeURIComponent(value)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.erro);
        setInvitation(data);
      })
      .catch((cause) => setError(cause.message));
  }, []);
  async function accept() {
    if (!navigator.onLine || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/account/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await response.json();
      if (response.status === 401) {
        location.assign(`/login?returnTo=${encodeURIComponent(`/convite?token=${token}`)}`);
        return;
      }
      if (!response.ok) throw new Error(data.erro);
      clearPendingOperations();
      location.assign("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível aceitar o convite.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AccountShell>
      <p className="eyebrow">UM NOVO LUGAR NA EQUIPE</p>
      <h1>Você recebeu um convite</h1>
      {invitation ? (
        <>
          <p className="muted">
            Faça parte de <strong>{invitation.restaurantName}</strong> usando a conta{" "}
            <strong>{invitation.email}</strong>. Sua senha pessoal permanece a mesma.
          </p>
          <button className="btn btn-primary" disabled={busy} onClick={() => void accept()}>
            {busy ? <LoaderCircle className="spin" size={17} /> : <CheckCircle2 size={17} />}Entrar
            e aceitar convite
          </button>
        </>
      ) : (
        !error && <p className="muted">Verificando convite…</p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </AccountShell>
  );
}
export function RestaurantsPage() {
  const [restaurants, setRestaurants] = useState<{ id: string; name: string; role: string }[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/api/account/context", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          location.assign("/login?returnTo=/restaurantes");
          return;
        }
        const data = await response.json();
        if (!response.ok) throw new Error(data.erro);
        setRestaurants(data);
      })
      .catch((cause) => setError(cause.message));
  }, []);
  async function select(restaurantId: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/account/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.erro);
      clearPendingOperations();
      location.assign("/");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível selecionar o restaurante.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <AccountShell>
      <p className="eyebrow">SEU ESPAÇO DE TRABALHO</p>
      <h1>Onde vamos trabalhar?</h1>
      <p className="muted">Selecione um restaurante ao qual sua conta tem acesso.</p>
      <div className="account-restaurants">
        {restaurants.map((restaurant) => (
          <button key={restaurant.id} disabled={busy} onClick={() => void select(restaurant.id)}>
            <Building2 size={22} />
            <span>
              <strong>{restaurant.name}</strong>
              <small>{restaurant.role}</small>
            </span>
            <ArrowRight size={18} />
          </button>
        ))}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <Link className="text-button" href="/cadastro">
        Cadastrar outro restaurante <ArrowRight size={15} />
      </Link>
    </AccountShell>
  );
}
export function RecoveryPage() {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setToken(params.get("token") || "");
    if (params.get("error")) setError("Este link expirou. Solicite uma nova recuperação.");
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !navigator.onLine) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    if (token && password !== form.get("confirm")) {
      setError("As senhas devem ser iguais.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        token ? "/api/auth/reset-password" : "/api/auth/request-password-reset",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            token
              ? { token, newPassword: password }
              : { email: String(form.get("email")), redirectTo: `${location.origin}/recuperar` },
          ),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message || data.erro || "Não foi possível recuperar o acesso.");
      setNotice(
        token
          ? "Senha atualizada. Você já pode entrar."
          : "Solicitação registrada. Consulte o responsável pelo ambiente para obter a mensagem de recuperação.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao conectar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AccountShell>
      <p className="eyebrow">SEU ACESSO</p>
      <h1>{token ? "Crie uma nova senha" : "Recuperar acesso"}</h1>
      <p className="muted">
        {token
          ? "Use pelo menos 8 caracteres e mantenha sua senha pessoal."
          : "Informe seu e-mail para iniciar a recuperação."}
      </p>
      {notice ? (
        <div role="status" className="notice-banner">
          {notice}
        </div>
      ) : (
        <form onSubmit={submit} className="auth-form">
          {token ? (
            <>
              <label className="field">
                <span>Nova senha</span>
                <input
                  name="password"
                  type="password"
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
              </label>
              <label className="field">
                <span>Confirmar senha</span>
                <input name="confirm" type="password" required autoComplete="new-password" />
              </label>
            </>
          ) : (
            <label className="field">
              <span>E-mail</span>
              <input name="email" type="email" required autoComplete="email" />
            </label>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Aguarde…" : token ? "Salvar nova senha" : "Solicitar recuperação"}
          </button>
        </form>
      )}
    </AccountShell>
  );
}
