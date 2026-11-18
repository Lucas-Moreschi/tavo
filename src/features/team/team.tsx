"use client";

import { useState } from "react";
import { Mail, Plus, Search } from "lucide-react";
import { roleNames } from "@/shared/lib/operation-utils";
import type { ViewProps } from "@/shared/types/operation";
import { Status, Empty, Heading } from "@/shared/ui/primitives";

import { field, select } from "@/shared/ui/form-fields";

export function TeamView(props: ViewProps) {
  const [search, setSearch] = useState("");
  const [invite, setInvite] = useState("");
  const members = props.state.team.filter((member) =>
    `${member.name} ${member.email}`.toLowerCase().includes(search.toLowerCase()),
  );
  const roles = ["gestor", "garcom", "caixa", "cozinha", "bar"].map((value) => ({
    value,
    label: roleNames[value],
  }));
  return (
    <>
      <Heading
        eyebrow="GESTÃO"
        title="Quem faz acontecer"
        description="Sua equipe, seus acessos e o cuidado em cada função."
      >
        <button
          className="btn btn-primary"
          disabled={props.disabled}
          onClick={() =>
            props.edit({
              title: "Adicionar pessoa à equipe",
              description:
                "Uma nova pessoa recebe senha temporária. Para e-mail já cadastrado, será criado um convite de vínculo.",
              fields: [
                field("name", "Nome completo"),
                field("email", "E-mail", "email"),
                select("role", "Função", roles),
                {
                  ...field("password", "Senha provisória", "password"),
                  hint: "Pelo menos 8 caracteres. A pessoa deverá trocá-la no primeiro uso.",
                },
              ],
              initial: { role: "garcom" },
              submitLabel: "Adicionar à equipe",
              submit: async (values) => {
                const result = await props.account("/api/account/team", {
                  ...values,
                  active: true,
                });
                if (result.inviteUrl)
                  setInvite(new URL(result.inviteUrl, window.location.origin).href);
              },
            })
          }
        >
          <Plus size={17} />
          Nova pessoa
        </button>
      </Heading>
      {invite && (
        <div className="notice-banner">
          <Mail size={18} />
          <span>
            Convite criado: <a href={invite}>{invite}</a>
          </span>
          <button
            className="text-button"
            onClick={() => {
              props.run(async () => {
                await navigator.clipboard.writeText(invite);
              });
            }}
          >
            Copiar link
          </button>
        </div>
      )}
      <div className="filter-bar">
        <span className="muted">
          {props.state.team.filter((member) => member.active).length} pessoas com acesso ativo
        </span>
        <label className="search-box">
          <Search size={17} />
          <input
            placeholder="Buscar nome ou e-mail"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>
      <section className="panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>PESSOA</th>
                <th>FUNÇÃO</th>
                <th>ACESSO</th>
                <th>SEGURANÇA</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <td>
                    <div className="person-cell">
                      <span className="avatar avatar-small">{member.name.slice(0, 1)}</span>
                      <span>
                        <strong>{member.name}</strong>
                        <small>{member.email}</small>
                      </span>
                    </div>
                  </td>
                  <td>{roleNames[member.role]}</td>
                  <td>
                    <Status
                      value={member.active ? "entregue" : "cancelado"}
                      label={member.active ? "Ativo" : "Desativado"}
                    />
                  </td>
                  <td>{member.mustChangePassword ? "Senha provisória" : "Senha pessoal"}</td>
                  <td>
                    <button
                      className="text-button"
                      disabled={props.disabled}
                      onClick={() =>
                        props.edit({
                          title: `Acesso de ${member.name}`,
                          description:
                            "Nome, e-mail e senha pessoais são alterados no perfil da própria pessoa.",
                          fields: [
                            select("role", "Função", roles),
                            field("active", "Acesso ativo", "checkbox", false),
                          ],
                          initial: { role: member.role, active: member.active },
                          submit: async (values) => {
                            await props.account("/api/account/team", {
                              memberId: member.id,
                              name: member.name,
                              email: member.email,
                              role: values.role,
                              active: values.active,
                            });
                          },
                        })
                      }
                    >
                      Gerenciar acesso
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!members.length && <Empty title="Nenhuma pessoa encontrada" />}
      </section>
    </>
  );
}
