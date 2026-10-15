export interface HubObstacle {minX:number;maxX:number;minZ:number;maxZ:number}
export interface HubPoint {x:number;z:number}
const ROOM_LIMIT=9.15;
/** Resolve axes separately so a standing player slides along furniture. */
export function resolveHubMovement(position:HubPoint,delta:HubPoint,obstacles:readonly HubObstacle[],radius=.29):HubPoint {
  const clamp=(value:number)=>Math.max(-ROOM_LIMIT+radius,Math.min(ROOM_LIMIT-radius,value));
  const blocked=(x:number,z:number)=>obstacles.some(box=>{const nearestX=Math.max(box.minX,Math.min(box.maxX,x)),nearestZ=Math.max(box.minZ,Math.min(box.maxZ,z));return (x-nearestX)**2+(z-nearestZ)**2<radius**2;});
  let x=position.x,z=position.z;
  const steps=Math.max(1,Math.ceil(Math.hypot(delta.x,delta.z)/Math.max(.04,radius*.5)));
  for(let step=0;step<steps;step++){const nextX=clamp(x+delta.x/steps);if(!blocked(nextX,z))x=nextX;const nextZ=clamp(z+delta.z/steps);if(!blocked(x,nextZ))z=nextZ;}
  return {x,z};
}
