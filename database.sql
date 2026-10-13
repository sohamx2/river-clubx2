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
CREATE TABLE IF NOT EXISTS river_presence (
  code TEXT NOT NULL,
  player_id TEXT NOT NULL,
  state JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (code,player_id)
);
CREATE INDEX IF NOT EXISTS river_presence_updated ON river_presence(updated_at);
CREATE TABLE IF NOT EXISTS river_signals (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  sender TEXT NOT NULL,
  recipient TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS river_signals_recipient ON river_signals(code,recipient,created_at);
