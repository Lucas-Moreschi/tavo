# TAVO — API da aplicação

API same-origin executada pelos endpoints em `src/app/api`. Os contratos compartilhados ficam em `src/domain/types.ts`.

## Acesso e contexto

A sessão é um cookie HttpOnly do Better Auth. As rotas validam sessão, vínculo ativo e função no restaurante. Não existe token de autenticação em localStorage. Requisições mutáveis exigem `Origin` igual à origem configurada em `BETTER_AUTH_URL`; respostas operacionais não são cacheadas.

| Método e rota                           | Finalidade                                                                                                                                                                                                                                                                                               |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/account/onboard`             | Cria restaurante, seleção do plano e primeiro gestor. Exige `name`, `email`, `password`, `restaurantName`, `slug`, `plan` e `serviceRateBps`. Aceita `reservationMinutes` e `deliveryFeeCents` opcionalmente, com padrões de 90 minutos e 0 centavos. Identidade existente exige sua sessão autenticada. |
| `POST /api/auth/sign-in/email`          | Login Better Auth com `email` e `password`.                                                                                                                                                                                                                                                              |
| `POST /api/auth/sign-out`               | Encerra a sessão.                                                                                                                                                                                                                                                                                        |
| `GET /api/auth/get-session`             | Consulta a sessão; não substitui a autorização do vínculo.                                                                                                                                                                                                                                               |
| `POST /api/auth/request-password-reset` | Solicita recuperação; mensagens ficam na caixa interna, sem envio externo.                                                                                                                                                                                                                               |
| `POST /api/auth/reset-password`         | Redefine a senha usando o token Better Auth.                                                                                                                                                                                                                                                             |
| `GET/POST /api/account/profile`         | Consulta/atualiza o próprio perfil e permite troca autenticada de senha.                                                                                                                                                                                                                                 |
| `GET/POST /api/account/team`            | Gestão de vínculos; preserva último gestor e credenciais globais de identidades existentes.                                                                                                                                                                                                              |
| `GET/POST /api/account/invitations`     | Convites e aceite autenticado.                                                                                                                                                                                                                                                                           |
| `GET/POST /api/account/context`         | Consulta vínculos permitidos e seleciona o restaurante ativo.                                                                                                                                                                                                                                            |
| `GET /api/account/operation?id=...`     | Recupera o resultado de uma operação, restrito ao autor e restaurante da sessão.                                                                                                                                                                                                                         |

Os formatos específicos são validados em `src/server/access.ts` e nos handlers de `src/app/api/account/`.

## Estado e comandos transacionais

`GET /api/state` devolve `AppSnapshot`, tipado em `src/domain/types.ts`: contexto do usuário, restaurante, versão e coleções operacionais autorizadas. Cozinha/bar recebem somente sua operação, sem dados financeiros, receitas ou custos. Nenhuma coleção contém dados de outro restaurante.

`POST /api/commands` recebe `action`, `payload`, `operationId` e `expectedVersion`. A versão deve corresponder ao snapshot revisado pelo usuário. A resposta contém `snapshot`, `result` (`message` e eventualmente `entityId`) e `replayed`.

A transação bloqueia o restaurante e revalida acesso/permissão. Repetir uma chave já executada com o mesmo conteúdo recupera seu resultado sem efeitos adicionais, antes mesmo de validar a versão. Reutilizá-la com outro conteúdo ou autor gera conflito. Isso permite recuperar respostas perdidas sem duplicar pedidos ou recebimentos.

| Família       | Ações                                                                                                                                                                                                                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Configurações | `settings.update`: nome, endereço, telefone, fuso, taxa, duração de reserva e taxa de entrega.                                                                                                                                                                                                |
| Salão         | `table.save`: id opcional, number, capacity, sector, active.                                                                                                                                                                                                                                  |
| Cardápio      | `category.save`; `product.save`: categoria, preço, estação, imagem, disponibilidade, receita e opções.                                                                                                                                                                                        |
| Estoque       | `stock.save`; `stock.entry`: quantidade e custo total; `stock.adjust`: saldo contado; `stock.loss`: perda física. Movimentos exigem motivo.                                                                                                                                                   |
| Fornecedores  | `supplier.save`.                                                                                                                                                                                                                                                                              |
| Atendimento   | `visit.open`: tableIds, channel, people, identificação e dados do canal; `visit.update`; `visit.transfer`; `visit.close`.                                                                                                                                                                     |
| Comandas      | `tab.create`; `tab.adjust`: gestor e motivo; `tab.close`; `tab.reopen`: gestor e motivo.                                                                                                                                                                                                      |
| Grupos        | `group.join`: tableIds, mode unica/separadas, label opcional, people obrigatório quando todas livres; `group.split`: groupId; `group.close`: groupId e reason obrigatório se não houver consumo. Valida todas as comandas e entregas, encerra o grupo e libera suas mesas na mesma transação. |
| Consumo       | `item.add`: tabId,productId,quantity,notes,optionIds; `item.quantity`: somente rascunho; `item.transfer`: itemId,targetTabId.                                                                                                                                                                 |
| Envio         | `order.send`: tabIds; cria lotes por atendimento e reserva estoque.                                                                                                                                                                                                                           |
| Produção      | `item.start`, `item.ready`, `item.deliver`: itemId e quantidade opcional; `item.cancel`: itemId,quantidade,motivo.                                                                                                                                                                            |
| Caixa         | `cash.open`: openingCents,label; `cash.move`: kind,amountCents,reason; `cash.close`: countedCents,reason.                                                                                                                                                                                     |
| Recebimentos  | `payment.record`: tabIds,amountCents,method,tenderedCents?,reference?,itemIds?; `payment.refund`: paymentId,amountCents,reason.                                                                                                                                                               |
| Reservas      | `reservation.save`: início/fim,pessoas,mesas,contato; `reservation.status`; `reservation.checkin`.                                                                                                                                                                                            |
| Fila          | `waitlist.add`; `waitlist.status`; `waitlist.seat`.                                                                                                                                                                                                                                           |
| Chamados      | `call.create`; `call.status`.                                                                                                                                                                                                                                                                 |

Tipos, campos e limites completos estão em `src/domain/types.ts`, `src/domain/commands.ts` e `src/domain/finance.ts`. A interface usa funções puras de cálculo para prévias; o servidor confirma valores e persistência.

## Unidades e invariantes

Dinheiro: centavos inteiros. Taxa: pontos-base (`1000` = 10%). Estoque/receita: milésimos da unidade (`1000` = 1 g/ml/un). Quantidades vendidas: unidades inteiras. Datas: ISO 8601.

O envio reserva, o início consome e cancelamento anterior ao início libera. Após início, preserva consumo e registra perda sem segunda baixa. Produtos de entrega imediata ficam prontos no evento de separação/início. Etapas parciais preservam o identificador do item.

Consolidação do grupo mantém comandas e pagamentos de origem. Separar mesas não altera recebido, produção ou estoque. Devolução pendente fica explícita e impede encerramento.

O cancelamento de um item enviado cria um `ServiceCall` com `kind: "cancelamento"`, `itemId`, `quantity` e `actorName`, direcionado à estação responsável (entrega direta avisa o salão). O aviso persiste e pode ser concluído por `call.status` com `status: "concluido"`, respeitando as permissões da equipe de destino. O item cancelado continua no histórico.

As reservas são convertidas do fuso do restaurante para ISO/UTC antes do comando. A apresentação e os intervalos de relatórios também usam esse fuso; o intervalo vai do início da data inicial até, exclusivamente, o início do dia seguinte à data final. Exportações são produzidas a partir do snapshot autorizado, com neutralização de fórmulas CSV. Não há rota pública de leitura do correio; `npm run dev:mail` é um console local para o responsável pelo ambiente.

## Arquivos e saúde

`POST /api/files`: multipart com campo `file`, até 3 MB, JPG/PNG/WebP, resposta `url`. Conteúdo binário e metadados são gravados juntos em `uploaded_files` no PostgreSQL, usando `bytea`. `GET /api/files/{name}` verifica sessão/contexto antes de servir a imagem privada, com tipo, tamanho e `Cache-Control: private, no-store`. O acesso continua permitido ao restaurante de origem ou ao próprio titular da imagem ao trocar de restaurante. O snapshot de `/api/state` contém apenas referências; os bytes são buscados sob demanda. Não depende de disco local ou armazenamento S3 na hospedagem.

`GET /api/health`: verifica PostgreSQL sem expor credenciais ou detalhes internos.

## Erros

Corpo padrão: `{ erro, code }`. Status: 400 dados inválidos; 401 sessão ausente; 403 função/vínculo/origem/troca de senha pendente; 404 inacessível/inexistente; 409 versão/operação/relação/estado em conflito; 413 limite excedido; 500 falha interna sem dados sensíveis.

Falha de rede ou 5xx não prova que uma operação deixou de acontecer. Recuperar a mesma intenção exige reutilizar sua chave, sem gerar outro recebimento automaticamente.
