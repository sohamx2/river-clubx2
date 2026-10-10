import type { RoomView } from './types';
/** Include chips already in the pot so the default remains stable during a hand. */
export function defaultSideGameAmount(room:Pick<RoomView,'players'|'phase'>):number {
 const inPlay=room.phase!=='waiting'&&room.phase!=='showdown';
 return Math.max(1,Math.floor(room.players.reduce((sum,p)=>sum+p.stack+(inPlay?p.contributed:0),0)/100));
}
