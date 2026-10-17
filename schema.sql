CREATE TABLE IF NOT EXISTS families (id uuid PRIMARY KEY, name text NOT NULL, feed_token text UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS members (
  id uuid PRIMARY KEY, family_id uuid NOT NULL REFERENCES families(id), name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('adult','child')), email text UNIQUE, password_hash text,
  color text NOT NULL DEFAULT '#487968', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (token_hash text PRIMARY KEY, member_id uuid NOT NULL REFERENCES members(id), expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY, family_id uuid NOT NULL REFERENCES families(id), data jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1, deleted boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mail_jobs (
  id text PRIMARY KEY, family_id uuid NOT NULL REFERENCES families(id), event_id uuid REFERENCES events(id),
  event_version integer, recipient text NOT NULL, subject text NOT NULL, body text NOT NULL,
  due_at timestamptz NOT NULL, status text NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0,
  next_attempt timestamptz NOT NULL DEFAULT now(), sent_at timestamptz, last_error text
);
CREATE INDEX IF NOT EXISTS jobs_due ON mail_jobs(status,due_at,next_attempt);
-- Additive, repeatable migration: existing member/event IDs and sessions stay intact.
ALTER TABLE members ALTER COLUMN family_id DROP NOT NULL;
ALTER TABLE families ADD COLUMN IF NOT EXISTS join_code text;
CREATE UNIQUE INDEX IF NOT EXISTS families_join_code ON families(join_code);
CREATE TABLE IF NOT EXISTS join_requests (
  member_id uuid PRIMARY KEY REFERENCES members(id),
  family_id uuid NOT NULL REFERENCES families(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE mail_jobs ADD COLUMN IF NOT EXISTS html text;
CREATE TABLE IF NOT EXISTS todos (
  id uuid PRIMARY KEY, family_id uuid NOT NULL REFERENCES families(id), data jsonb NOT NULL,
  completed_at timestamptz, completed_by uuid REFERENCES members(id),
  version integer NOT NULL DEFAULT 1, deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS todos_family ON todos(family_id) WHERE deleted=false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS import_key text;
CREATE UNIQUE INDEX IF NOT EXISTS events_import_identity ON events(family_id,import_key);
