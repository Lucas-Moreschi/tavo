-- Dados fictícios para demonstração do esquema PostgreSQL do Tavo.
-- Execute pelo comando npm run db:entrega ou em um banco vazio com as migrações já aplicadas como SQL.
CREATE TABLE IF NOT EXISTS schema_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

-- Três comandos registram os cinco arquivos de migração que compõem o esquema.
INSERT INTO schema_migrations (name) VALUES ('001_initial.sql');
INSERT INTO schema_migrations (name) VALUES ('002_signed_options.sql');
INSERT INTO schema_migrations (name)
VALUES ('003_temporary_identity.sql'), ('004_files.sql'), ('005_file_contents.sql');

-- "user"
INSERT INTO "user" (id, name, email)
VALUES ('usuario-1', 'Marina Almeida', 'gestor1@exemplo.test');
INSERT INTO "user" (id, name, email)
VALUES ('usuario-2', 'Rafael Costa', 'gestor2@exemplo.test');
INSERT INTO "user" (id, name, email)
VALUES ('usuario-3', 'Joana Lima', 'gestor3@exemplo.test');

-- "session"
INSERT INTO "session" (id, "expiresAt", token, "userId")
VALUES ('sessao-expirada-1', '2025-01-15T10:00:00Z', 'token-ficticio-1', 'usuario-1');
INSERT INTO "session" (id, "expiresAt", token, "userId")
VALUES ('sessao-expirada-2', '2025-01-15T10:00:00Z', 'token-ficticio-2', 'usuario-2');
INSERT INTO "session" (id, "expiresAt", token, "userId")
VALUES ('sessao-expirada-3', '2025-01-15T10:00:00Z', 'token-ficticio-3', 'usuario-3');

-- account
INSERT INTO account (id, "accountId", "providerId", "userId")
VALUES ('conta-1', 'usuario-1', 'credential', 'usuario-1');
INSERT INTO account (id, "accountId", "providerId", "userId")
VALUES ('conta-2', 'usuario-2', 'credential', 'usuario-2');
INSERT INTO account (id, "accountId", "providerId", "userId")
VALUES ('conta-3', 'usuario-3', 'credential', 'usuario-3');

-- verification
INSERT INTO verification (id, identifier, value, "expiresAt")
VALUES ('verificacao-1', 'gestor1@exemplo.test', 'codigo-ficticio-1', '2025-01-15T10:00:00Z');
INSERT INTO verification (id, identifier, value, "expiresAt")
VALUES ('verificacao-2', 'gestor2@exemplo.test', 'codigo-ficticio-2', '2025-01-15T10:00:00Z');
INSERT INTO verification (id, identifier, value, "expiresAt")
VALUES ('verificacao-3', 'gestor3@exemplo.test', 'codigo-ficticio-3', '2025-01-15T10:00:00Z');

-- "rateLimit"
INSERT INTO "rateLimit" (id, key, count, "lastRequest")
VALUES ('limite-1', 'requisicao-ficticia-1', 1, 1736935200001);
INSERT INTO "rateLimit" (id, key, count, "lastRequest")
VALUES ('limite-2', 'requisicao-ficticia-2', 2, 1736935200002);
INSERT INTO "rateLimit" (id, key, count, "lastRequest")
VALUES ('limite-3', 'requisicao-ficticia-3', 3, 1736935200003);

-- restaurants
INSERT INTO restaurants (id, slug, body)
VALUES ('restaurante-1', 'bistro-da-praca', '{
    "id": "restaurante-1", "slug": "bistro-da-praca", "name": "Bistrô da Praça",
    "plan": "demonstracao", "timezone": "America/Sao_Paulo", "serviceRateBps": 0,
    "reservationMinutes": 90, "deliveryFeeCents": 500, "address": "", "phone": "",
    "createdAt": "2025-01-15T09:00:00Z"
  }');
INSERT INTO restaurants (id, slug, body)
VALUES ('restaurante-2', 'cozinha-do-porto', '{
    "id": "restaurante-2", "slug": "cozinha-do-porto", "name": "Cozinha do Porto",
    "plan": "demonstracao", "timezone": "America/Sao_Paulo", "serviceRateBps": 0,
    "reservationMinutes": 90, "deliveryFeeCents": 500, "address": "", "phone": "",
    "createdAt": "2025-01-15T09:00:00Z"
  }');
