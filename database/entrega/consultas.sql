-- Uma consulta por tabela. Credenciais e tokens ficam fora das projeções.
SELECT 'schema_migrations' AS tabela, name, applied_at FROM schema_migrations ORDER BY name;
SELECT 'user' AS tabela, id, name, email FROM "user" ORDER BY id;
SELECT 'session' AS tabela, id, "userId", "expiresAt" FROM "session" ORDER BY id;
SELECT 'account' AS tabela, id, "providerId", "userId" FROM account ORDER BY id;
SELECT 'verification' AS tabela, id, identifier, "expiresAt" FROM verification ORDER BY id;
SELECT 'rateLimit' AS tabela, id, key, count FROM "rateLimit" ORDER BY id;
SELECT 'restaurants' AS tabela, id, slug, body->>'name' AS nome FROM restaurants ORDER BY id;
SELECT 'memberships' AS tabela, id, restaurant_id, user_id, role FROM memberships ORDER BY id;
SELECT 'invitations' AS tabela, id, restaurant_id, email, role, expires_at FROM invitations ORDER BY id;
SELECT 'operation_results' AS tabela, restaurant_id, operation_id, result->>'message' AS resultado
FROM operation_results ORDER BY restaurant_id, operation_id;
SELECT 'mail_outbox' AS tabela, id, recipient, subject FROM mail_outbox ORDER BY id;

SELECT 'dining_tables' AS tabela, restaurant_id, id, body->>'number' AS numero, body->>'sector' AS setor
FROM dining_tables ORDER BY restaurant_id, id;
SELECT 'table_groups' AS tabela, restaurant_id, id, body->>'label' AS grupo
FROM table_groups ORDER BY restaurant_id, id;
SELECT 'visits' AS tabela, restaurant_id, id, group_id, body->>'customerName' AS cliente
FROM visits ORDER BY restaurant_id, id;
SELECT 'occupancies' AS tabela, restaurant_id, id, table_id, visit_id
FROM occupancies ORDER BY restaurant_id, id;
SELECT 'tabs' AS tabela, restaurant_id, id, visit_id, body->>'status' AS situacao
FROM tabs ORDER BY restaurant_id, id;
SELECT 'categories' AS tabela, restaurant_id, id, body->>'name' AS nome
FROM categories ORDER BY restaurant_id, id;
SELECT 'stock_items' AS tabela, restaurant_id, id, body->>'name' AS ingrediente,
       body->>'quantityMilli' AS quantidade_em_milesimos, body->>'unit' AS unidade
FROM stock_items ORDER BY restaurant_id, id;
SELECT 'products' AS tabela, restaurant_id, id, category_id, body->>'name' AS produto,
       body->>'priceCents' AS preco_centavos
FROM products ORDER BY restaurant_id, id;
SELECT 'cash_sessions' AS tabela, restaurant_id, id, body->>'label' AS turno,
       body->>'countedCents' AS dinheiro_contado_centavos
FROM cash_sessions ORDER BY restaurant_id, id;
SELECT 'orders' AS tabela, restaurant_id, id, visit_id FROM orders ORDER BY restaurant_id, id;
SELECT 'order_items' AS tabela, restaurant_id, id, order_id, tab_id, product_id, body->>'status' AS situacao
FROM order_items ORDER BY restaurant_id, id;
SELECT 'stock_movements' AS tabela, restaurant_id, id, stock_item_id, item_id, body->>'kind' AS tipo
FROM stock_movements ORDER BY restaurant_id, id;
SELECT 'payments' AS tabela, restaurant_id, id, cash_session_id, body->>'method' AS forma,
       body->>'amountCents' AS valor_centavos
FROM payments ORDER BY restaurant_id, id;
SELECT 'refunds' AS tabela, restaurant_id, id, payment_id, body->>'amountCents' AS valor_centavos
FROM refunds ORDER BY restaurant_id, id;
SELECT 'cash_movements' AS tabela, restaurant_id, id, cash_session_id, body->>'kind' AS tipo,
       body->>'amountCents' AS valor_centavos
FROM cash_movements ORDER BY restaurant_id, id;
SELECT 'reservations' AS tabela, restaurant_id, id, body->>'customerName' AS cliente,
       body->>'startsAt' AS inicio
