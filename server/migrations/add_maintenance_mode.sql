-- Режим технических работ и белый список логинов.
-- Безопасно повторять.

CREATE TABLE IF NOT EXISTS site_setting (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  maintenance_enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO site_setting (id, maintenance_enabled)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS maintenance_allowlist (
  username TEXT PRIMARY KEY,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS maintenance_allowlist_username_lower_idx
  ON maintenance_allowlist (LOWER(TRIM(username)));
