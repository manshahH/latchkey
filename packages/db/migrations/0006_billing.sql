CREATE TABLE seller_plan_usage (
  seller_id uuid PRIMARY KEY REFERENCES sellers(id),
  active_buyer_count integer NOT NULL DEFAULT 0 CHECK (active_buyer_count >= 0),
  over_limit_since timestamptz,
  calculated_at timestamptz NOT NULL
);
CREATE TABLE platform_billing_subscriptions (
  seller_id uuid PRIMARY KEY REFERENCES sellers(id),
  provider text NOT NULL CHECK (provider = 'paddle'),
  external_subscription_id text NOT NULL UNIQUE,
  plan text NOT NULL CHECK (plan IN ('starter', 'pro', 'scale')),
  status text NOT NULL CHECK (status IN ('active', 'past_due', 'canceled', 'paused')),
  current_period_ends_at timestamptz,
  updated_at timestamptz NOT NULL
);
CREATE TABLE platform_billing_events (
  provider text NOT NULL CHECK (provider = 'paddle'),
  external_event_id text NOT NULL,
  received_at timestamptz NOT NULL,
  PRIMARY KEY (provider, external_event_id)
);