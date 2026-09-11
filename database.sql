-- Run once in Neon SQL Editor, or let the app initialize these on first use.
CREATE TABLE IF NOT EXISTS river_rooms (
  code TEXT PRIMARY KEY,
  state JSONB NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS river_rooms_updated ON river_rooms(updated_at);
CREATE TABLE IF NOT EXISTS river_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS river_limits_expiry ON river_limits(expires_at);
