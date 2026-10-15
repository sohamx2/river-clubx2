export interface PoolPoint {x:number;z:number}

/** A deliberate downward stroke sets power; a click or upward drag never fires. */
export function cuePullFromDrag(startY:number,currentY:number,height:number):number {
  return Math.max(0,Math.min(1,(currentY-startY)/Math.max(100,Math.min(220,height*.25))));
}

/** Keep the eye behind the cue at a leaning player's height, along the shot line. */
export function poolFirstPersonView(ball:PoolPoint,aim:PoolPoint) {
  const length=Math.hypot(aim.x,aim.z)||1,dx=aim.x/length,dz=aim.z/length;
  return {eye:{x:ball.x-dx*1.55,y:1.65,z:ball.z-dz*1.55},target:{x:ball.x+dx*.75,y:1.09,z:ball.z+dz*.75}};
}
