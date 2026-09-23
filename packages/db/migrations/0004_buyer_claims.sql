ALTER TABLE claims ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE claims ADD COLUMN last_sent_at timestamptz;
ALTER TABLE sessions ADD COLUMN csrf_token_hash text;

CREATE TABLE auth_states (
  state_hash text PRIMARY KEY,
  return_to text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_states_expires_idx ON auth_states (expires_at);
CREATE INDEX claims_license_expires_idx ON claims (license_id, expires_at);

