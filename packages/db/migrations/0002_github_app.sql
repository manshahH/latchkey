ALTER TABLE github_installations ADD COLUMN account_id bigint;
ALTER TABLE github_installations ADD COLUMN permissions jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE github_installations ADD COLUMN installed_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE github_installations ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX github_installations_seller_account_idx ON github_installations (seller_id, account_login);

CREATE TABLE github_webhook_deliveries (
  id uuid PRIMARY KEY,
  delivery_id text NOT NULL UNIQUE,
  event text NOT NULL,
  action text,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL,
  processed_at timestamptz,
  process_error text
);

CREATE TABLE github_invite_attempts (
  id uuid PRIMARY KEY,
  installation_id bigint NOT NULL REFERENCES github_installations(installation_id),
  grant_id uuid NOT NULL REFERENCES grants(id),
  sent_at timestamptz NOT NULL
);
CREATE INDEX github_invite_attempts_installation_sent_idx ON github_invite_attempts (installation_id, sent_at);
CREATE INDEX github_webhook_deliveries_unprocessed_idx ON github_webhook_deliveries (processed_at) WHERE processed_at IS NULL;