ALTER TABLE products ADD COLUMN license_type text;
ALTER TABLE products ADD COLUMN license_terms_template text;

CREATE TABLE seat_username_invites (
  id uuid PRIMARY KEY,
  license_id uuid NOT NULL REFERENCES licenses(id),
  login text NOT NULL,
  requested_by uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'pending',
  error_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX seat_username_invites_license_idx ON seat_username_invites (license_id);
