# DER físico do Tavo

[Abrir o diagrama em imagem (SVG)](DER.svg) · [Baixar o arquivo para o dbdiagram (DBML)](DER.dbml)

O diagrama representa as 37 tabelas e as 60 chaves estrangeiras do PostgreSQL. As entidades que participam de mais de uma área aparecem também com seus identificadores nas áreas relacionadas.

- **PK** indica chave primária, **FK** indica chave estrangeira e **UK** indica uma coluna com restrição única própria. Colunas marcadas como PK na mesma tabela compõem a chave primária em conjunto.
- As referências compostas incluem `restaurant_id` para vincular registros do mesmo restaurante. Colunas marcadas como geradas extraem seus valores do `body` JSONB.
- Linhas contínuas indicam FKs que integram a PK da tabela filha. Linhas tracejadas indicam FKs fora da PK ou que a integram apenas em parte. A cardinalidade expressa o que as restrições SQL permitem.

As definições completas, incluindo índices e restrições, estão nas [migrações](../migrations) e no [executor de migrações](../../scripts/database/migrate.ts).

## Autenticação, acesso e infraestrutura

```mermaid
erDiagram
  direction TB
  user {
    text id PK
    text name
    text email UK
    boolean emailVerified
    text image
    timestamptz createdAt
    timestamptz updatedAt
    boolean credential_temporary
  }

  session {
    text id PK
    timestamptz expiresAt
    text token UK
    timestamptz createdAt
    timestamptz updatedAt
    text ipAddress
    text userAgent
    text userId FK
  }

  account {
    text id PK
    text accountId
    text providerId
    text userId FK
    text accessToken
    text refreshToken
    text idToken
    timestamptz accessTokenExpiresAt
    timestamptz refreshTokenExpiresAt
    text scope
    text password
    timestamptz createdAt
    timestamptz updatedAt
  }

  verification {
    text id PK
    text identifier
    text value
    timestamptz expiresAt
    timestamptz createdAt
    timestamptz updatedAt
  }

  rateLimit {
    text id PK
    text key UK
    integer count
    bigint lastRequest
  }

  restaurants {
    text id PK
    text slug UK
    jsonb body
    integer version
  }

  memberships {
    text id PK
    text restaurant_id FK
    text user_id FK
    text role
    boolean active
    boolean must_change_password
    timestamptz created_at
  }

  invitations {
    text id PK
    text restaurant_id FK
    text email
    text role
    text token_hash UK
    timestamptz expires_at
    timestamptz accepted_at
    text created_by FK
  }

  operation_results {
    text restaurant_id PK, FK
    text operation_id PK
    text user_id FK
    text payload_hash
    jsonb result
    timestamptz created_at
  }

  mail_outbox {
    bigint id PK
    text recipient
    text subject
    text body
    timestamptz created_at
  }

  uploaded_files {
    text name PK
    text restaurant_id FK
    text owner_id FK
    text content_type
    timestamptz created_at
    bytea data
  }

  schema_migrations {
    text name PK
    timestamptz applied_at
  }

  user ||..o{ account : "tem contas"
  user ||..o{ invitations : "emite convites"
  restaurants ||..o{ invitations : "mantém"
  restaurants ||..o{ memberships : "mantém"
  user ||..o{ memberships : "participa"
  restaurants ||--o{ operation_results : "mantém"
  user ||..o{ operation_results : "executa operações"
  user ||..o{ session : "abre sessões"
  user ||..o{ uploaded_files : "possui arquivos"
  restaurants ||..o{ uploaded_files : "mantém"
```

## Salão e atendimento

```mermaid
erDiagram
  direction TB
  restaurants {
    text id PK
  }

  dining_tables {
    text restaurant_id PK, FK
    text id PK
    jsonb body
  }

  table_groups {
    text restaurant_id PK, FK
    text id PK
    jsonb body
  }

  visits {
    text restaurant_id PK, FK
    text id PK
    jsonb body
    text group_id FK "Gerada de body"
  }

  occupancies {
    text restaurant_id PK, FK
    text id PK
    jsonb body
    text table_id FK "Gerada de body"
    text visit_id FK "Gerada de body"
  }

  tabs {
    text restaurant_id PK, FK
    text id PK
    jsonb body
    text visit_id FK "Gerada de body"
  }

  reservations {
    text restaurant_id PK, FK
    text id PK
    jsonb body
    text visit_id FK "Gerada de body"
  }

  reservation_tables {
    text restaurant_id PK, FK
    text reservation_id PK, FK
    text table_id PK, FK
  }

  waitlist {
    text restaurant_id PK, FK
    text id PK
    jsonb body
    text visit_id FK "Gerada de body"
  }

  service_calls {
    text restaurant_id PK, FK
    text id PK
    jsonb body
    text visit_id FK "Gerada de body"
  }

  audit_events {
    text restaurant_id PK, FK
    text id PK
    jsonb body
  }

  restaurants ||--o{ audit_events : "mantém"
  restaurants ||--o{ dining_tables : "mantém"
  restaurants ||--o{ occupancies : "mantém"
  dining_tables ||..o{ occupancies : "registra ocupações"
  visits ||..o{ occupancies : "ocupa mesas"
  reservations ||--o{ reservation_tables : "aloca mesas"
  dining_tables ||--o{ reservation_tables : "é reservada"
  restaurants ||--o{ reservations : "mantém"
  visits |o..o{ reservations : "atende reservas"
  restaurants ||--o{ service_calls : "mantém"
  visits |o..o{ service_calls : "recebe chamados"
  restaurants ||--o{ table_groups : "mantém"
  restaurants ||--o{ tabs : "mantém"
  visits ||..o{ tabs : "abre comandas"
  restaurants ||--o{ visits : "mantém"
  table_groups |o..o{ visits : "agrupa"
  restaurants ||--o{ waitlist : "mantém"
  visits |o..o{ waitlist : "atende a fila"
```

