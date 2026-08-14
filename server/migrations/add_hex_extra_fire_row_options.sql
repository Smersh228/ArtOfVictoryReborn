-- Расширенные настройки гекса (JSON) и флаги «ближний бой» по строкам огня юнита.
ALTER TABLE hex ADD COLUMN IF NOT EXISTS hex_extra JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE unit_damage ADD COLUMN IF NOT EXISTS fire_row_options JSONB NOT NULL DEFAULT '{}'::jsonb;
