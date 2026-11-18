# Seed de apresentação

O seed é uma ferramenta opcional. O app funciona com restaurantes cadastrados normalmente e não cria contas padrão ao iniciar, migrar ou fazer build.

## Carga local

Configure uma senha em um terminal usado para a carga:

```powershell
$env:SEED_PASSWORD = 'SENHA_ESCOLHIDA_PARA_A_APRESENTACAO'
npm run db:migrate
npm run db:seed
npm run db:seed:presentation
Remove-Item Env:SEED_PASSWORD
```

O primeiro comando de seed cria os restaurantes **TAVO Restaurante** e **Bistrô Independente**, com equipe, mesas e cardápio inicial. O segundo prepara um turno com histórico de vendas, grupo de mesas, comandas, recebimentos parciais, produção, reservas, fila e canais.

| Restaurante         | E-mails                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| TAVO Restaurante    | `gestor@tavo.demo`, `garcom@tavo.demo`, `caixa@tavo.demo`, `cozinha@tavo.demo`, `bar@tavo.demo` |
| Bistrô Independente | Os mesmos perfis com `@bistro.demo`                                                             |

A senha é exclusivamente a `SEED_PASSWORD` escolhida pelo operador. Esses acessos não são anunciados na tela de login.

## Banco hospedado / produção

É possível carregar o banco PostgreSQL hospedado usado na apresentação. Execute a ferramenta no seu computador, com Node.js 24 e acesso à conexão do ambiente. Abra um terminal separado e configure:

```powershell
$env:DATABASE_URL = 'CONEXAO_POSTGRES_DO_AMBIENTE_DE_APRESENTACAO'
$env:SEED_PASSWORD = 'SENHA_ESCOLHIDA_PARA_A_APRESENTACAO'
$env:NODE_ENV = 'production'
$env:ALLOW_SEED_IN_PRODUCTION = 'true'
npm run db:migrate
npm run db:seed
npm run db:seed:presentation
```

Feche esse terminal ao concluir para descartar as variáveis. Não mantenha a liberação do seed nas variáveis permanentes da hospedagem. A carga não depende de executar comandos dentro da Vercel; ela usa diretamente a conexão PostgreSQL configurada. As credenciais do banco permanecem no ambiente do operador e fora do Git.

## Reexecução e preservação

- O seed básico preserva restaurantes e senhas que já existem.
- A carga de apresentação possui uma marca de execução no banco: repetir preserva o estado atual, sem duplicar nem restaurar o cenário.
- Os identificadores internos e a marca da carga foram mantidos para reconhecer bancos já carregados por versões anteriores.
- Uma primeira carga com caixa já aberto é recusada para preservar a operação existente.
- A carga é voltada aos restaurantes identificados para apresentação; não preenche os demais restaurantes cadastrados.
- Reservas usam horários relativos à execução. Em outro dia, ajuste-as pela interface.

Se o banco já tem as contas de uma carga anterior, informar outra `SEED_PASSWORD` não redefine suas senhas. Use o fluxo normal de troca/recuperação se precisar alterá-las.
