import fireOrderImg from '../img/orderUnits/ordinaryOrders/fireOrders/fire.png';
import fireHardOrderImg from '../img/orderUnits/ordinaryOrders/fireOrders/fireHard.png';
import moveOrderImg from '../img/orderUnits/ordinaryOrders/moveOrders/move.png';
import moveWarOrderImg from '../img/orderUnits/ordinaryOrders/moveOrders/moveWar.png';
import attackOrderImg from '../img/orderUnits/ordinaryOrders/moveOrders/attack.png';
import hardMoveOrderImg from '../img/orderUnits/ordinaryOrders/moveOrders/hardMove.png';
import defenseOrderImg from '../img/orderUnits/ordinaryOrders/defenseOrders/defense.png';
import ambushOrderImg from '../img/orderUnits/ordinaryOrders/defenseOrders/ambush.png';
import loadingOrderImg from '../img/orderUnits/ordinaryOrders/trunksOrders/loading.png';
import trailerOrderImg from '../img/orderUnits/ordinaryOrders/trunksOrders/trailer.png';
import landingOrderImg from '../img/orderUnits/ordinaryOrders/trunksOrders/landing.png';
import getSupOrderImg from '../img/orderUnits/ordinaryOrders/trunksOrders/getSup.png';
import loadSupOrderImg from '../img/orderUnits/ordinaryOrders/trunksOrders/LoadSup.png';
import accompanimentOrderImg from '../img/orderUnits/airOrders/accompaniment.png';
import airSupplyOrderImg from '../img/orderUnits/airOrders/airSupply.png';
import attackAirOrderImg from '../img/orderUnits/airOrders/attackAir.png';
import bombardmentOrderImg from '../img/orderUnits/airOrders/bombardment.png';
import desantOrderImg from '../img/orderUnits/airOrders/desant.png';
import intelligenceAirOrderImg from '../img/orderUnits/airOrders/intelligenceAir.png';
import interceptionOrderImg from '../img/orderUnits/airOrders/interception.png';
import patrolOrderImg from '../img/orderUnits/airOrders/patrol.png';
import clottingOrderImg from '../img/orderUnits/ordinaryOrders/clotting.png';
import deployOrderImg from '../img/orderUnits/ordinaryOrders/deploy.png';
import changeSectorOrderImg from '../img/orderUnits/ordinaryOrders/changeSector.png';
import explomostOrderImg from '../img/orderUnits/specialOrders/explomost.png';
import fireMoveOrderImg from '../img/orderUnits/specialOrders/fireMove.png';
import razvedkaOrderImg from '../img/orderUnits/specialOrders/razvedka.png';
import svzyOrderImg from '../img/orderUnits/specialOrders/svzy.png';
import buildPontonOrderImg from '../img/orderUnits/specialOrders/saperOrders/buildPonton.png';
import cutEjOrderImg from '../img/orderUnits/specialOrders/saperOrders/cutEj.png';
import cutWireOrderImg from '../img/orderUnits/specialOrders/saperOrders/cutWire.png';
import deminingOrderImg from '../img/orderUnits/specialOrders/saperOrders/demining.png';
import miningOrderImg from '../img/orderUnits/specialOrders/saperOrders/mining.png';
import trenchesOrderImg from '../img/orderUnits/specialOrders/saperOrders/trenches.png';


/** Группа приказов в редакторе юнита (фильтр и сворачиваемые списки). */
export type EditorBattleOrderCategory = 'ordinary' | 'special' | 'sapper' | 'aviation';

export type EditorBattleOrderDef = {
  order_key: string;
  name: string;
  icon: string | null;
  editorCategory: EditorBattleOrderCategory;
};

export const EDITOR_BATTLE_ORDER_GROUP_LABELS: Record<EditorBattleOrderCategory, string> = {
  ordinary: 'Обычные приказы',
  special: 'Спецприказы',
  sapper: 'Сапёрные приказы',
  aviation: 'Приказы авиации',
};

export const EDITOR_BATTLE_ORDER_GROUP_ORDER: readonly EditorBattleOrderCategory[] = [
  'ordinary',
  'special',
  'sapper',
  'aviation',
] as const;

