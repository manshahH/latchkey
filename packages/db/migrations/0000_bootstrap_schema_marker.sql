CREATE TABLE latchkey_schema_marker (
  id boolean PRIMARY KEY DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (id)
);
