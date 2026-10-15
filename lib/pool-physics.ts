/** Deterministic billiards: equal-mass sphere impulses on a fixed 240 Hz clock. */
export interface PoolBall {
  id:number; x:number; z:number; vx:number; vz:number; pocketed:boolean;
}
export interface PoolConfig {
  halfWidth:number; halfDepth:number; ballRadius:number; pocketRadius:number;
  rollingFriction:number; ballRestitution:number; cushionRestitution:number;
}
export interface PoolGame {
  balls:PoolBall[]; config:PoolConfig; accumulator:number; shots:number;
  scratched:boolean; scratchPending:boolean;
}
export const POOL_STEP=1/240;
export const POOL_CONFIG:Readonly<PoolConfig>={
  halfWidth:1.44,halfDepth:.72,ballRadius:.0525,pocketRadius:.115,
  rollingFriction:.34,ballRestitution:.98,cushionRestitution:.82,
};
export function createPoolGame(config:Partial<PoolConfig>={}):PoolGame {
  const settings={...POOL_CONFIG,...config};
  const balls:PoolBall[]=[{id:0,x:-.76,z:0,vx:0,vz:0,pocketed:false}];
  const order=[1,9,2,3,8,10,11,4,12,5,6,13,7,14,15];
  const spacing=settings.ballRadius*2+.001;
  let i=0;
  for(let row=0;row<5;row++)for(let col=0;col<=row;col++)balls.push({
    id:order[i++],x:.46+row*spacing*Math.sqrt(3)/2,z:(col-row/2)*spacing,
    vx:0,vz:0,pocketed:false,
  });
  return{balls,config:settings,accumulator:0,shots:0,scratched:false,scratchPending:false};
}
export function poolMoving(game:PoolGame):boolean {
  return game.balls.some(b=>!b.pocketed&&(b.vx!==0||b.vz!==0));
}
export function poolPockets(config:PoolConfig):{x:number;z:number}[] {
  return[-config.halfDepth,config.halfDepth].flatMap(z=>[-config.halfWidth,0,config.halfWidth].map(x=>({x,z})));
}
/** The direction is a felt-plane vector; power is constrained to 0…1. */
export function strikePool(game:PoolGame,dx:number,dz:number,power:number):boolean {
  const cue=game.balls.find(b=>b.id===0);
  const length=Math.hypot(dx,dz);
  if(!cue||cue.pocketed||poolMoving(game)||!Number.isFinite(length)||length<.001||!Number.isFinite(power))return false;
  const speed=.45+Math.max(0,Math.min(1,power))*4.55;
  cue.vx=dx/length*speed;cue.vz=dz/length*speed;
  game.shots++;game.scratched=false;
  return true;
}
function respotCue(game:PoolGame) {
  const cue=game.balls.find(b=>b.id===0);
  if(!cue)return;
  // Search a grid rather than putting a scratched cue ball inside an object ball.
  const {ballRadius:r,halfWidth:w,halfDepth:d}=game.config;
  const spacing=r*2+.006;
  for(let col=0;col<Math.ceil((w*2-r*2)/spacing);col++)for(let row=0;row<Math.ceil((d*2-r*2)/spacing);row++){
    const x=-w+r+.04+col*spacing,z=-d+r+.04+row*spacing;
    if(x>w-r||z>d-r)continue;
    if(game.balls.every(b=>b===cue||b.pocketed||Math.hypot(b.x-x,b.z-z)>r*2+.001)){
      cue.x=x;cue.z=z;cue.vx=0;cue.vz=0;cue.pocketed=false;game.scratchPending=false;return;
    }
  }
}
function tick(game:PoolGame) {
  const c=game.config,r=c.ballRadius,diameter=r*2,pockets=poolPockets(c);
  for(const b of game.balls){
    if(b.pocketed)continue;
    // Rolling drag has constant deceleration and cannot reverse a resting ball.
    const speed=Math.hypot(b.vx,b.vz),next=Math.max(0,speed-c.rollingFriction*POOL_STEP);
    if(speed>0){b.vx*=next/speed;b.vz*=next/speed;}
    if(next<.009){b.vx=0;b.vz=0;}
    b.x+=b.vx*POOL_STEP;b.z+=b.vz*POOL_STEP;
    // Capture before cushion constraints so all six pocket mouths remain open.
    if(pockets.some(p=>Math.hypot(b.x-p.x,b.z-p.z)<c.pocketRadius)){
      b.pocketed=true;b.vx=0;b.vz=0;
      if(b.id===0){game.scratched=true;game.scratchPending=true;}
      continue;
    }
    const limitX=c.halfWidth-r,limitZ=c.halfDepth-r;
    if(b.x< -limitX){b.x=-limitX;if(b.vx<0)b.vx=-b.vx*c.cushionRestitution;}
    if(b.x>limitX){b.x=limitX;if(b.vx>0)b.vx=-b.vx*c.cushionRestitution;}
    if(b.z< -limitZ){b.z=-limitZ;if(b.vz<0)b.vz=-b.vz*c.cushionRestitution;}
    if(b.z>limitZ){b.z=limitZ;if(b.vz>0)b.vz=-b.vz*c.cushionRestitution;}
  }
  // Two constraint passes settle the closely packed rack without frame-rate dependence.
  for(let pass=0;pass<2;pass++)for(let i=0;i<game.balls.length;i++)for(let j=i+1;j<game.balls.length;j++){
    const a=game.balls[i],b=game.balls[j];
    if(a.pocketed||b.pocketed)continue;
    const dx=b.x-a.x,dz=b.z-a.z,distance=Math.hypot(dx,dz);
    if(distance>=diameter)continue;
    const nx=distance>.000001?dx/distance:1,nz=distance>.000001?dz/distance:0;
    const overlap=(diameter-distance)/2+.000001;
    a.x-=nx*overlap;a.z-=nz*overlap;b.x+=nx*overlap;b.z+=nz*overlap;
    const relative=(b.vx-a.vx)*nx+(b.vz-a.vz)*nz;
    if(relative>=0)continue;
    const impulse=-(1+c.ballRestitution)*relative/2;
    a.vx-=impulse*nx;a.vz-=impulse*nz;b.vx+=impulse*nx;b.vz+=impulse*nz;
  }
  if(game.scratchPending&&!poolMoving(game))respotCue(game);
}
/** Clamp long background pauses; ordinary render rates share exactly the same fixed ticks. */
export function advancePool(game:PoolGame,elapsedSeconds:number):void {
  if(!Number.isFinite(elapsedSeconds)||elapsedSeconds<=0)return;
  // The lounge keeps rendering between shots; do not solve a stationary rack 240 times/second.
  if(!game.scratchPending&&!poolMoving(game)){game.accumulator=0;return;}
  game.accumulator+=Math.min(elapsedSeconds,.2);
  while(game.accumulator+1e-12>=POOL_STEP){tick(game);game.accumulator-=POOL_STEP;}
}
