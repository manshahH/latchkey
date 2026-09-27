CREATE TABLE artifact_versions (
  id uuid PRIMARY KEY,
  deliverable_id uuid NOT NULL REFERENCES deliverables(id),
  version text NOT NULL,
  released_at timestamptz NOT NULL,
  s3_key text NOT NULL,
  sha256 text NOT NULL,
  UNIQUE (deliverable_id, version)
);

CREATE TABLE api_tokens (
  id uuid PRIMARY KEY,
  license_id uuid NOT NULL REFERENCES licenses(id),
  seat_id uuid NOT NULL REFERENCES seats(id),
  token_hash text NOT NULL UNIQUE,
  prefix text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX api_tokens_seat_idx ON api_tokens (seat_id);
CREATE INDEX artifact_versions_deliverable_released_idx ON artifact_versions (deliverable_id, released_at);