INSERT INTO restaurants (id, slug, body)
VALUES ('restaurante-3', 'cafe-da-vila', '{
    "id": "restaurante-3", "slug": "cafe-da-vila", "name": "Café da Vila", "plan": "demonstracao",
    "timezone": "America/Sao_Paulo", "serviceRateBps": 0, "reservationMinutes": 90,
    "deliveryFeeCents": 500, "address": "", "phone": "", "createdAt": "2025-01-15T09:00:00Z"
  }');

-- memberships
INSERT INTO memberships (id, restaurant_id, user_id, role)
VALUES ('vinculo-1', 'restaurante-1', 'usuario-1', 'gestor');
INSERT INTO memberships (id, restaurant_id, user_id, role)
VALUES ('vinculo-2', 'restaurante-2', 'usuario-2', 'gestor');
INSERT INTO memberships (id, restaurant_id, user_id, role)
VALUES ('vinculo-3', 'restaurante-3', 'usuario-3', 'gestor');

-- invitations
INSERT INTO invitations (id, restaurant_id, email, role, token_hash, expires_at, created_by)
VALUES ('convite-expirado-1', 'restaurante-1', 'equipe1@exemplo.test', 'garcom', 'hash-ficticio-1', '2025-01-15T10:00:00Z', 'usuario-1');
INSERT INTO invitations (id, restaurant_id, email, role, token_hash, expires_at, created_by)
VALUES ('convite-expirado-2', 'restaurante-2', 'equipe2@exemplo.test', 'caixa', 'hash-ficticio-2', '2025-01-15T10:00:00Z', 'usuario-2');
INSERT INTO invitations (id, restaurant_id, email, role, token_hash, expires_at, created_by)
VALUES ('convite-expirado-3', 'restaurante-3', 'equipe3@exemplo.test', 'bar', 'hash-ficticio-3', '2025-01-15T10:00:00Z', 'usuario-3');

-- operation_results
INSERT INTO operation_results (restaurant_id, operation_id, user_id, payload_hash, result)
VALUES ('restaurante-1', 'operacao-1', 'usuario-1', 'hash-ficticio-1', '{"entityId":"pedido-1","message":"Pedido registrado"}');
INSERT INTO operation_results (restaurant_id, operation_id, user_id, payload_hash, result)
VALUES ('restaurante-2', 'operacao-2', 'usuario-2', 'hash-ficticio-2', '{"entityId":"pedido-2","message":"Pedido registrado"}');
INSERT INTO operation_results (restaurant_id, operation_id, user_id, payload_hash, result)
VALUES ('restaurante-3', 'operacao-3', 'usuario-3', 'hash-ficticio-3', '{"entityId":"pedido-3","message":"Pedido registrado"}');

-- mail_outbox
INSERT INTO mail_outbox (recipient, subject, body)
VALUES ('gestor1@exemplo.test', 'Aviso de teste', 'Mensagem fictícia da demonstração SQL.');
INSERT INTO mail_outbox (recipient, subject, body)
VALUES ('gestor2@exemplo.test', 'Confirmação de teste', 'Mensagem fictícia da demonstração SQL.');
INSERT INTO mail_outbox (recipient, subject, body)
VALUES ('gestor3@exemplo.test', 'Recuperação de teste', 'Mensagem fictícia da demonstração SQL.');

-- dining_tables
INSERT INTO dining_tables (restaurant_id, id, body)
VALUES ('restaurante-1', 'mesa-1', '{
    "id": "mesa-1", "number": 1, "capacity": 4, "sector": "Salão", "active": true
  }');
INSERT INTO dining_tables (restaurant_id, id, body)
VALUES ('restaurante-2', 'mesa-2', '{
    "id": "mesa-2", "number": 2, "capacity": 4, "sector": "Salão", "active": true
  }');
INSERT INTO dining_tables (restaurant_id, id, body)
VALUES ('restaurante-3', 'mesa-3', '{
    "id": "mesa-3", "number": 3, "capacity": 4, "sector": "Salão", "active": true
  }');

-- table_groups
INSERT INTO table_groups (restaurant_id, id, body)
VALUES ('restaurante-1', 'grupo-1', '{
    "id": "grupo-1", "label": "Evento 1", "mode": "unica", "createdAt": "2025-01-15T10:00:00Z",
    "closedAt": "2025-01-15T13:00:00Z"
  }');
INSERT INTO table_groups (restaurant_id, id, body)
VALUES ('restaurante-2', 'grupo-2', '{
    "id": "grupo-2", "label": "Evento 2", "mode": "unica", "createdAt": "2025-01-15T10:00:00Z",
    "closedAt": "2025-01-15T13:00:00Z"
  }');
