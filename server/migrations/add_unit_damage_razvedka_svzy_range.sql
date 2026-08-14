-- Дальность/меткость для приказов «Разведка» и «Радиоперехват» (как intelligence_air_range).
ALTER TABLE unit_damage ADD COLUMN IF NOT EXISTS razvedka_range TEXT NOT NULL DEFAULT '1,2,3';
ALTER TABLE unit_damage ADD COLUMN IF NOT EXISTS svzy_range TEXT NOT NULL DEFAULT '1,2,3';