FROM reservations ORDER BY restaurant_id, id;
SELECT 'waitlist' AS tabela, restaurant_id, id, body->>'customerName' AS cliente, body->>'status' AS situacao
FROM waitlist ORDER BY restaurant_id, id;
SELECT 'service_calls' AS tabela, restaurant_id, id, visit_id, body->>'destination' AS destino
FROM service_calls ORDER BY restaurant_id, id;
SELECT 'audit_events' AS tabela, restaurant_id, id, body->>'action' AS acao,
       body->>'actorName' AS responsavel
FROM audit_events ORDER BY restaurant_id, id;
SELECT 'suppliers' AS tabela, restaurant_id, id, body->>'name' AS nome
FROM suppliers ORDER BY restaurant_id, id;

SELECT 'recipe_components' AS tabela, restaurant_id, product_id, component_key, stock_item_id, quantity_milli
FROM recipe_components ORDER BY restaurant_id, product_id, component_key;
SELECT 'item_recipe_components' AS tabela, restaurant_id, item_id, component_key, stock_item_id, quantity_milli
FROM item_recipe_components ORDER BY restaurant_id, item_id, component_key;
SELECT 'payment_allocations' AS tabela, restaurant_id, payment_id, position, tab_id, item_id, amount_cents
FROM payment_allocations ORDER BY restaurant_id, payment_id, position;
SELECT 'refund_allocations' AS tabela, restaurant_id, refund_id, position, tab_id, item_id, amount_cents
FROM refund_allocations ORDER BY restaurant_id, refund_id, position;
SELECT 'reservation_tables' AS tabela, restaurant_id, reservation_id, table_id
FROM reservation_tables ORDER BY restaurant_id, reservation_id, table_id;
SELECT 'uploaded_files' AS tabela, name, restaurant_id, owner_id, content_type FROM uploaded_files ORDER BY name;

-- JOIN entre restaurantes, vínculos e usuários.
SELECT 'Equipe por restaurante' AS consulta, r.body->>'name' AS restaurante, u.name AS pessoa, m.role AS funcao
FROM memberships AS m
JOIN restaurants AS r ON r.id = m.restaurant_id
JOIN "user" AS u ON u.id = m.user_id
ORDER BY restaurante, pessoa;

-- JOIN com chaves compostas para listar os produtos de cada pedido.
SELECT 'Itens por pedido' AS consulta, o.id AS pedido, v.body->>'customerName' AS cliente,
       p.body->>'name' AS produto, (i.body->>'quantity')::integer AS quantidade
FROM orders AS o
JOIN visits AS v ON (v.restaurant_id, v.id) = (o.restaurant_id, o.visit_id)
JOIN order_items AS i ON (i.restaurant_id, i.order_id) = (o.restaurant_id, o.id)
JOIN products AS p ON (p.restaurant_id, p.id) = (i.restaurant_id, i.product_id)
ORDER BY pedido, produto;

-- JOIN pela tabela associativa para mostrar as mesas de cada reserva.
SELECT 'Mesas reservadas' AS consulta, r.body->>'customerName' AS cliente,
       (d.body->>'number')::integer AS numero_da_mesa
FROM reservation_tables AS rt
JOIN reservations AS r ON (r.restaurant_id, r.id) = (rt.restaurant_id, rt.reservation_id)
JOIN dining_tables AS d ON (d.restaurant_id, d.id) = (rt.restaurant_id, rt.table_id)
ORDER BY cliente, numero_da_mesa;

-- JOIN e LEFT JOIN para mostrar o valor líquido de cada pagamento.
SELECT 'Pagamento líquido por comanda' AS consulta, p.id AS pagamento, t.body->>'label' AS comanda,
       pa.amount_cents AS recebido_centavos, COALESCE(SUM(ra.amount_cents), 0) AS estornado_centavos,
       pa.amount_cents - COALESCE(SUM(ra.amount_cents), 0) AS liquido_centavos
FROM payment_allocations AS pa
JOIN payments AS p ON (p.restaurant_id, p.id) = (pa.restaurant_id, pa.payment_id)
JOIN tabs AS t ON (t.restaurant_id, t.id) = (pa.restaurant_id, pa.tab_id)
LEFT JOIN refunds AS r ON (r.restaurant_id, r.payment_id) = (p.restaurant_id, p.id)
LEFT JOIN refund_allocations AS ra
  ON (ra.restaurant_id, ra.refund_id, ra.tab_id) = (r.restaurant_id, r.id, pa.tab_id)
  AND ra.item_id IS NOT DISTINCT FROM pa.item_id
GROUP BY p.restaurant_id, p.id, pa.position, t.id, t.body, pa.amount_cents
ORDER BY pagamento, comanda;