INSERT INTO table_groups (restaurant_id, id, body)
VALUES ('restaurante-3', 'grupo-3', '{
    "id": "grupo-3", "label": "Evento 3", "mode": "unica", "createdAt": "2025-01-15T10:00:00Z",
    "closedAt": "2025-01-15T13:00:00Z"
  }');

-- visits
INSERT INTO visits (restaurant_id, id, body)
VALUES ('restaurante-1', 'atendimento-1', '{
    "id": "atendimento-1", "label": "Almoço de Ana Dias", "channel": "salao", "people": 2,
    "groupId": "grupo-1", "openedAt": "2025-01-15T11:00:00Z", "closedAt": "2025-01-15T13:00:00Z",
    "createdBy": "usuario-1", "customerName": "Ana Dias", "phone": "", "address": "",
    "deliveryStatus": "aguardando", "deliveryFeeCents": 0
  }');
INSERT INTO visits (restaurant_id, id, body)
VALUES ('restaurante-2', 'atendimento-2', '{
    "id": "atendimento-2", "label": "Almoço de Bruno Reis", "channel": "salao", "people": 2,
    "groupId": "grupo-2", "openedAt": "2025-01-15T11:00:00Z", "closedAt": "2025-01-15T13:00:00Z",
    "createdBy": "usuario-2", "customerName": "Bruno Reis", "phone": "", "address": "",
    "deliveryStatus": "aguardando", "deliveryFeeCents": 0
  }');
INSERT INTO visits (restaurant_id, id, body)
VALUES ('restaurante-3', 'atendimento-3', '{
    "id": "atendimento-3", "label": "Almoço de Carla Melo", "channel": "salao", "people": 2,
    "groupId": "grupo-3", "openedAt": "2025-01-15T11:00:00Z", "closedAt": "2025-01-15T13:00:00Z",
    "createdBy": "usuario-3", "customerName": "Carla Melo", "phone": "", "address": "",
    "deliveryStatus": "aguardando", "deliveryFeeCents": 0
  }');

-- occupancies
INSERT INTO occupancies (restaurant_id, id, body)
VALUES ('restaurante-1', 'ocupacao-1', '{
    "id": "ocupacao-1", "tableId": "mesa-1", "visitId": "atendimento-1",
    "openedAt": "2025-01-15T11:00:00Z", "releasedAt": "2025-01-15T13:00:00Z"
  }');
INSERT INTO occupancies (restaurant_id, id, body)
VALUES ('restaurante-2', 'ocupacao-2', '{
    "id": "ocupacao-2", "tableId": "mesa-2", "visitId": "atendimento-2",
    "openedAt": "2025-01-15T11:00:00Z", "releasedAt": "2025-01-15T13:00:00Z"
  }');
INSERT INTO occupancies (restaurant_id, id, body)
VALUES ('restaurante-3', 'ocupacao-3', '{
    "id": "ocupacao-3", "tableId": "mesa-3", "visitId": "atendimento-3",
    "openedAt": "2025-01-15T11:00:00Z", "releasedAt": "2025-01-15T13:00:00Z"
  }');

-- tabs
INSERT INTO tabs (restaurant_id, id, body)
VALUES ('restaurante-1', 'comanda-1', '{
    "id": "comanda-1", "visitId": "atendimento-1", "label": "Ana Dias", "status": "fechada",
    "serviceRateBps": 0, "discountCents": 200, "extraCents": 0,
    "openedAt": "2025-01-15T11:00:00Z", "closedAt": "2025-01-15T13:00:00Z"
  }');
INSERT INTO tabs (restaurant_id, id, body)
VALUES ('restaurante-2', 'comanda-2', '{
    "id": "comanda-2", "visitId": "atendimento-2", "label": "Bruno Reis", "status": "fechada",
    "serviceRateBps": 0, "discountCents": 500, "extraCents": 0,
    "openedAt": "2025-01-15T11:00:00Z", "closedAt": "2025-01-15T13:00:00Z"
  }');
INSERT INTO tabs (restaurant_id, id, body)
VALUES ('restaurante-3', 'comanda-3', '{
    "id": "comanda-3", "visitId": "atendimento-3", "label": "Carla Melo", "status": "fechada",
    "serviceRateBps": 0, "discountCents": 100, "extraCents": 0,
    "openedAt": "2025-01-15T11:00:00Z", "closedAt": "2025-01-15T13:00:00Z"
  }');

-- categories
INSERT INTO categories (restaurant_id, id, body)
VALUES ('restaurante-1', 'categoria-1', '{
    "id": "categoria-1", "name": "Entradas", "active": true
  }');
