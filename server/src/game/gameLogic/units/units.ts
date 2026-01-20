import { Cell } from "../cells/cell";
import { teamName } from "../enumTypeGame/teamName";

interface IAmmunition {
ammo:number;
mine?:number;
explosive?:number;
}

interface ICoor {
x:number;
y:number;
z:number;
}

interface IFire {
range:number[];
infantry:number[];
cannon:number[];
techinc:number[];
armorTechinc:number[];
lightTank:number[];
middleTank:number[];
heavyTank:number[];
smallAir:number[];
bigAir:number[];
build:number[];
}

interface ISideRearFlanks {
side:Cell;
rear:Cell;
flanks:Cell[];
}

interface IOrder {
order:string;
orderCount:number
}

export class Units {
id:number;
type:string;
name:string;
order:IOrder;
defend:number;
baseDefend:number;
strength:number;
ammunition:IAmmunition;
fireActions:IFire;
defendSector:Cell[];
img:string;
coor: ICoor;
visibleRange:number;
movePoint:number;
team:teamName;
trajectoryMove:Cell[];
sideRearFlanks:ISideRearFlanks;
morale:number;
fireSup:boolean;

constructor(id:number,type:string,name:string,order:IOrder,
           defend:number,baseDefend:number,strength:number,
           ammunition:IAmmunition,fireActions:IFire,defendSector:Cell[],
           img:string,coor:ICoor,visibleRange:number,movePoint:number,
           team:teamName,trajectoryMove:Cell[],sideRearFlanks:ISideRearFlanks,
           morale:number,fireSup:boolean
 ) {
this.id = id;
this.type = type;
this.name = name;
this.img = img;
this.order = order;
this.defend = defend;
this.baseDefend = baseDefend;
this.strength = strength;
this.ammunition = ammunition;
this.fireActions = fireActions;
this.defendSector = defendSector;
this.coor = coor;
this.visibleRange = visibleRange;
this.movePoint = movePoint;
this.team = team;
this.trajectoryMove = trajectoryMove;
this.sideRearFlanks = sideRearFlanks;
this.morale = morale;
this.fireSup = fireSup;

}
}