## Cardápio, estoque e pedidos

```mermaid
erDiagram
  direction TB
  restaurants {
    text id PK
  }

  tabs {
    text restaurant_id PK, FK
    text id PK
  }

  visits {
    text restaurant_id PK, FK
    text id PK
  }

  categories {
    text restaurant_id PK, FK
    text id PK
    jsonb body
  }

  stock_items {
    text restaurant_id PK, FK
    text id PK
    jsonb body
  }

  products {
    text restaurant_id PK, FK
    text id PK
    jsonb body
    text category_id FK "Gerada de body"
  }

  orders {
    text restaurant_id PK, FK
    text id PK
    jsonb body
    text visit_id FK "Gerada de body"
  }

  order_items {
    text restaurant_id PK, FK
    text id PK
    jsonb body
    text order_id FK "Gerada de body"
    text tab_id FK "Gerada de body"
    text product_id FK "Gerada de body"
  }

  stock_movements {
    text restaurant_id PK, FK
    text id PK
    jsonb body
    text stock_item_id FK "Gerada de body"
    text item_id FK "Gerada de body"
  }

  suppliers {
    text restaurant_id PK, FK
    text id PK
    jsonb body
  }

  recipe_components {
    text restaurant_id PK, FK
    text product_id PK, FK
    text component_key PK
    text stock_item_id FK
    bigint quantity_milli
  }

  item_recipe_components {
    text restaurant_id PK, FK
    text item_id PK, FK
    text component_key PK
    text stock_item_id FK
    bigint quantity_milli
  }

  restaurants ||--o{ categories : "mantém"
  order_items ||--o{ item_recipe_components : "registra receita"
  stock_items ||..o{ item_recipe_components : "é usado no item"
  restaurants ||--o{ order_items : "mantém"
  orders |o..o{ order_items : "lista itens"
  products ||..o{ order_items : "é pedido"
  tabs ||..o{ order_items : "contabiliza itens"
  restaurants ||--o{ orders : "mantém"
  visits ||..o{ orders : "recebe pedidos"
  categories ||..o{ products : "classifica"
  restaurants ||--o{ products : "mantém"
  products ||--o{ recipe_components : "define receita"
  stock_items ||..o{ recipe_components : "compõe a receita"
  restaurants ||--o{ stock_items : "mantém"
  restaurants ||--o{ stock_movements : "mantém"
  order_items |o..o{ stock_movements : "gera movimento"
  stock_items ||..o{ stock_movements : "registra movimentos"
  restaurants ||--o{ suppliers : "mantém"
```

## Caixa, recebimentos e estornos

```mermaid
erDiagram
  direction TB
  restaurants {
    text id PK
  }

  order_items {
    text restaurant_id PK, FK
    text id PK
  }

  tabs {
    text restaurant_id PK, FK
    text id PK
  }

  cash_sessions {
    text restaurant_id PK, FK
    text id PK
    jsonb body
  }

  payments {
    text restaurant_id PK, FK
    text id PK
    jsonb body
    text cash_session_id FK "Gerada de body"
  }

  refunds {
    text restaurant_id PK, FK
    text id PK
    jsonb body
    text payment_id FK "Gerada de body"
    text cash_session_id FK "Gerada de body"
  }

  cash_movements {
    text restaurant_id PK, FK
    text id PK
    jsonb body
    text cash_session_id FK "Gerada de body"
  }

  payment_allocations {
    text restaurant_id PK, FK
    text payment_id PK, FK
    integer position PK
    text tab_id FK
    text item_id FK
    bigint amount_cents
  }

  refund_allocations {
    text restaurant_id PK, FK
    text refund_id PK, FK
    integer position PK
    text tab_id FK
    text item_id FK
    bigint amount_cents
  }

  cash_sessions ||..o{ cash_movements : "apura movimentos"
  restaurants ||--o{ cash_movements : "mantém"
  restaurants ||--o{ cash_sessions : "mantém"
  order_items |o..o{ payment_allocations : "pode ser pago"
  payments ||--o{ payment_allocations : "distribui valor"
  tabs ||..o{ payment_allocations : "recebe valor"
  cash_sessions ||..o{ payments : "recebe pagamentos"
  restaurants ||--o{ payments : "mantém"
  order_items |o..o{ refund_allocations : "pode ser estornado"
  refunds ||--o{ refund_allocations : "distribui estorno"
  tabs ||..o{ refund_allocations : "recebe estorno"
  cash_sessions ||..o{ refunds : "registra estornos"
  restaurants ||--o{ refunds : "mantém"
  payments ||..o{ refunds : "pode ser estornado"
```
