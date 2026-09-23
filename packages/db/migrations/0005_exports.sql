CREATE TABLE exports (
  id uuid PRIMARY KEY,
  seller_id uuid NOT NULL REFERENCES sellers(id),
  requested_by uuid NOT NULL REFERENCES users(id),
  format text NOT NULL CHECK (format IN ('json', 'csv')),
  status text NOT NULL CHECK (status IN ('queued', 'ready', 'failed')),
  storage_key text,
  expires_at timestamptz,
  error_code text,
  created_at timestamptz NOT NULL
);
CREATE INDEX exports_seller_id_created_at_idx ON exports (seller_id, created_at DESC);