INSERT INTO categories (restaurant_id, id, body)
VALUES ('restaurante-2', 'categoria-2', '{
    "id": "categoria-2", "name": "Pratos", "active": true
  }');
INSERT INTO categories (restaurant_id, id, body)
VALUES ('restaurante-3', 'categoria-3', '{
    "id": "categoria-3", "name": "Bebidas", "active": true
  }');

-- stock_items
INSERT INTO stock_items (restaurant_id, id, body)
VALUES ('restaurante-1', 'insumo-1', '{
    "id": "insumo-1", "name": "Batata", "unit": "g", "quantityMilli": 1800000, "reservedMilli": 0,
    "minimumMilli": 250000, "averageCostMicros": 10500, "active": true
  }');
INSERT INTO stock_items (restaurant_id, id, body)
VALUES ('restaurante-2', 'insumo-2', '{
    "id": "insumo-2", "name": "Arroz arbóreo", "unit": "g", "quantityMilli": 1880000,
    "reservedMilli": 0, "minimumMilli": 250000, "averageCostMicros": 25833, "active": true
  }');
INSERT INTO stock_items (restaurant_id, id, body)
VALUES ('restaurante-3', 'insumo-3', '{
    "id": "insumo-3", "name": "Café moído", "unit": "g", "quantityMilli": 1980000,
    "reservedMilli": 0, "minimumMilli": 250000, "averageCostMicros": 47500, "active": true
  }');

-- products
INSERT INTO products (restaurant_id, id, body)
VALUES ('restaurante-1', 'produto-1', '{
    "id": "produto-1", "categoryId": "categoria-1", "name": "Batata rústica",
    "description": "Produto de exemplo", "priceCents": 1800, "station": "cozinha", "active": true,
    "imageUrl": null, "tag": "", "recipe": [{"stockItemId":"insumo-1","quantityMilli":200000}],
    "options": [], "recipeVersion": 1
  }');
INSERT INTO products (restaurant_id, id, body)
VALUES ('restaurante-2', 'produto-2', '{
    "id": "produto-2", "categoryId": "categoria-2", "name": "Risoto de cogumelos",
    "description": "Produto de exemplo", "priceCents": 2500, "station": "cozinha", "active": true,
    "imageUrl": null, "tag": "", "recipe": [{"stockItemId":"insumo-2","quantityMilli":120000}],
    "options": [], "recipeVersion": 1
  }');
INSERT INTO products (restaurant_id, id, body)
VALUES ('restaurante-3', 'produto-3', '{
    "id": "produto-3", "categoryId": "categoria-3", "name": "Café coado",
    "description": "Produto de exemplo", "priceCents": 900, "station": "bar", "active": true,
    "imageUrl": null, "tag": "", "recipe": [{"stockItemId":"insumo-3","quantityMilli":20000}],
    "options": [], "recipeVersion": 1
  }');

-- cash_sessions
INSERT INTO cash_sessions (restaurant_id, id, body)
VALUES ('restaurante-1', 'caixa-1', '{
    "id": "caixa-1", "label": "Turno 1", "openedBy": "vinculo-1",
    "openedAt": "2025-01-15T10:00:00Z", "closedAt": "2025-01-15T14:00:00Z", "openingCents": 10000,
    "countedCents": 10500, "differenceCents": 0, "closeReason": "Conferência de exemplo"
  }');
INSERT INTO cash_sessions (restaurant_id, id, body)
VALUES ('restaurante-2', 'caixa-2', '{
    "id": "caixa-2", "label": "Turno 2", "openedBy": "vinculo-2",
    "openedAt": "2025-01-15T10:00:00Z", "closedAt": "2025-01-15T14:00:00Z", "openingCents": 10000,
    "countedCents": 9500, "differenceCents": 0, "closeReason": "Conferência de exemplo"
  }');
INSERT INTO cash_sessions (restaurant_id, id, body)
VALUES ('restaurante-3', 'caixa-3', '{
    "id": "caixa-3", "label": "Turno 3", "openedBy": "vinculo-3",
    "openedAt": "2025-01-15T10:00:00Z", "closedAt": "2025-01-15T14:00:00Z", "openingCents": 10000,
    "countedCents": 11300, "differenceCents": 0, "closeReason": "Conferência de exemplo"
  }');

-- orders
INSERT INTO orders (restaurant_id, id, body)
VALUES ('restaurante-1', 'pedido-1', '{
    "id": "pedido-1", "visitId": "atendimento-1", "createdAt": "2025-01-15T11:00:00Z",
    "createdBy": "usuario-1"
  }');
