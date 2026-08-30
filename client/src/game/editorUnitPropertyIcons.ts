import tankPhobiaImg from '../img/propertis/tankPhobia.png';
import sectorFireImg from '../img/propertis/sectorFire.png';
import concealedTargetFireImg from '../img/propertis/fireAtAClosed Target.png';
import areaShootingImg from '../img/propertis/areaShooting.png';
import attackMoralImg from '../img/propertis/attackMoral.png';
import breakingThroughBarbedWireImg from '../img/propertis/breakingThroughBarbedWire.png';
import crossingAWaterObstacleImg from '../img/propertis/crossingAWaterObstacle.png';
import desantImg from '../img/propertis/desant.png';
import fireAdjustmentImg from '../img/propertis/fireAdjustment.png';
import hiddenStateImg from '../img/propertis/hiddenState.png';
import mineDetectionImg from '../img/propertis/mineDetection.png';
import sniperImg from '../img/propertis/sniper.png';
import railwayDetachmentImg from '../img/orderUnits/poezd.png';

/** Имя файла с кириллической «С»: aviationСhallenge.png */
const aviationChallengeImg = new URL('../img/propertis/aviation\u0421hallenge.png', import.meta.url).href;
const destructionOfBarbedWireImg = new URL('../img/propertis/destructionOf barbedWire.png', import.meta.url).href;
const movementThroughTheSwampImg = new URL('../img/propertis/movement ThroughThe Swamp.png', import.meta.url).href;
const raisingMoraleImg = new URL('../img/propertis/raising morale.png', import.meta.url).href;

export type EditorUnitPropertyDef = {
  prop_key: string;
  name: string;
  icon: string | null;
};

/** Справочник свойств юнита в редакторе каталога (подписи + иконки в UI). */
export const EDITOR_UNIT_PROPERTY_DEFS: EditorUnitPropertyDef[] = [
  { prop_key: 'tankPhobia', name: 'Танкобоязнь', icon: tankPhobiaImg },
  { prop_key: 'fireSector', name: 'Сектор обстрела', icon: sectorFireImg },
  { prop_key: 'fireAirGun', name: 'Огонь по воздушным целям', icon: new URL('../img/propertis/fireAirGun.png', import.meta.url).href },
  { prop_key: 'concealedTargetFire', name: 'Стрельба по закрытым целям', icon: concealedTargetFireImg },
  { prop_key: 'areaFire', name: 'Стрельба по площади', icon: areaShootingImg },
  { prop_key: 'attackMoral', name: 'Атака огнемётного танка', icon: attackMoralImg },
  { prop_key: 'aviationChallenge', name: 'Вызов авиации', icon: aviationChallengeImg },
  { prop_key: 'breakingThroughBarbedWire', name: 'Прорыв колючей проволоки', icon: breakingThroughBarbedWireImg },
  { prop_key: 'crossingAWaterObstacle', name: 'Преодоление водной преграды', icon: crossingAWaterObstacleImg },
  { prop_key: 'desant', name: 'Десант', icon: desantImg },
  { prop_key: 'destructionOfBarbedWire', name: 'Подрыв колючего заграждения', icon: destructionOfBarbedWireImg },
  { prop_key: 'fireAdjustment', name: 'Корректировка огня', icon: fireAdjustmentImg },
  { prop_key: 'hiddenState', name: 'Скрытый отряд', icon: hiddenStateImg },
  { prop_key: 'mineDetection', name: 'Обнаружение мин', icon: mineDetectionImg },
  { prop_key: 'movementThroughTheSwamp', name: 'Преодоление болота', icon: movementThroughTheSwampImg },
  { prop_key: 'raisingMorale', name: 'Поднятие боевого духа', icon: raisingMoraleImg },
  { prop_key: 'sniper', name: 'Снайпер', icon: sniperImg },
  { prop_key: 'hqZoneOfAction2', name: 'Зона действия штаба — 2', icon: null },
  { prop_key: 'hqZoneOfAction3', name: 'Зона действия штаба — 3', icon: null },
  { prop_key: 'mountainTroops', name: 'Горные части', icon: null },
  { prop_key: 'railwayDetachment', name: 'Железнодорожный отряд', icon: railwayDetachmentImg },
];
