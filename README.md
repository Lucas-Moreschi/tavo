# TAVO

Plataforma de gestão para múltiplos restaurantes, com atendimento, produção, estoque, caixa e relatórios. Desenvolvida com Next.js, React, TypeScript, Node.js e PostgreSQL, com Docker e PWA.

## Executar localmente

Requisitos: Node.js 24.x, npm e Docker Desktop.

1. Instale as dependências com `npm ci`.
2. Copie `.env.example` para `.env` e configure `BETTER_AUTH_SECRET` com pelo menos 32 caracteres aleatórios. Para gerar um segredo: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
3. Inicie o PostgreSQL: `docker compose up -d db`.
4. Aplique o esquema: `npm run db:migrate`.
5. Inicie a aplicação: `npm run dev`.
6. Acesse `http://localhost:3000/cadastro` e crie o restaurante e seu primeiro gestor.

O cadastro começa vazio, sem contas ou senhas padrão. O banco local usa a porta **55432**, restrita a localhost. Para testar o build de produção com app e banco em contêineres, use `docker compose up --build -d`. O serviço de migrações termina antes de o app iniciar.

## Funcionalidades

- Restaurantes independentes, cadastro de equipe e permissões de gestor, garçom, caixa, cozinha e bar.
- Mesas, comandas individuais, transferência de consumo, agrupamento e separação preservando pagamentos.
- Cardápio com fotos, ingredientes, receitas e adicionais.
- Envio para produção, reserva de estoque, preparo e entrega parciais, cancelamentos e avisos por estação.
- Caixa, recebimentos parciais e mistos, troco, divisão, ajustes autorizados e estornos.
- Entradas de estoque, custo médio, inventário, perdas e alertas de disponibilidade.
- Reservas, fila de espera, balcão, retirada, delivery interno e impressão de contas/pedidos.
- Relatórios com datas no fuso do restaurante e exportação CSV.
- Interface responsiva e PWA instalável; alterações bloqueadas sem conexão.

O escopo é acadêmico: os pagamentos são registros de recebimentos externos, os recibos não são fiscais e a escolha do plano não gera assinatura ou cobrança. Delivery é acompanhado internamente, sem integração com aplicativos externos.

## Organização do código

```text
src/
  app/                 Rotas, layouts, manifesto e endpoints Next.js
  features/            Interface organizada por módulo de negócio
    auth/              Acesso, cadastro, convite e recuperação
    workspace/         Navegação e visão geral
    service/           Mesas, comandas, reservas, canais e chamados
    production/        Cozinha, bar e avisos de cancelamento
    catalog/           Cardápio e fichas técnicas
    inventory/         Estoque e fornecedores
    finance/           Caixa, recebimentos e relatórios
    team/              Equipe e acessos
    settings/          Configurações, perfil e primeiro acesso
  domain/              Tipos, regras operacionais e cálculos financeiros
  server/              Autenticação, autorização, PostgreSQL e arquivos
  shared/              Componentes, hooks, tipos e utilitários reutilizáveis
  styles/              Tema global e controles compartilhados
database/migrations/   Evolução do esquema PostgreSQL
scripts/database/      Migrações e carga opcional de apresentação
scripts/development/   Ferramentas locais de desenvolvimento
tests/                 Testes unitários, de integração e navegador
public/                Ícones, service worker e fallback offline do PWA
docs/                  Documentação técnica atual
```

Detalhes em [Arquitetura](docs/ARCHITECTURE.md), [API](docs/API.md) e [Design](docs/DESIGN.md).

## Dados e segurança

O estado operacional está no PostgreSQL. As alterações validam sessão, vínculo, função e versão do restaurante, com transações e chaves de idempotência para recuperar respostas perdidas sem duplicar efeitos. Relações entre empresas são protegidas por chaves estrangeiras compostas.

Dinheiro usa centavos inteiros; ingredientes usam milésimos da unidade. Datas são persistidas em ISO/UTC e exibidas no fuso do restaurante. A reserva do estoque ocorre no envio e o consumo no início do preparo. Cancelamentos anteriores ao preparo liberam a reserva; posteriores registram perda sem uma segunda baixa física.

Fotos JPG, PNG e WebP de até 3 MB são armazenadas no PostgreSQL em `bytea`, com acesso autenticado. Não há pasta de uploads ou serviço de armazenamento externo em execução. Dumps completos do banco incluem as imagens.

## Desenvolvimento e testes

| Comando                                   | Finalidade                             |
| ----------------------------------------- | -------------------------------------- |
| `npm run dev`                             | Servidor de desenvolvimento            |
| `npm run build` / `npm start`             | Build e servidor de produção           |
| `npm run typecheck`                       | Tipos das rotas e validação TypeScript |
| `npm run format` / `npm run format:check` | Formatação e conferência com Prettier  |
| `npm test`                                | Testes unitários e regras              |
| `npm run test:integration`                | Integração com PostgreSQL real         |
| `npm run test:e2e`                        | Fluxos reais no navegador              |

Os testes de navegador criam contas e restaurantes isolados, sem depender do seed. Veja os requisitos e a limpeza em [Testes](docs/TESTING.md).

A carga para apresentação continua disponível, mas é opcional e exige uma senha escolhida pelo operador. Pode ser executada manualmente contra um banco hospedado, com liberação explícita para produção. Veja [Seed de apresentação](docs/SEED.md).

A recuperação de senha grava mensagens em `mail_outbox`, sem envio externo de e-mail. Para consultá-las localmente, use `npm run dev:mail -- --email=SEU_EMAIL` e abra a URL privada exibida no terminal. O console funciona apenas em `127.0.0.1` e não é uma API pública. O filtro de e-mail é opcional; encerre com Ctrl+C.

## Hospedagem e PWA

O app pode ser hospedado na Vercel com PostgreSQL no Neon. Configure `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` e `APP_URL` no ambiente de destino. As duas URLs devem apontar para a origem HTTPS do app. Aplique as migrações antes de liberar o uso. A publicação é feita separadamente do código; nenhum projeto externo é criado automaticamente.

O service worker é registrado no build de produção. APIs e dados autenticados não são armazenados no seu cache. Sem conexão, o app exibe a tela de reconexão e bloqueia alterações. Não há fila de pedidos offline.

## Backup

Gere um dump com `docker compose exec db pg_dump -U tavo -d tavo -Fc -f /tmp/tavo.backup` e copie com `docker compose cp db:/tmp/tavo.backup ./tavo.backup`. O dump contém também as fotos. Restaure primeiro em um banco separado para conferir a recuperação. Arquivos `.env`, backups, relatórios e caches ficam fora do Git; um volume Docker não substitui o backup.
