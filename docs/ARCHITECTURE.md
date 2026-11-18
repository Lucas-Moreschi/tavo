# Arquitetura

O TAVO usa o App Router do Next.js para servir a interface React e a API Node.js no mesmo projeto. PostgreSQL persiste identidades, restaurantes e operações. O código é organizado por responsabilidade e, na interface, por módulo de negócio.

## Camadas

| Pasta          | Responsabilidade                                         | Dependências esperadas               |
| -------------- | -------------------------------------------------------- | ------------------------------------ |
| `src/app`      | Rotas, layout, manifesto e handlers HTTP                 | Features e servidor                  |
| `src/features` | Telas, formulários e fluxos de cada módulo               | Domínio e componentes compartilhados |
| `src/domain`   | Contratos e regras de mesas, estoque, pedidos e finanças | Tipos e utilitários puros            |
| `src/server`   | Sessão, autorização, transações, SQL e arquivos          | Domínio, PostgreSQL e Better Auth    |
| `src/shared`   | UI, hooks, tipos da operação e utilitários reutilizáveis | Domínio e bibliotecas de interface   |
| `src/styles`   | Tema e controles usados pela aplicação                   | CSS importado pelo layout raiz       |

Features não importam acesso ao banco ou segredos do servidor. O compartilhamento de tipos fica em `domain/types.ts` e `shared/types/operation.ts`; componentes visuais comuns ficam em `shared/ui`. Utilitários compartilhados não importam telas de uma feature.

Rotas e componentes com eventos permanecem nas fronteiras de cliente apropriadas. Lógica financeira e operacional não depende de React. Novas telas devem ficar na feature correspondente; `app` mantém a composição das rotas e seus endpoints.

## Leitura e escrita

O hook `shared/hooks/use-operation.ts` consulta `GET /api/state` e fornece o snapshot autorizado da operação. Consultas periódicas mantêm outras sessões atualizadas. Os formulários revisam essa versão antes de confirmar uma alteração.

As escritas vão para `POST /api/commands`, com ação, payload, chave de operação e versão esperada. O servidor verifica origem, sessão, vínculo e função; bloqueia o restaurante durante a transação; aplica as regras puras do domínio; persiste mudanças e auditoria; e retorna o novo snapshot.

Uma chave repetida com o mesmo autor e conteúdo recupera o resultado anterior. Uma versão desatualizada produz conflito, sem sobrescrever silenciosamente a operação de outra pessoa. O armazenamento de recuperação no navegador contém a chave e o hash, sem substituir o banco operacional.

## Persistência

O driver `pg` executa SQL explícito. Cada coleção tem tabela própria com identificação de restaurante e documento JSONB tipado. Relações adicionais de receitas, reservas e alocações financeiras têm chaves estrangeiras compostas. Arquivos usam metadados e conteúdo binário em `uploaded_files`.

As migrações em `database/migrations` são sequenciais e transacionais. Não reescreva migrações já aplicadas: mudanças no esquema entram em novos arquivos. As ferramentas em `scripts/database` são executadas pelo operador, separadamente das requisições HTTP.

## Invariantes

- Valores financeiros são centavos inteiros. Divisões preservam todos os centavos.
- Estoque e receitas usam milésimos da unidade base; custos são capturados no consumo.
- Enviar reserva; iniciar consome; cancelar libera reserva ou registra perda conforme o progresso.
- Junção e separação mantêm pedidos e recebimentos nas suas origens.
- Encerramento exige saldos resolvidos e entrega dos itens; fechamento de grupo valida todas as contas antes de liberar mesas.
- Datas são persistidas em UTC e interpretadas no fuso do restaurante.
- Cozinha/bar recebem apenas os dados da sua estação; permissões são verificadas novamente em cada escrita.

## Operação e limites

O PWA depende de conexão para alterar dados. O console local de correio e os seeds são ferramentas operacionais; não ficam disponíveis como endpoints públicos. A apresentação usa pagamentos externos registrados e recibos não fiscais.

O bloqueio por restaurante e os snapshots completos atendem à escala acadêmica. Uma ampliação de escala exigirá paginação e bloqueios mais granulares, mantendo as mesmas invariantes e testes de concorrência.