INSERT INTO orders (restaurant_id, id, body)
VALUES ('restaurante-2', 'pedido-2', '{
    "id": "pedido-2", "visitId": "atendimento-2", "createdAt": "2025-01-15T11:00:00Z",
    "createdBy": "usuario-2"
  }');
INSERT INTO orders (restaurant_id, id, body)
VALUES ('restaurante-3', 'pedido-3', '{
    "id": "pedido-3", "visitId": "atendimento-3", "createdAt": "2025-01-15T11:00:00Z",
    "createdBy": "usuario-3"
  }');

-- order_items
INSERT INTO order_items (restaurant_id, id, body)
VALUES ('restaurante-1', 'item-1', '{
    "id": "item-1", "orderId": "pedido-1", "tabId": "comanda-1", "productId": "produto-1",
    "name": "Batata rústica", "quantity": 1, "unitPriceCents": 1800, "status": "entregue",
    "station": "cozinha", "notes": "", "options": [],
    "recipe": [{"stockItemId":"insumo-1","quantityMilli":200000,"unitCostMicros":10500}],
    "recipeVersion": 1, "createdAt": "2025-01-15T11:00:00Z", "sentAt": "2025-01-15T11:00:00Z",
    "startedAt": "2025-01-15T11:00:00Z", "readyAt": "2025-01-15T12:00:00Z",
    "deliveredAt": "2025-01-15T12:00:00Z", "cancelledAt": null, "cancelReason": null,
    "costCents": 210, "startedQuantity": 1, "readyQuantity": 1, "deliveredQuantity": 1
  }');
INSERT INTO order_items (restaurant_id, id, body)
VALUES ('restaurante-2', 'item-2', '{
    "id": "item-2", "orderId": "pedido-2", "tabId": "comanda-2", "productId": "produto-2",
    "name": "Risoto de cogumelos", "quantity": 1, "unitPriceCents": 2500, "status": "entregue",
    "station": "cozinha", "notes": "", "options": [],
    "recipe": [{"stockItemId":"insumo-2","quantityMilli":120000,"unitCostMicros":25833}],
    "recipeVersion": 1, "createdAt": "2025-01-15T11:00:00Z", "sentAt": "2025-01-15T11:00:00Z",
    "startedAt": "2025-01-15T11:00:00Z", "readyAt": "2025-01-15T12:00:00Z",
    "deliveredAt": "2025-01-15T12:00:00Z", "cancelledAt": null, "cancelReason": null,
    "costCents": 310, "startedQuantity": 1, "readyQuantity": 1, "deliveredQuantity": 1
  }');
INSERT INTO order_items (restaurant_id, id, body)
VALUES ('restaurante-3', 'item-3', '{
    "id": "item-3", "orderId": "pedido-3", "tabId": "comanda-3", "productId": "produto-3",
    "name": "Café coado", "quantity": 1, "unitPriceCents": 900, "status": "entregue",
    "station": "bar", "notes": "", "options": [],
    "recipe": [{"stockItemId":"insumo-3","quantityMilli":20000,"unitCostMicros":47500}],
    "recipeVersion": 1, "createdAt": "2025-01-15T11:00:00Z", "sentAt": "2025-01-15T11:00:00Z",
    "startedAt": "2025-01-15T11:00:00Z", "readyAt": "2025-01-15T12:00:00Z",
    "deliveredAt": "2025-01-15T12:00:00Z", "cancelledAt": null, "cancelReason": null,
    "costCents": 95, "startedQuantity": 1, "readyQuantity": 1, "deliveredQuantity": 1
  }');

-- stock_movements
INSERT INTO stock_movements (restaurant_id, id, body)
VALUES ('restaurante-1', 'mov-estoque-1', '{
    "id": "mov-estoque-1", "stockItemId": "insumo-1", "itemId": "item-1", "kind": "consumo",
    "quantityMilli": 200000, "costCents": 210, "reason": "Preparo do pedido",
    "createdAt": "2025-01-15T11:00:00Z", "createdBy": "usuario-1"
  }');
INSERT INTO stock_movements (restaurant_id, id, body)
VALUES ('restaurante-2', 'mov-estoque-2', '{
    "id": "mov-estoque-2", "stockItemId": "insumo-2", "itemId": "item-2", "kind": "consumo",
    "quantityMilli": 120000, "costCents": 310, "reason": "Preparo do pedido",
    "createdAt": "2025-01-15T11:00:00Z", "createdBy": "usuario-2"
  }');
