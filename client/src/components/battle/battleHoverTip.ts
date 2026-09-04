import type { DotHoverTip } from '../../game/cellDot';
import type { Cell } from '../../../../server/src/game/gameLogic/cells/cell';
import { structureInspectOf, structureKindLabel } from '../../game/cellStructureHp';

export type BattleHoverTipView = {
  title: string;
  rows: { key: string; val: string }[];
};

export function hoverTipFromDot(tip: DotHoverTip): BattleHoverTipView {
  const rows = [
    { key: 'Защита', val: String(tip.defense) },
    { key: 'Боезапас', val: String(tip.ammo) },
    { key: 'Статус', val: tip.statusLabel },
  ];
  if (tip.occupantLabel) rows.push({ key: 'Гарнизон', val: tip.occupantLabel });
  return { title: tip.title, rows };
}

export function hoverTipFromStructure(cell: Cell): BattleHoverTipView | null {
  const info = structureInspectOf(cell);
  if (!info) return null;
  const rows: { key: string; val: string }[] = [
    {
      key: 'Численность',
      val: info.destroyed ? 'разрушено' : `${info.str} / ${info.maxStr}`,
    },
    {
      key: 'Защита',
      val: info.destroyed ? '—' : `${info.def} / ${info.maxDef}`,
    },
  ];
  if (!info.destroyed) {
    if (info.defBonusInf) rows.push({ key: 'Бонус защиты (пехота)', val: `+${info.defBonusInf}` });
    if (info.defBonusTech) rows.push({ key: 'Бонус защиты (техника)', val: `+${info.defBonusTech}` });
    for (const row of info.defBonusByType) {
      if (row.id === 'infantry' && info.defBonusInf === row.value) continue;
      if ((row.id === 'tech' || row.id === 'armor') && info.defBonusTech === row.value) continue;
      rows.push({ key: `Бонус защиты (${row.label.toLowerCase()})`, val: `+${row.value}` });
    }
    for (const row of info.accuracyBonusByType) {
      rows.push({ key: `Бонус меткости (${row.label.toLowerCase()})`, val: `+${row.value}` });
    }
  }
  const title = info.destroyed ? `${structureKindLabel(info.kind)} (разрушено)` : structureKindLabel(info.kind);
  return { title, rows };
}
