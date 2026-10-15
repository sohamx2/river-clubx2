import {resolveHubMovement,type HubObstacle,type HubPoint} from './hub-controls';
/** One fixed coordinate system for seated players, walking players, and the lounge. */
export function clubSeat(seat:number,count:number){const angle=seat/count*Math.PI*2,x=-4.05*Math.sin(angle),z=2.8*Math.cos(angle);return{x,z,facing:Math.atan2(-x,-z)};}
export function clubSeatApproach(seat:number,count:number){const p=clubSeat(seat,count);return{x:p.x-Math.sin(p.facing)*.95,z:p.z-Math.cos(p.facing)*.95};}
export function canUseClubSeat(position:HubPoint,seat:number,count:number){const p=clubSeatApproach(seat,count);return Math.hypot(position.x-p.x,position.z-p.z)<1.45;}
export function resolveClubWalk(position:HubPoint,delta:HubPoint,obstacles:readonly HubObstacle[]){
  // Sample the felt as a set of narrow boxes. This leaves the aisle around an oval open.
  const table:HubObstacle[]=Array.from({length:48},(_,i)=>{const x=-3.82+i*7.64/48,next=x+7.64/48,z=2.59*Math.sqrt(Math.max(0,1-(Math.min(Math.abs(x),Math.abs(next))/3.82)**2));return{minX:x,maxX:next,minZ:-z,maxZ:z};});
  return resolveHubMovement(position,delta,[...table,...obstacles]);
}
/** Match the avatar's +Z face to the camera's -Z gaze in fixed room coordinates. */
export function clubHeadYaw(cameraYaw:number,seatFacing:number){const angle=cameraYaw+Math.PI-seatFacing;return Math.atan2(Math.sin(angle),Math.cos(angle));}
