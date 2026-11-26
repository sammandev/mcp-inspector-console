BEGIN;
CREATE TABLE IF NOT EXISTS inspector_account_users (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('admin', 'external')),
  identity text NOT NULL,
  username text NOT NULL,
  email text NOT NULL,
  UNIQUE (kind, identity)
);
CREATE TABLE IF NOT EXISTS inspector_account_sessions (
  id uuid PRIMARY KEY,
  token_hash text UNIQUE NOT NULL,
  user_id uuid NOT NULL REFERENCES inspector_account_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS inspector_account_sessions_expiry ON inspector_account_sessions(expires_at);
CREATE TABLE IF NOT EXISTS inspector_account_records (
  user_id uuid NOT NULL REFERENCES inspector_account_users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('chat', 'provider', 'connections')),
  id text NOT NULL,
  encrypted_value text NOT NULL,
  PRIMARY KEY (user_id, kind, id)
);
CREATE TABLE IF NOT EXISTS inspector_account_otp (
  token_hash text PRIMARY KEY,
  encrypted_value text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0
);
COMMIT;
