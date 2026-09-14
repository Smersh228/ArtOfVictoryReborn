ALTER TABLE unit
  ADD COLUMN IF NOT EXISTS heavy_tech BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE unit
  ADD COLUMN IF NOT EXISTS heavy_artillery BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN unit.heavy_tech IS 'Техника/бронетехника: true = тяжёлая (буксирует тяжёлую и лёгкую артиллерию)';
COMMENT ON COLUMN unit.heavy_artillery IS 'Артиллерия: true = тяжёлая (буксирует только тяжёлая техника)';
