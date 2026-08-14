-- Вторая таблица огня: реактивная артиллерия (редактор + JSON в БД).
ALTER TABLE unit_damage ADD COLUMN IF NOT EXISTS fire_reactive JSONB DEFAULT NULL;
ALTER TABLE unit_damage ADD COLUMN IF NOT EXISTS fire_row_options_reactive JSONB NOT NULL DEFAULT '{}'::jsonb;
