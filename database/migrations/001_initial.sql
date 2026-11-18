-- PostgreSQL local e Neon compartilham este esquema. As relações de domínio
-- incluem restaurante na chave para impedir referências entre empresas.
CREATE TABLE IF NOT EXISTS "user" (
 id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE,
 "emailVerified" boolean NOT NULL DEFAULT false, image text,
 "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "session" (
 id text PRIMARY KEY, "expiresAt" timestamptz NOT NULL, token text NOT NULL UNIQUE,
 "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
 "ipAddress" text, "userAgent" text, "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS auth_session_user_idx ON "session" ("userId");
CREATE TABLE IF NOT EXISTS account (
 id text PRIMARY KEY, "accountId" text NOT NULL, "providerId" text NOT NULL,
 "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 "accessToken" text, "refreshToken" text, "idToken" text,
 "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, scope text, password text,
 "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
 UNIQUE ("providerId", "accountId")
);
CREATE TABLE IF NOT EXISTS verification (
 id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL, "expiresAt" timestamptz NOT NULL,
 "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS verification_identifier ON verification(identifier);
CREATE TABLE IF NOT EXISTS "rateLimit" (id text PRIMARY KEY, key text NOT NULL UNIQUE, count integer NOT NULL DEFAULT 0, "lastRequest" bigint NOT NULL);
CREATE TABLE restaurants (
 id text PRIMARY KEY, slug text NOT NULL UNIQUE, body jsonb NOT NULL,
 version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
 CHECK (body->>'id'=id), CHECK(body->>'slug'=slug)
);
CREATE TABLE memberships (
 id text PRIMARY KEY, restaurant_id text NOT NULL REFERENCES restaurants(id),
 user_id text NOT NULL REFERENCES "user"(id), role text NOT NULL CHECK(role IN ('gestor','garcom','caixa','cozinha','bar')),
 active boolean NOT NULL DEFAULT true, must_change_password boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(restaurant_id,user_id), UNIQUE(restaurant_id,id)
);
CREATE INDEX membership_user ON memberships(user_id);
CREATE TABLE invitations (
 id text PRIMARY KEY, restaurant_id text NOT NULL REFERENCES restaurants(id), email text NOT NULL,
 role text NOT NULL CHECK(role IN ('gestor','garcom','caixa','cozinha','bar')), token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL, accepted_at timestamptz, created_by text NOT NULL REFERENCES "user"(id)
);
CREATE TABLE operation_results (
 restaurant_id text NOT NULL REFERENCES restaurants(id), operation_id text NOT NULL,
 user_id text NOT NULL REFERENCES "user"(id), payload_hash text NOT NULL, result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(restaurant_id,operation_id)
);
CREATE TABLE mail_outbox (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, recipient text NOT NULL, subject text NOT NULL, body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE dining_tables (
 restaurant_id text NOT NULL REFERENCES restaurants(id), id text NOT NULL, body jsonb NOT NULL,
 PRIMARY KEY(restaurant_id,id), CHECK(body->>'id'=id)
);

CREATE TABLE table_groups (
 restaurant_id text NOT NULL REFERENCES restaurants(id), id text NOT NULL, body jsonb NOT NULL,
 PRIMARY KEY(restaurant_id,id), CHECK(body->>'id'=id)
);

CREATE TABLE visits (
 restaurant_id text NOT NULL REFERENCES restaurants(id), id text NOT NULL, body jsonb NOT NULL,
 group_id text GENERATED ALWAYS AS (body->>'groupId') STORED,
 PRIMARY KEY(restaurant_id,id), CHECK(body->>'id'=id)
);

CREATE TABLE occupancies (
 restaurant_id text NOT NULL REFERENCES restaurants(id), id text NOT NULL, body jsonb NOT NULL,
 table_id text GENERATED ALWAYS AS (body->>'tableId') STORED NOT NULL,
 visit_id text GENERATED ALWAYS AS (body->>'visitId') STORED NOT NULL,
 PRIMARY KEY(restaurant_id,id), CHECK(body->>'id'=id)
);

CREATE TABLE tabs (
 restaurant_id text NOT NULL REFERENCES restaurants(id), id text NOT NULL, body jsonb NOT NULL,
 visit_id text GENERATED ALWAYS AS (body->>'visitId') STORED NOT NULL,
 PRIMARY KEY(restaurant_id,id), CHECK(body->>'id'=id)
);

CREATE TABLE categories (
 restaurant_id text NOT NULL REFERENCES restaurants(id), id text NOT NULL, body jsonb NOT NULL,
 PRIMARY KEY(restaurant_id,id), CHECK(body->>'id'=id)
);

CREATE TABLE stock_items (
 restaurant_id text NOT NULL REFERENCES restaurants(id), id text NOT NULL, body jsonb NOT NULL,
 PRIMARY KEY(restaurant_id,id), CHECK(body->>'id'=id)
);

CREATE TABLE products (
 restaurant_id text NOT NULL REFERENCES restaurants(id), id text NOT NULL, body jsonb NOT NULL,
 category_id text GENERATED ALWAYS AS (body->>'categoryId') STORED NOT NULL,
 PRIMARY KEY(restaurant_id,id), CHECK(body->>'id'=id)
);

CREATE TABLE cash_sessions (
 restaurant_id text NOT NULL REFERENCES restaurants(id), id text NOT NULL, body jsonb NOT NULL,
 PRIMARY KEY(restaurant_id,id), CHECK(body->>'id'=id)
);

CREATE TABLE orders (
 restaurant_id text NOT NULL REFERENCES restaurants(id), id text NOT NULL, body jsonb NOT NULL,
 visit_id text GENERATED ALWAYS AS (body->>'visitId') STORED NOT NULL,
 PRIMARY KEY(restaurant_id,id), CHECK(body->>'id'=id)
);

CREATE TABLE order_items (
 restaurant_id text NOT NULL REFERENCES restaurants(id), id text NOT NULL, body jsonb NOT NULL,
 order_id text GENERATED ALWAYS AS (body->>'orderId') STORED,
 tab_id text GENERATED ALWAYS AS (body->>'tabId') STORED NOT NULL,
 product_id text GENERATED ALWAYS AS (body->>'productId') STORED NOT NULL,
 PRIMARY KEY(restaurant_id,id), CHECK(body->>'id'=id)
);

CREATE TABLE stock_movements (
 restaurant_id text NOT NULL REFERENCES restaurants(id), id text NOT NULL, body jsonb NOT NULL,
 stock_item_id text GENERATED ALWAYS AS (body->>'stockItemId') STORED NOT NULL,
 item_id text GENERATED ALWAYS AS (body->>'itemId') STORED,
 PRIMARY KEY(restaurant_id,id), CHECK(body->>'id'=id)
);

CREATE TABLE payments (
 restaurant_id text NOT NULL REFERENCES restaurants(id), id text NOT NULL, body jsonb NOT NULL,
 cash_session_id text GENERATED ALWAYS AS (body->>'cashSessionId') STORED NOT NULL,
 PRIMARY KEY(restaurant_id,id), CHECK(body->>'id'=id)
);

CREATE TABLE refunds (
 restaurant_id text NOT NULL REFERENCES restaurants(id), id text NOT NULL, body jsonb NOT NULL,
 payment_id text GENERATED ALWAYS AS (body->>'paymentId') STORED NOT NULL,
 cash_session_id text GENERATED ALWAYS AS (body->>'cashSessionId') STORED NOT NULL,
 PRIMARY KEY(restaurant_id,id), CHECK(body->>'id'=id)
);

CREATE TABLE cash_movements (
 restaurant_id text NOT NULL REFERENCES restaurants(id), id text NOT NULL, body jsonb NOT NULL,
 cash_session_id text GENERATED ALWAYS AS (body->>'cashSessionId') STORED NOT NULL,
 PRIMARY KEY(restaurant_id,id), CHECK(body->>'id'=id)
);

CREATE TABLE reservations (
 restaurant_id text NOT NULL REFERENCES restaurants(id), id text NOT NULL, body jsonb NOT NULL,
 visit_id text GENERATED ALWAYS AS (body->>'visitId') STORED,
 PRIMARY KEY(restaurant_id,id), CHECK(body->>'id'=id)
);

CREATE TABLE waitlist (
 restaurant_id text NOT NULL REFERENCES restaurants(id), id text NOT NULL, body jsonb NOT NULL,
 visit_id text GENERATED ALWAYS AS (body->>'visitId') STORED,
 PRIMARY KEY(restaurant_id,id), CHECK(body->>'id'=id)
);

CREATE TABLE service_calls (
 restaurant_id text NOT NULL REFERENCES restaurants(id), id text NOT NULL, body jsonb NOT NULL,
 visit_id text GENERATED ALWAYS AS (body->>'visitId') STORED,
 PRIMARY KEY(restaurant_id,id), CHECK(body->>'id'=id)
);

CREATE TABLE audit_events (
 restaurant_id text NOT NULL REFERENCES restaurants(id), id text NOT NULL, body jsonb NOT NULL,
 PRIMARY KEY(restaurant_id,id), CHECK(body->>'id'=id)
);

CREATE TABLE suppliers (
 restaurant_id text NOT NULL REFERENCES restaurants(id), id text NOT NULL, body jsonb NOT NULL,
 PRIMARY KEY(restaurant_id,id), CHECK(body->>'id'=id)
);
ALTER TABLE visits ADD FOREIGN KEY(restaurant_id,group_id) REFERENCES table_groups(restaurant_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX visits_group_id ON visits(restaurant_id,group_id);
ALTER TABLE occupancies ADD FOREIGN KEY(restaurant_id,table_id) REFERENCES dining_tables(restaurant_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX occupancies_table_id ON occupancies(restaurant_id,table_id);
ALTER TABLE occupancies ADD FOREIGN KEY(restaurant_id,visit_id) REFERENCES visits(restaurant_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX occupancies_visit_id ON occupancies(restaurant_id,visit_id);
ALTER TABLE tabs ADD FOREIGN KEY(restaurant_id,visit_id) REFERENCES visits(restaurant_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX tabs_visit_id ON tabs(restaurant_id,visit_id);
ALTER TABLE products ADD FOREIGN KEY(restaurant_id,category_id) REFERENCES categories(restaurant_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX products_category_id ON products(restaurant_id,category_id);
ALTER TABLE orders ADD FOREIGN KEY(restaurant_id,visit_id) REFERENCES visits(restaurant_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX orders_visit_id ON orders(restaurant_id,visit_id);
ALTER TABLE order_items ADD FOREIGN KEY(restaurant_id,order_id) REFERENCES orders(restaurant_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX order_items_order_id ON order_items(restaurant_id,order_id);
ALTER TABLE order_items ADD FOREIGN KEY(restaurant_id,tab_id) REFERENCES tabs(restaurant_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX order_items_tab_id ON order_items(restaurant_id,tab_id);
ALTER TABLE order_items ADD FOREIGN KEY(restaurant_id,product_id) REFERENCES products(restaurant_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX order_items_product_id ON order_items(restaurant_id,product_id);
ALTER TABLE stock_movements ADD FOREIGN KEY(restaurant_id,stock_item_id) REFERENCES stock_items(restaurant_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX stock_movements_stock_item_id ON stock_movements(restaurant_id,stock_item_id);
ALTER TABLE stock_movements ADD FOREIGN KEY(restaurant_id,item_id) REFERENCES order_items(restaurant_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX stock_movements_item_id ON stock_movements(restaurant_id,item_id);
ALTER TABLE payments ADD FOREIGN KEY(restaurant_id,cash_session_id) REFERENCES cash_sessions(restaurant_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX payments_cash_session_id ON payments(restaurant_id,cash_session_id);
ALTER TABLE refunds ADD FOREIGN KEY(restaurant_id,payment_id) REFERENCES payments(restaurant_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX refunds_payment_id ON refunds(restaurant_id,payment_id);
ALTER TABLE refunds ADD FOREIGN KEY(restaurant_id,cash_session_id) REFERENCES cash_sessions(restaurant_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX refunds_cash_session_id ON refunds(restaurant_id,cash_session_id);
ALTER TABLE cash_movements ADD FOREIGN KEY(restaurant_id,cash_session_id) REFERENCES cash_sessions(restaurant_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX cash_movements_cash_session_id ON cash_movements(restaurant_id,cash_session_id);
ALTER TABLE reservations ADD FOREIGN KEY(restaurant_id,visit_id) REFERENCES visits(restaurant_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX reservations_visit_id ON reservations(restaurant_id,visit_id);
ALTER TABLE waitlist ADD FOREIGN KEY(restaurant_id,visit_id) REFERENCES visits(restaurant_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX waitlist_visit_id ON waitlist(restaurant_id,visit_id);
ALTER TABLE service_calls ADD FOREIGN KEY(restaurant_id,visit_id) REFERENCES visits(restaurant_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX service_calls_visit_id ON service_calls(restaurant_id,visit_id);

CREATE UNIQUE INDEX active_occupancy_per_table ON occupancies(restaurant_id,table_id) WHERE (body->>'releasedAt') IS NULL;
CREATE UNIQUE INDEX table_number_per_restaurant ON dining_tables(restaurant_id,((body->>'number')::integer));
ALTER TABLE stock_items ADD CONSTRAINT stock_nonnegative CHECK((body->>'quantityMilli')::bigint >= 0 AND (body->>'reservedMilli')::bigint >= 0);
CREATE TABLE recipe_components (
 restaurant_id text NOT NULL, product_id text NOT NULL, component_key text NOT NULL, stock_item_id text NOT NULL,
 quantity_milli bigint NOT NULL CHECK(quantity_milli <> 0),
 PRIMARY KEY(restaurant_id,product_id,component_key),
 FOREIGN KEY(restaurant_id,product_id) REFERENCES products(restaurant_id,id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(restaurant_id,stock_item_id) REFERENCES stock_items(restaurant_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE item_recipe_components (
 restaurant_id text NOT NULL, item_id text NOT NULL, component_key text NOT NULL, stock_item_id text NOT NULL,
 quantity_milli bigint NOT NULL CHECK(quantity_milli >= 0),
 PRIMARY KEY(restaurant_id,item_id,component_key),
 FOREIGN KEY(restaurant_id,item_id) REFERENCES order_items(restaurant_id,id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(restaurant_id,stock_item_id) REFERENCES stock_items(restaurant_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE payment_allocations (
 restaurant_id text NOT NULL, payment_id text NOT NULL, position integer NOT NULL, tab_id text NOT NULL, item_id text,
 amount_cents bigint NOT NULL CHECK(amount_cents > 0), PRIMARY KEY(restaurant_id,payment_id,position),
 FOREIGN KEY(restaurant_id,payment_id) REFERENCES payments(restaurant_id,id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(restaurant_id,tab_id) REFERENCES tabs(restaurant_id,id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(restaurant_id,item_id) REFERENCES order_items(restaurant_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE refund_allocations (
 restaurant_id text NOT NULL, refund_id text NOT NULL, position integer NOT NULL, tab_id text NOT NULL, item_id text,
 amount_cents bigint NOT NULL CHECK(amount_cents > 0), PRIMARY KEY(restaurant_id,refund_id,position),
 FOREIGN KEY(restaurant_id,refund_id) REFERENCES refunds(restaurant_id,id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(restaurant_id,tab_id) REFERENCES tabs(restaurant_id,id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(restaurant_id,item_id) REFERENCES order_items(restaurant_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE reservation_tables (
 restaurant_id text NOT NULL, reservation_id text NOT NULL, table_id text NOT NULL,
 PRIMARY KEY(restaurant_id,reservation_id,table_id),
 FOREIGN KEY(restaurant_id,reservation_id) REFERENCES reservations(restaurant_id,id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(restaurant_id,table_id) REFERENCES dining_tables(restaurant_id,id) DEFERRABLE INITIALLY DEFERRED
);
