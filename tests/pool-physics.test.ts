import test from 'node:test';
import assert from 'node:assert/strict';
import {advancePool,createPoolGame,poolMoving,strikePool,type PoolBall} from '../lib/pool-physics';

const ball=(id:number,x:number,z:number,vx=0,vz=0):PoolBall=>({id,x,z,vx,vz,pocketed:false});
const near=(actual:number,expected:number,tolerance=1e-8)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} differs from ${expected}`);
function simulate(game:ReturnType<typeof createPoolGame>,seconds:number,hz=60){for(let i=0;i<seconds*hz;i++)advancePool(game,1/hz);}

test('rack has sixteen non-overlapping balls, with the eight ball in the middle',()=>{
  const game=createPoolGame();assert.equal(game.balls.length,16);assert.equal(new Set(game.balls.map(b=>b.id)).size,16);
  assert.equal(game.balls.find(b=>b.id===8)?.z,0);
  for(let i=0;i<16;i++)for(let j=i+1;j<16;j++)assert.ok(Math.hypot(game.balls[i].x-game.balls[j].x,game.balls[i].z-game.balls[j].z)>=game.config.ballRadius*2);
  assert.equal(poolMoving(game),false);
});
test('equal-mass elastic head-on collision transfers momentum without creating energy',()=>{
  const game=createPoolGame({rollingFriction:0,ballRestitution:1});
  game.balls=[ball(0,-.25,0,2,0),ball(1,0,0)];simulate(game,.15);
  near(game.balls[0].vx,0);near(game.balls[1].vx,2);
  near(game.balls.reduce((sum,b)=>sum+b.vx,0),2);
  near(game.balls.reduce((sum,b)=>sum+b.vx*b.vx+b.vz*b.vz,0),4);
});
test('glancing collision conserves both components of momentum and kinetic energy',()=>{
  const game=createPoolGame({rollingFriction:0,ballRestitution:1});
  game.balls=[ball(0,-.25,.065,2,0),ball(1,0,0)];simulate(game,.15);
  assert.ok(Math.abs(game.balls[1].vz)>.1);
  near(game.balls.reduce((sum,b)=>sum+b.vx,0),2);near(game.balls.reduce((sum,b)=>sum+b.vz,0),0);
  near(game.balls.reduce((sum,b)=>sum+b.vx*b.vx+b.vz*b.vz,0),4);
});
test('cushion reflects the normal velocity and loses only the configured impact energy',()=>{
  const game=createPoolGame({rollingFriction:0,cushionRestitution:.8});
  game.balls=[ball(0,1.35,.2,1,.1)];simulate(game,.1);
  near(game.balls[0].vx,-.8);near(game.balls[0].vz,.1);
  assert.ok(game.balls[0].x<=game.config.halfWidth-game.config.ballRadius);
});
test('all six pockets capture object balls before cushion bounce',()=>{
  for(const x of [-1.44,0,1.44])for(const z of [-.72,.72]){
    const game=createPoolGame({rollingFriction:0});
    const dx=x===0?0:Math.sign(x),dz=Math.sign(z);
    game.balls=[ball(1,x-dx*.1,z-dz*.1,dx,dz)];simulate(game,.1);
    assert.equal(game.balls[0].pocketed,true,`pocket ${x}, ${z}`);
    near(game.balls[0].vx,0);near(game.balls[0].vz,0);
  }
});
test('scratch waits for motion to finish and respots the cue without overlapping a ball',()=>{
  const game=createPoolGame();game.balls=[ball(0,0,.6,0,1),ball(1,-1,.1,.2,0)];
  simulate(game,.05);assert.equal(game.balls[0].pocketed,true);assert.equal(game.scratchPending,true);
  simulate(game,2);const cue=game.balls[0];assert.equal(cue.pocketed,false);assert.equal(game.scratchPending,false);assert.equal(game.scratched,true);
  assert.ok(Math.hypot(cue.x-game.balls[1].x,cue.z-game.balls[1].z)>game.config.ballRadius*2);
  assert.equal(strikePool(game,1,0,.2),true);assert.equal(game.scratched,false);
});
test('rolling friction eventually reaches exact rest and prevents mid-shot shooting',()=>{
  const game=createPoolGame();assert.equal(strikePool(game,1,0,.6),true);assert.equal(game.shots,1);
  assert.equal(strikePool(game,1,0,.6),false);simulate(game,20);
  assert.equal(poolMoving(game),false);assert.ok(game.balls.every(b=>b.vx===0&&b.vz===0));
  assert.equal(strikePool(game,1,0,.4),true);assert.equal(game.shots,2);
});
test('fixed-step collision simulation gives the same outcome at 60 and 144 Hz',()=>{
  const a=createPoolGame(),b=createPoolGame();strikePool(a,1,.02,.9);strikePool(b,1,.02,.9);
  simulate(a,5,60);simulate(b,5,144);
  for(let i=0;i<a.balls.length;i++){
    near(a.balls[i].x,b.balls[i].x);near(a.balls[i].z,b.balls[i].z);
    near(a.balls[i].vx,b.balls[i].vx);near(a.balls[i].vz,b.balls[i].vz);assert.equal(a.balls[i].pocketed,b.balls[i].pocketed);
  }
});
test('invalid input cannot poison the simulation',()=>{
  const game=createPoolGame();assert.equal(strikePool(game,0,0,.5),false);assert.equal(strikePool(game,NaN,0,.5),false);assert.equal(strikePool(game,1,0,Infinity),false);
  advancePool(game,NaN);advancePool(game,Infinity);advancePool(game,-1);assert.equal(game.accumulator,0);
  assert.ok(game.balls.every(b=>Number.isFinite(b.x)&&Number.isFinite(b.z)));
});