export const EDITOR_BATTLE_ORDER_DEFS: EditorBattleOrderDef[] = [
  { order_key: 'fire', name: 'Огонь', icon: fireOrderImg, editorCategory: 'ordinary' },
  { order_key: 'fireHard', name: 'Огонь на подавление', icon: fireHardOrderImg, editorCategory: 'ordinary' },
  { order_key: 'move', name: 'Походное движение', icon: moveOrderImg, editorCategory: 'ordinary' },
  { order_key: 'moveWar', name: 'Боевое движение', icon: moveWarOrderImg, editorCategory: 'ordinary' },
  { order_key: 'attack', name: 'Атака', icon: attackOrderImg, editorCategory: 'ordinary' },
  { order_key: 'hardMove', name: 'Мощная атака', icon: hardMoveOrderImg, editorCategory: 'ordinary' },
  { order_key: 'defend', name: 'Оборона', icon: defenseOrderImg, editorCategory: 'ordinary' },
  { order_key: 'ambush', name: 'Засада', icon: ambushOrderImg, editorCategory: 'ordinary' },
  { order_key: 'loading', name: 'Погрузка', icon: loadingOrderImg, editorCategory: 'special' },
  { order_key: 'tow', name: 'Буксир', icon: trailerOrderImg, editorCategory: 'special' },
  { order_key: 'clotting', name: 'Свёртывание', icon: clottingOrderImg, editorCategory: 'special' },
  { order_key: 'deploy', name: 'Развёртывание', icon: deployOrderImg, editorCategory: 'special' },
  { order_key: 'changeSector', name: 'Смена сектора', icon: changeSectorOrderImg, editorCategory: 'special' },
  { order_key: 'unloading', name: 'Выгрузка', icon: landingOrderImg, editorCategory: 'special' },
  { order_key: 'getSup', name: 'Загрузка припасов', icon: getSupOrderImg, editorCategory: 'special' },
  { order_key: 'loadingSup', name: 'Загрузка припасов со склада', icon: loadSupOrderImg, editorCategory: 'special' },
  { order_key: 'explomost', name: 'Подрыв сооружения', icon: explomostOrderImg, editorCategory: 'special' },
  { order_key: 'fireMove', name: 'Стрельба в движение', icon: fireMoveOrderImg, editorCategory: 'special' },
  { order_key: 'razvedka', name: 'Разведка', icon: razvedkaOrderImg, editorCategory: 'special' },
  { order_key: 'svzy', name: 'Радиоперехват', icon: svzyOrderImg, editorCategory: 'special' },
  { order_key: 'buildPonton', name: 'Строительство понтонного моста', icon: buildPontonOrderImg, editorCategory: 'sapper' },
  { order_key: 'cutEj', name: 'Снятие танкового ежа', icon: cutEjOrderImg, editorCategory: 'sapper' },
  { order_key: 'cutWire', name: 'Снятие колючей проволоки', icon: cutWireOrderImg, editorCategory: 'sapper' },
  { order_key: 'demining', name: 'Разминирование', icon: deminingOrderImg, editorCategory: 'sapper' },
  { order_key: 'mining', name: 'Минирование', icon: miningOrderImg, editorCategory: 'sapper' },
  { order_key: 'trenches', name: 'Окопаться', icon: trenchesOrderImg, editorCategory: 'sapper' },
  { order_key: 'enterDot', name: 'Занять ДОТ', icon: deployOrderImg, editorCategory: 'special' },
  { order_key: 'exitDot', name: 'Покинуть ДОТ', icon: landingOrderImg, editorCategory: 'special' },
  { order_key: 'accompaniment', name: 'Сопровождение дружественной авиации', icon: accompanimentOrderImg, editorCategory: 'aviation' },
  { order_key: 'airSupply', name: 'Сброс припасов', icon: airSupplyOrderImg, editorCategory: 'aviation' },
  { order_key: 'attackAir', name: 'Штурмовка', icon: attackAirOrderImg, editorCategory: 'aviation' },
  { order_key: 'bombardment', name: 'Бомбардировка', icon: bombardmentOrderImg, editorCategory: 'aviation' },
  { order_key: 'desant', name: 'Десант', icon: desantOrderImg, editorCategory: 'aviation' },
  { order_key: 'intelligenceAir', name: 'Авиационная разведка', icon: intelligenceAirOrderImg, editorCategory: 'aviation' },
  { order_key: 'interception', name: 'Перехват', icon: interceptionOrderImg, editorCategory: 'aviation' },
  { order_key: 'patrol', name: 'Патрулирование', icon: patrolOrderImg, editorCategory: 'aviation' },
];

const ICON_BY_KEY: Record<string, string> = Object.fromEntries(
  EDITOR_BATTLE_ORDER_DEFS.filter((d) => d.icon != null).map((d) => [d.order_key, d.icon!]),
);


export function getBattleOrderIconUrl(orderKey: string | null | undefined): string | null {
  if (!orderKey) return null;
  return ICON_BY_KEY[orderKey] ?? null;
}

export function battleOrderLabelForKey(orderKey: string | null | undefined): string {
  const k = String(orderKey ?? '').trim();
  if (!k) return '';
  const def = EDITOR_BATTLE_ORDER_DEFS.find((d) => d.order_key === k);
  return def?.name ?? k;
}
