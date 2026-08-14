-- Дальность / меткость по клеткам для приказа «Авиационная разведка» (как fire_range, отдельное поле).
ALTER TABLE unit_damage ADD COLUMN IF NOT EXISTS intelligence_air_range TEXT NOT NULL DEFAULT '1,2,3';