INSERT INTO stock_movements (restaurant_id, id, body)
VALUES ('restaurante-3', 'mov-estoque-3', '{
    "id": "mov-estoque-3", "stockItemId": "insumo-3", "itemId": "item-3", "kind": "consumo",
    "quantityMilli": 20000, "costCents": 95, "reason": "Preparo do pedido",
    "createdAt": "2025-01-15T11:00:00Z", "createdBy": "usuario-3"
  }');

-- payments
INSERT INTO payments (restaurant_id, id, body)
VALUES ('restaurante-1', 'pagamento-1', '{
    "id": "pagamento-1", "cashSessionId": "caixa-1", "method": "pix", "amountCents": 1800,
    "tenderedCents": 1800, "changeCents": 0,
    "allocations": [{"tabId":"comanda-1","itemId":"item-1","amountCents":1800}],
    "createdAt": "2025-01-15T12:00:00Z", "createdBy": "vinculo-1",
    "reference": "Recebimento externo de exemplo"
  }');
INSERT INTO payments (restaurant_id, id, body)
VALUES ('restaurante-2', 'pagamento-2', '{
    "id": "pagamento-2", "cashSessionId": "caixa-2", "method": "credito", "amountCents": 2500,
    "tenderedCents": 2500, "changeCents": 0,
    "allocations": [{"tabId":"comanda-2","itemId":"item-2","amountCents":2500}],
    "createdAt": "2025-01-15T12:00:00Z", "createdBy": "vinculo-2",
    "reference": "Recebimento externo de exemplo"
  }');
INSERT INTO payments (restaurant_id, id, body)
VALUES ('restaurante-3', 'pagamento-3', '{
    "id": "pagamento-3", "cashSessionId": "caixa-3", "method": "dinheiro", "amountCents": 900,
    "tenderedCents": 900, "changeCents": 0,
    "allocations": [{"tabId":"comanda-3","itemId":"item-3","amountCents":900}],
    "createdAt": "2025-01-15T12:00:00Z", "createdBy": "vinculo-3",
    "reference": "Recebimento externo de exemplo"
  }');

-- refunds
INSERT INTO refunds (restaurant_id, id, body)
VALUES ('restaurante-1', 'estorno-1', '{
    "id": "estorno-1", "paymentId": "pagamento-1", "cashSessionId": "caixa-1", "amountCents": 200,
    "allocations": [{"tabId":"comanda-1","itemId":"item-1","amountCents":200}],
    "reason": "Cortesia após o pagamento", "createdAt": "2025-01-15T13:00:00Z",
    "createdBy": "vinculo-1"
  }');
INSERT INTO refunds (restaurant_id, id, body)
VALUES ('restaurante-2', 'estorno-2', '{
    "id": "estorno-2", "paymentId": "pagamento-2", "cashSessionId": "caixa-2", "amountCents": 500,
    "allocations": [{"tabId":"comanda-2","itemId":"item-2","amountCents":500}],
    "reason": "Cortesia após o pagamento", "createdAt": "2025-01-15T13:00:00Z",
    "createdBy": "vinculo-2"
  }');
INSERT INTO refunds (restaurant_id, id, body)
VALUES ('restaurante-3', 'estorno-3', '{
    "id": "estorno-3", "paymentId": "pagamento-3", "cashSessionId": "caixa-3", "amountCents": 100,
    "allocations": [{"tabId":"comanda-3","itemId":"item-3","amountCents":100}],
    "reason": "Cortesia após o pagamento", "createdAt": "2025-01-15T13:00:00Z",
    "createdBy": "vinculo-3"
  }');

-- cash_movements
INSERT INTO cash_movements (restaurant_id, id, body)
VALUES ('restaurante-1', 'mov-caixa-1', '{
    "id": "mov-caixa-1", "cashSessionId": "caixa-1", "kind": "suprimento", "amountCents": 500,
    "reason": "Conferência de exemplo", "createdAt": "2025-01-15T11:00:00Z",
    "createdBy": "vinculo-1"
  }');
INSERT INTO cash_movements (restaurant_id, id, body)
VALUES ('restaurante-2', 'mov-caixa-2', '{
    "id": "mov-caixa-2", "cashSessionId": "caixa-2", "kind": "sangria", "amountCents": 500,
    "reason": "Conferência de exemplo", "createdAt": "2025-01-15T11:00:00Z",
    "createdBy": "vinculo-2"
  }');
INSERT INTO cash_movements (restaurant_id, id, body)
VALUES ('restaurante-3', 'mov-caixa-3', '{
    "id": "mov-caixa-3", "cashSessionId": "caixa-3", "kind": "suprimento", "amountCents": 500,
    "reason": "Conferência de exemplo", "createdAt": "2025-01-15T11:00:00Z",
    "createdBy": "vinculo-3"
  }');

