-- Расширения схемы под текущий редактор каталога (юниты, гексы, свойства).
-- Безопасно повторять: IF NOT EXISTS / проверки перед INSERT.

-- Запас взрывчатки и дымовых снарядов у юнита
ALTER TABLE unit ADD COLUMN IF NOT EXISTS explosives INTEGER NOT NULL DEFAULT 0;
ALTER TABLE unit ADD COLUMN IF NOT EXISTS smoke_shells INTEGER NOT NULL DEFAULT 0;

-- Режим вкладки «Интенсивность огня» в редакторе (all | reactive)
ALTER TABLE unit ADD COLUMN IF NOT EXISTS editor_fire_intensity_tab TEXT NOT NULL DEFAULT 'all';

-- JSON с доп. полями гекса (размещение, высота и т.п.)
ALTER TABLE hex ADD COLUMN IF NOT EXISTS hex_extra JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Флаги «ближний бой» по строкам таблицы огня (JSON), см. редактор юнита
ALTER TABLE unit_damage ADD COLUMN IF NOT EXISTS fire_row_options JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Вторая таблица огня (реактивная артиллерия)
ALTER TABLE unit_damage ADD COLUMN IF NOT EXISTS fire_reactive JSONB DEFAULT NULL;
ALTER TABLE unit_damage ADD COLUMN IF NOT EXISTS fire_row_options_reactive JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Дальность/меткость для приказа «Авиационная разведка»
ALTER TABLE unit_damage ADD COLUMN IF NOT EXISTS intelligence_air_range TEXT NOT NULL DEFAULT '1,2,3';

-- «Разведка» и «Радиоперехват»
ALTER TABLE unit_damage ADD COLUMN IF NOT EXISTS razvedka_range TEXT NOT NULL DEFAULT '1,2,3';
ALTER TABLE unit_damage ADD COLUMN IF NOT EXISTS svzy_range TEXT NOT NULL DEFAULT '1,2,3';

-- Свойства юнита: зона действия штаба (если ещё нет в таблице property)
INSERT INTO property (name, prop_key)
SELECT 'Зона действия штаба — 2', 'hqZoneOfAction2'
WHERE NOT EXISTS (
  SELECT 1 FROM property p WHERE TRIM(p.prop_key) = 'hqZoneOfAction2'
);

INSERT INTO property (name, prop_key)
SELECT 'Зона действия штаба — 3', 'hqZoneOfAction3'
WHERE NOT EXISTS (
  SELECT 1 FROM property p WHERE TRIM(p.prop_key) = 'hqZoneOfAction3'
);
