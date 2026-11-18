"use client";

import { Brand } from "@/shared/ui/brand";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { centsInput } from "@/shared/lib/format";

export function AuthForm({ signup = false }: { signup?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!navigator.onLine) {
      setError("Conecte-se à internet para continuar.");
      return;
    }
    const data = new FormData(event.currentTarget);
    const str = (key: string) => String(data.get(key) ?? "");
    const body = signup
      ? {
          name: str("name"),
          email: str("email"),
          password: str("password"),
          restaurantName: str("restaurantName"),
          slug: str("slug"),
          plan: str("plan"),
          serviceRateBps: Math.round(Number(str("serviceRate")) * 100),
          reservationMinutes: Number(str("reservationMinutes")),
          deliveryFeeCents: centsInput(str("deliveryFee")),
        }
      : { email: str("email"), password: str("password") };
    setBusy(true);
    setError("");
    try {
      const response = await fetch(signup ? "/api/account/onboard" : "/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok || result.error || result.erro)
        throw new Error(
          result.erro ||
            (typeof result.error === "string" ? result.error : result.error?.message) ||
            result.message ||
            "Confira seus dados e tente novamente.",
        );
      const target = new URLSearchParams(location.search).get("returnTo");
      window.location.assign(
        target && target.startsWith("/") && !target.startsWith("//") && !target.includes("\\")
          ? target
          : "/",
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível conectar. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-story">
        <Link href="/login" aria-label="TAVO início">
          <Brand />
        </Link>
        <div className="auth-story-copy">
          <span className="eyebrow">MAIS TEMPO PARA RECEBER BEM</span>
          <h1>
            O salão flui.
            <br />
            Seu negócio
            <br />
            <span>também.</span>
          </h1>
          <p>
            Do primeiro pedido ao fechamento do caixa. Uma operação conectada, uma experiência
            melhor.
          </p>
          <div className="auth-benefits">
            {[
              "Mesas, comandas e pedidos em sintonia",
              "Cozinha e bar conectados ao salão",
              "Seu estoque e seu caixa sob controle",
            ].map((text) => (
              <span key={text}>
                <Check size={16} />
                {text}
              </span>
            ))}
          </div>
        </div>
        <p className="auth-story-footer">GESTÃO INTELIGENTE. HOSPITALIDADE DE VERDADE.</p>
        <div className="auth-orbit" aria-hidden="true" />
      </section>
      <section className="auth-content">
        <div className="auth-mobile-brand">
          <Brand />
        </div>
        <div className={`auth-card ${signup ? "auth-card-wide" : ""}`}>
          <span className="eyebrow">
            {signup ? "SEU PRÓXIMO CAPÍTULO COMEÇA AQUI" : "BOM TER VOCÊ DE VOLTA"}
          </span>
          <h2>{signup ? "Vamos abrir as portas?" : "Entre no seu restaurante"}</h2>
          <p className="muted">
            {signup
              ? "Cadastre seu restaurante e prepare sua operação."
              : "Use seu e-mail e senha para começar o turno."}
          </p>
          <form onSubmit={submit} className="auth-form">
            {signup && (
              <>
                <div className="form-grid">
                  <label className="field">
                    <span>Seu nome</span>
                    <input name="name" autoComplete="name" required placeholder="Nome completo" />
                  </label>
                  <label className="field">
                    <span>Nome do restaurante</span>
                    <input
                      name="restaurantName"
                      required
                      placeholder="Como seus clientes conhecem você"
                    />
                  </label>
                </div>
                <label className="field">
                  <span>Identificador do restaurante</span>
                  <input name="slug" required pattern="[a-z0-9-]+" placeholder="meu-restaurante" />
                  <small>Letras minúsculas, números e hífen. Identificador exclusivo.</small>
                </label>
              </>
            )}
            <label className="field">
              <span>E-mail</span>
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                placeholder="voce@restaurante.com"
              />
            </label>
            <label className="field">
              <span>Senha</span>
              <div className="password-field">
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  minLength={8}
                  autoComplete={signup ? "new-password" : "current-password"}
                  required
                  placeholder={signup ? "Pelo menos 8 caracteres" : "Sua senha"}
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            {signup && (
              <>
                <label className="field">
                  <span>Plano</span>
                  <select name="plan" required>
                    <option value="essencial">Essencial</option>
                    <option value="profissional">Profissional</option>
                    <option value="completo">Completo</option>
                  </select>
                  <small>A seleção do plano não gera cobrança.</small>
                </label>
                <div className="form-grid">
                  <label className="field">
                    <span>Taxa de serviço (%)</span>
                    <input
                      name="serviceRate"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      required
                      placeholder="Ex.: 10"
                    />
                  </label>
                  <label className="field">
                    <span>Duração da reserva (min)</span>
                    <input
                      name="reservationMinutes"
                      type="number"
                      min="15"
                      required
                      placeholder="Ex.: 120"
                    />
                  </label>
                  <label className="field">
                    <span>Taxa de delivery (R$)</span>
                    <input
                      name="deliveryFee"
                      required
                      inputMode="decimal"
                      placeholder="Ex.: 5,00"
                    />
                  </label>
                </div>
              </>
            )}
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
              {busy ? <LoaderCircle size={18} className="spin" /> : null}
              {busy ? "Aguarde…" : signup ? "Criar meu restaurante" : "Entrar no TAVO"}
              {!busy && <ArrowRight size={18} />}
            </button>
          </form>
          <p className="auth-switch">
            {signup ? "Já faz parte do TAVO?" : "Seu restaurante ainda não está aqui?"}{" "}
            <Link href={signup ? "/login" : "/cadastro"}>
              {signup ? "Entrar na conta" : "Começar agora"}
            </Link>
          </p>
          {!signup && (
            <p className="auth-help">
              <Link href="/recuperar">Esqueci minha senha</Link>
            </p>
          )}
        </div>
        <p className="auth-copyright">
          © {new Date().getFullYear()} TAVO · Gestão para restaurantes
        </p>
      </section>
    </main>
  );
}