-- reservations
INSERT INTO reservations (restaurant_id, id, body)
VALUES ('restaurante-1', 'reserva-1', '{
    "id": "reserva-1", "customerName": "Ana Dias", "phone": "", "people": 2,
    "tableIds": ["mesa-1"], "startsAt": "2025-01-15T11:00:00Z", "endsAt": "2025-01-15T13:00:00Z",
    "notes": "", "status": "chegou", "visitId": "atendimento-1"
  }');
INSERT INTO reservations (restaurant_id, id, body)
VALUES ('restaurante-2', 'reserva-2', '{
    "id": "reserva-2", "customerName": "Bruno Reis", "phone": "", "people": 2,
    "tableIds": ["mesa-2"], "startsAt": "2025-01-15T11:00:00Z", "endsAt": "2025-01-15T13:00:00Z",
    "notes": "", "status": "chegou", "visitId": "atendimento-2"
  }');
INSERT INTO reservations (restaurant_id, id, body)
VALUES ('restaurante-3', 'reserva-3', '{
    "id": "reserva-3", "customerName": "Carla Melo", "phone": "", "people": 2,
    "tableIds": ["mesa-3"], "startsAt": "2025-01-15T11:00:00Z", "endsAt": "2025-01-15T13:00:00Z",
    "notes": "", "status": "chegou", "visitId": "atendimento-3"
  }');

-- waitlist
INSERT INTO waitlist (restaurant_id, id, body)
VALUES ('restaurante-1', 'fila-1', '{
    "id": "fila-1", "customerName": "Cliente de espera 1", "phone": "", "people": 4,
    "createdAt": "2025-01-15T13:00:00Z", "status": "aguardando", "visitId": null
  }');
INSERT INTO waitlist (restaurant_id, id, body)
VALUES ('restaurante-2', 'fila-2', '{
    "id": "fila-2", "customerName": "Cliente de espera 2", "phone": "", "people": 4,
    "createdAt": "2025-01-15T13:00:00Z", "status": "chamado", "visitId": null
  }');
INSERT INTO waitlist (restaurant_id, id, body)
VALUES ('restaurante-3', 'fila-3', '{
    "id": "fila-3", "customerName": "Cliente de espera 3", "phone": "", "people": 4,
    "createdAt": "2025-01-15T13:00:00Z", "status": "cancelado", "visitId": null
  }');

-- service_calls
INSERT INTO service_calls (restaurant_id, id, body)
VALUES ('restaurante-1', 'chamado-1', '{
    "id": "chamado-1", "visitId": "atendimento-1", "destination": "cozinha",
    "message": "Conferir batata rústica", "status": "concluido",
    "createdAt": "2025-01-15T11:00:00Z", "createdBy": "usuario-1"
  }');
INSERT INTO service_calls (restaurant_id, id, body)
VALUES ('restaurante-2', 'chamado-2', '{
    "id": "chamado-2", "visitId": "atendimento-2", "destination": "cozinha",
    "message": "Conferir risoto de cogumelos", "status": "concluido",
    "createdAt": "2025-01-15T11:00:00Z", "createdBy": "usuario-2"
  }');
INSERT INTO service_calls (restaurant_id, id, body)
VALUES ('restaurante-3', 'chamado-3', '{
    "id": "chamado-3", "visitId": "atendimento-3", "destination": "bar",
    "message": "Conferir café coado", "status": "concluido", "createdAt": "2025-01-15T11:00:00Z",
    "createdBy": "usuario-3"
  }');

-- audit_events
INSERT INTO audit_events (restaurant_id, id, body)
VALUES ('restaurante-1', 'auditoria-1', '{
    "id": "auditoria-1", "action": "visit.close", "entityId": "atendimento-1",
    "detail": "Atendimento encerrado", "createdAt": "2025-01-15T13:00:00Z",
    "createdBy": "usuario-1", "actorName": "Marina Almeida"
  }');
INSERT INTO audit_events (restaurant_id, id, body)
VALUES ('restaurante-2', 'auditoria-2', '{
    "id": "auditoria-2", "action": "visit.close", "entityId": "atendimento-2",
    "detail": "Atendimento encerrado", "createdAt": "2025-01-15T13:00:00Z",
    "createdBy": "usuario-2", "actorName": "Rafael Costa"
  }');
INSERT INTO audit_events (restaurant_id, id, body)
VALUES ('restaurante-3', 'auditoria-3', '{
    "id": "auditoria-3", "action": "visit.close", "entityId": "atendimento-3",
    "detail": "Atendimento encerrado", "createdAt": "2025-01-15T13:00:00Z",
    "createdBy": "usuario-3", "actorName": "Joana Lima"
  }');

