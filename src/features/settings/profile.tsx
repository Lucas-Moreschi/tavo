"use client";

import { ArrowUpRight } from "lucide-react";
import { roleNames } from "@/shared/lib/operation-utils";
import type { ViewProps } from "@/shared/types/operation";
import { ImageUpload } from "@/shared/ui/image-upload";
import { Heading } from "@/shared/ui/primitives";

export function ProfileView(props: ViewProps) {
  const { profile, actor } = props.state;
  return (
    <>
      <Heading
        eyebrow="SEU ACESSO"
        title="Meu perfil"
        description="Seus dados, sua segurança e seu lugar na equipe."
      />
      <div className="settings-grid">
        <section className="panel settings-card">
          <span className="avatar avatar-large">
            {profile.image ? <img src={profile.image} alt="Sua foto" /> : profile.name[0]}
          </span>
          <h2>{profile.name}</h2>
          <p className="muted">{profile.email}</p>
          <span className="role-pill">{roleNames[actor.role]}</span>
          <div className="settings-meta">
            <span>
              Restaurante<strong>{props.state.restaurant.name}</strong>
            </span>
          </div>
          <button
            className="btn btn-secondary"
            onClick={() =>
              props.run(async () => {
                const response = await fetch("/api/auth/sign-out", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: "{}",
                });
                if (!response.ok) throw new Error("Não foi possível encerrar sua sessão.");
                for (const key of Object.keys(sessionStorage).filter((key) =>
                  key.startsWith("tavo:pending:"),
                ))
                  sessionStorage.removeItem(key);
                window.location.assign("/login");
              })
            }
          >
            Sair da conta <ArrowUpRight size={16} />
          </button>
        </section>
        <div className="profile-forms">
          <section className="panel settings-form">
            <h2>Seus dados</h2>
            <p className="muted">E-mail e credencial identificam sua conta pessoal.</p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                props.run(() =>
                  props.account("/api/account/profile", {
                    name: String(data.get("name")),
                    image: String(data.get("image")) || null,
                  }),
                );
              }}
            >
              <div className="form-grid">
                <label className="field">
                  <span>Nome completo</span>
                  <input name="name" autoComplete="name" required defaultValue={profile.name} />
                </label>
                <ImageUpload name="image" initial={profile.image || ""} label="Sua foto" />
              </div>
              <button className="btn btn-primary" type="submit" disabled={props.disabled}>
                Salvar meus dados
              </button>
            </form>
          </section>
          <section className="panel settings-form">
            <h2>Trocar senha</h2>
            <p className="muted">Use uma senha pessoal com pelo menos 8 caracteres.</p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const data = new FormData(form);
                if (data.get("newPassword") !== data.get("confirm")) {
                  props.run(async () => {
                    throw new Error("A confirmação precisa ser igual à nova senha.");
                  });
                  return;
                }
                props.run(async () => {
                  await props.account("/api/account/profile", {
                    name: profile.name,
                    currentPassword: data.get("currentPassword"),
                    newPassword: data.get("newPassword"),
                  });
                  form.reset();
                });
              }}
            >
              <div className="form-grid">
                <label className="field field-wide">
                  <span>Senha atual</span>
                  <input
                    name="currentPassword"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </label>
                <label className="field">
                  <span>Nova senha</span>
                  <input
                    name="newPassword"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </label>
                <label className="field">
                  <span>Confirmar nova senha</span>
                  <input
                    name="confirm"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </label>
              </div>
              <button className="btn btn-primary" type="submit" disabled={props.disabled}>
                Atualizar senha
              </button>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}
