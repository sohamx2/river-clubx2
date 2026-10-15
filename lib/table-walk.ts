import type {HubPoint,HubObstacle} from './hub-controls';

/** Small steps prevent walking through the oval table or another player's chair. */
export function resolveTableWalk(position:HubPoint,delta:HubPoint,tableScale=1,chairs:readonly HubObstacle[]=[]):HubPoint {
  const radius=.25,rx=3.83*tableScale+radius,rz=2.61+radius;
  const blocked=(x:number,z:number)=>x*x/(rx*rx)+z*z/(rz*rz)<1||chairs.some(box=>x>box.minX-radius&&x<box.maxX+radius&&z>box.minZ-radius&&z<box.maxZ+radius);
  const steps=Math.max(1,Math.ceil(Math.hypot(delta.x,delta.z)/.1));let {x,z}=position;
  for(let i=0;i<steps;i++){
    const nx=Math.max(-8.8,Math.min(8.8,x+delta.x/steps));if(!blocked(nx,z))x=nx;
    const nz=Math.max(-6.1,Math.min(7.5,z+delta.z/steps));if(!blocked(x,nz))z=nz;
  }
  return{x,z};
}
