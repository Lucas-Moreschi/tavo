CREATE TABLE uploaded_files (
  name text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants(id),
  owner_id text NOT NULL REFERENCES "user"(id),
  content_type text NOT NULL CHECK(content_type IN ('image/png','image/jpeg','image/webp')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX uploaded_files_restaurant_idx ON uploaded_files(restaurant_id);
