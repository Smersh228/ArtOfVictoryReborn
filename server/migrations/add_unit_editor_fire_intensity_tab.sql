-- Последний выбранный режим интенсивности огня в редакторе каталога: all | reactive
ALTER TABLE unit ADD COLUMN IF NOT EXISTS editor_fire_intensity_tab TEXT NOT NULL DEFAULT 'all';
