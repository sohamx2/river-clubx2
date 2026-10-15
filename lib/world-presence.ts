/** Body coordinates are shared in room space, independent of the viewer's seat. */
export interface BodyPose {area:'table'|'bar';x:number;z:number;yaw:number;seated:boolean;moving:boolean}
export function parseBodyPose(value:unknown):BodyPose|null {
  if(!value||typeof value!=='object')return null;
  const p=value as Record<string,unknown>;
  if(!['table','bar'].includes(p.area as string)||typeof p.x!=='number'||typeof p.z!=='number'||typeof p.yaw!=='number'||![p.x,p.z,p.yaw].every(Number.isFinite)||Math.abs(p.x)>15||Math.abs(p.z)>15||Math.abs(p.yaw)>Math.PI*4||typeof p.seated!=='boolean'||typeof p.moving!=='boolean')return null;
  return {area:p.area as BodyPose['area'],x:p.x,z:p.z,yaw:p.yaw,seated:p.seated,moving:p.moving};
}
export function rotateRoomPoint(point:{x:number;z:number},angle:number){return{x:point.x*Math.cos(angle)+point.z*Math.sin(angle),z:-point.x*Math.sin(angle)+point.z*Math.cos(angle)};}
const TABLE_ASPECT=4.05/2.8;
function transformTableBody(body:BodyPose,angle:number):BodyPose {
  const point=rotateRoomPoint({x:body.x/TABLE_ASPECT,z:body.z},angle);
  const direction=rotateRoomPoint({x:-Math.sin(body.yaw)/TABLE_ASPECT,z:-Math.cos(body.yaw)},angle);
  return{...body,x:point.x*TABLE_ASPECT,z:point.z,yaw:Math.atan2(-direction.x*TABLE_ASPECT,-direction.z)};
}
export function toRoomBody(local:BodyPose,seat:number,count:number):BodyPose {return transformTableBody(local,-seat/count*Math.PI*2);}
export function fromRoomBody(shared:BodyPose,seat:number,count:number):BodyPose {return transformTableBody(shared,seat/count*Math.PI*2);}
export function bodyChanged(a?:BodyPose,b?:BodyPose){return a?.area!==b?.area||a?.seated!==b?.seated||a?.moving!==b?.moving||Math.abs((a?.x||0)-(b?.x||0))+Math.abs((a?.z||0)-(b?.z||0))>.025||Math.abs((a?.yaw||0)-(b?.yaw||0))>.025;}