-- suppliers
INSERT INTO suppliers (restaurant_id, id, body)
VALUES ('restaurante-1', 'fornecedor-1', '{
    "id": "fornecedor-1", "name": "Hortifruti da Praça", "phone": "", "active": true
  }');
INSERT INTO suppliers (restaurant_id, id, body)
VALUES ('restaurante-2', 'fornecedor-2', '{
    "id": "fornecedor-2", "name": "Armazém do Porto", "phone": "", "active": true
  }');
INSERT INTO suppliers (restaurant_id, id, body)
VALUES ('restaurante-3', 'fornecedor-3', '{
    "id": "fornecedor-3", "name": "Torrefação da Vila", "phone": "", "active": true
  }');

-- recipe_components
INSERT INTO recipe_components (restaurant_id, product_id, component_key, stock_item_id, quantity_milli)
VALUES ('restaurante-1', 'produto-1', 'base:0', 'insumo-1', 200000);
INSERT INTO recipe_components (restaurant_id, product_id, component_key, stock_item_id, quantity_milli)
VALUES ('restaurante-2', 'produto-2', 'base:0', 'insumo-2', 120000);
INSERT INTO recipe_components (restaurant_id, product_id, component_key, stock_item_id, quantity_milli)
VALUES ('restaurante-3', 'produto-3', 'base:0', 'insumo-3', 20000);

-- item_recipe_components
INSERT INTO item_recipe_components (restaurant_id, item_id, component_key, stock_item_id, quantity_milli)
VALUES ('restaurante-1', 'item-1', '0', 'insumo-1', 200000);
INSERT INTO item_recipe_components (restaurant_id, item_id, component_key, stock_item_id, quantity_milli)
VALUES ('restaurante-2', 'item-2', '0', 'insumo-2', 120000);
INSERT INTO item_recipe_components (restaurant_id, item_id, component_key, stock_item_id, quantity_milli)
VALUES ('restaurante-3', 'item-3', '0', 'insumo-3', 20000);

-- payment_allocations
INSERT INTO payment_allocations (restaurant_id, payment_id, position, tab_id, item_id, amount_cents)
VALUES ('restaurante-1', 'pagamento-1', 0, 'comanda-1', 'item-1', 1800);
INSERT INTO payment_allocations (restaurant_id, payment_id, position, tab_id, item_id, amount_cents)
VALUES ('restaurante-2', 'pagamento-2', 0, 'comanda-2', 'item-2', 2500);
INSERT INTO payment_allocations (restaurant_id, payment_id, position, tab_id, item_id, amount_cents)
VALUES ('restaurante-3', 'pagamento-3', 0, 'comanda-3', 'item-3', 900);

-- refund_allocations
INSERT INTO refund_allocations (restaurant_id, refund_id, position, tab_id, item_id, amount_cents)
VALUES ('restaurante-1', 'estorno-1', 0, 'comanda-1', 'item-1', 200);
INSERT INTO refund_allocations (restaurant_id, refund_id, position, tab_id, item_id, amount_cents)
VALUES ('restaurante-2', 'estorno-2', 0, 'comanda-2', 'item-2', 500);
INSERT INTO refund_allocations (restaurant_id, refund_id, position, tab_id, item_id, amount_cents)
VALUES ('restaurante-3', 'estorno-3', 0, 'comanda-3', 'item-3', 100);

-- reservation_tables
INSERT INTO reservation_tables (restaurant_id, reservation_id, table_id)
VALUES ('restaurante-1', 'reserva-1', 'mesa-1');
INSERT INTO reservation_tables (restaurant_id, reservation_id, table_id)
VALUES ('restaurante-2', 'reserva-2', 'mesa-2');
INSERT INTO reservation_tables (restaurant_id, reservation_id, table_id)
VALUES ('restaurante-3', 'reserva-3', 'mesa-3');

-- uploaded_files
INSERT INTO uploaded_files (name, restaurant_id, owner_id, content_type)
VALUES ('foto-1.png', 'restaurante-1', 'usuario-1', 'image/png');
INSERT INTO uploaded_files (name, restaurant_id, owner_id, content_type)
VALUES ('foto-2.webp', 'restaurante-2', 'usuario-2', 'image/webp');
INSERT INTO uploaded_files (name, restaurant_id, owner_id, content_type)
VALUES ('foto-3.jpg', 'restaurante-3', 'usuario-3', 'image/jpeg');
