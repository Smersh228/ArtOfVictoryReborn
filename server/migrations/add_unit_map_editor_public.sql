-- Юнит, гекс и правило доступны в общем каталоге редактора карт.
-- Безопасно повторять.

ALTER TABLE unit ADD COLUMN IF NOT EXISTS map_editor_public BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE hex ADD COLUMN IF NOT EXISTS map_editor_public BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE rule ADD COLUMN IF NOT EXISTS map_editor_public BOOLEAN NOT NULL DEFAULT true;
