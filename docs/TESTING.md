# Testes

Use um PostgreSQL de desenvolvimento ou teste. Os testes exercitam gravações reais e não devem apontar para um banco em uso por clientes.

## Preparação

1. Instale as dependências com `npm ci`.
2. Configure `.env` a partir de `.env.example`.
3. Execute `docker compose up -d db` e `npm run db:migrate`.

Não é necessário executar o seed para rodar a suíte.

## Camadas de verificação

| Comando                    | O que verifica                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`        | Tipos das rotas Next.js e contratos TypeScript                                                           |
| `npm run format:check`     | Formatação do código e documentação                                                                      |
| `npm test`                 | Regras de domínio, estoque, finanças, datas, CSV, correio e seed opcional                                |
| `npm run test:integration` | Sessões, isolamento, transações, concorrência, FKs, arquivos, convites e recuperação com PostgreSQL real |
| `npm run test:e2e`         | Cadastro, atendimento, produção, caixa, grupos, permissões, interface e PWA no navegador                 |

Os testes unitários ficam em `tests/unit`, os de integração em `tests/integration` e os de navegador em `tests/e2e`. Os cenários do seed são testados em memória, separados das contas usadas nas verificações de navegador.

## Navegador e PWA

Inicie o app com `docker compose up --build -d` ou com `npm run build` e `npm start`. Por padrão, o Playwright usa `http://localhost:3000` e o Microsoft Edge instalado no Windows. Em CI, usa Chromium, instalável com `npx playwright install --with-deps chromium`.

Para incluir a verificação do PWA no PowerShell:

```powershell
$env:TEST_PWA = '1'
npm run test:e2e
Remove-Item Env:TEST_PWA
```

`TEST_BASE_URL` permite escolher outra origem local; `APP_URL` e `BETTER_AUTH_URL` do servidor precisam corresponder a ela. O teste do service worker requer o build de produção.

As fixtures criam restaurantes, usuários e produtos próprios pela API. Ao encerrar cada cenário, removem seus registros pelo PostgreSQL configurado em `DATABASE_URL`. Servidor e suíte devem apontar para o mesmo banco. Restaurantes já existentes, inclusive os da apresentação, não são usados como dependência dos testes.

Uma interrupção forçada do processo pode impedir a limpeza. Os registros de teste usam identificadores aleatórios, slugs `qa-` e e-mails do domínio `tavo.test`, para distinguir esse caso sem apagar dados da aplicação indiscriminadamente.

Capturas, traces, PDFs e o relatório ficam em `test-results/` e `playwright-report/`, ignorados pelo Git. O recibo consolidado é gerado em `test-results/tavo-conta-grupo.pdf`.

## Conferência manual

Percorra o fluxo: cadastrar restaurante → configurar mesas/cardápio/estoque/equipe → abrir caixa → abrir atendimento → adicionar e enviar itens → preparar e entregar → receber → encerrar. Confira junção e separação com pagamentos parciais e cancelamentos antes/depois do preparo.

Teste também instalação do PWA em um telefone, bloqueio sem rede, reconexão, legibilidade e impressão em equipamento real. A emulação de tamanho e mídia no navegador não substitui essa conferência física.
