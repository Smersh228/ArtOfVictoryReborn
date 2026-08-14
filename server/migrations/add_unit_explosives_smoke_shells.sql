-- Запас взрывчатки и дымовых снарядов для юнита (редактор каталога).
ALTER TABLE unit ADD COLUMN IF NOT EXISTS explosives INTEGER NOT NULL DEFAULT 0;
ALTER TABLE unit ADD COLUMN IF NOT EXISTS smoke_shells INTEGER NOT NULL DEFAULT 0;
