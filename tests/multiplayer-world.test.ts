import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {applyPoolCommand,createPoolMatch,expirePoolPlayers,poolGameAt,POOL_LEASE,type PoolMatch} from '../lib/pool-match';
import {syncPoolPlayback} from '../lib/pool-playback';
import {poolMoving,POOL_STEP} from '../lib/pool-physics';
import {toRoomBody,fromRoomBody,parseBodyPose,type BodyPose} from '../lib/world-presence';
import {parseAvatarPose} from '../lib/avatar-pose';
const now=1000000;
function act(match:PoolMatch,me:string,command:Parameters<typeof applyPoolCommand>[2],at=now){const changed=applyPoolCommand(match,me,command,at);if(changed&&command.type!=='heartbeat')match.version++;return changed;}
function ready(){const m=createPoolMatch();act(m,'a',{type:'join'});act(m,'b',{type:'join'});return m;}
function shot(match:PoolMatch,extras:Partial<{dx:number;dz:number;power:number}>={}){return{type:'shoot' as const,id:randomUUID(),version:match.version,dx:1,dz:0,power:.6,...extras};}

test('shared body poses validate and survive peer packet parsing',()=>{
  const body:BodyPose={area:'bar',x:-5,z:-3,yaw:1,seated:false,moving:true};
  assert.deepEqual(parseAvatarPose({yaw:0,pitch:.2,body})?.body,body);
  for(const bad of [{...body,x:Infinity},{...body,z:100},{...body,yaw:NaN},{...body,area:'elsewhere'},{...body,moving:'true'}]){assert.equal(parseBodyPose(bad),null);assert.equal(parseAvatarPose({yaw:0,pitch:0,body:bad}),null);}
});
test('world coordinates and facing round-trip across every seat, including mobile normalization',()=>{
  const local:BodyPose={area:'table',x:5.1,z:-3.4,yaw:1.1,seated:false,moving:true};
  for(let count=2;count<=10;count++)for(let seat=0;seat<count;seat++){
    const roundtrip=fromRoomBody(toRoomBody(local,seat,count),seat,count);
    assert.ok(Math.abs(roundtrip.x-local.x)<1e-10&&Math.abs(roundtrip.z-local.z)<1e-10&&Math.abs(roundtrip.yaw-local.yaw)<1e-10);
    const seated=toRoomBody({...local,x:0,z:2.8,yaw:0,seated:true},seat,count),angle=seat/count*Math.PI*2;
    assert.ok(Math.abs(seated.x+4.05*Math.sin(angle))<1e-10&&Math.abs(seated.z-2.8*Math.cos(angle))<1e-10);
  }
});
test('pool accepts two players and rejects an occupied seat or non-player shot',()=>{
  const m=ready();assert.equal(m.turnId,'a');assert.deepEqual(m.scores,{a:0,b:0});
  assert.throws(()=>act(m,'c',{type:'join'}),/taken/);
  assert.throws(()=>act(m,'c',shot(m)),/Join/);assert.throws(()=>act(m,'b',shot(m)),/opponent/);
});
test('a shared shot has deterministic playback and one authoritative final ball layout',()=>{
  const m=ready(),command=shot(m);act(m,'a',command);assert.equal(m.game.shots,1);assert.ok(m.shot);assert.equal(poolMoving(m.game),false);
  assert.deepEqual(poolGameAt(m,m.shot!.startAt-1),m.shot!.initial);
  assert.deepEqual(poolGameAt(m,m.shot!.finishAt+1),m.game);
  assert.deepEqual(poolGameAt(m,m.shot!.startAt+500),poolGameAt(m,m.shot!.startAt+500));
  const nearEnd=poolGameAt(m,m.shot!.finishAt-POOL_STEP*1000/2);
  for(const b of m.game.balls){if(b.id===0&&m.game.scratched)continue;const peer=nearEnd.balls.find(p=>p.id===b.id)!;assert.ok(Math.hypot(b.x-peer.x,b.z-peer.z)<.01);}
});
test('shot retries are idempotent, stale versions and shooting while balls roll are rejected',()=>{
  const m=ready(),command=shot(m);act(m,'a',command);const saved=structuredClone(m);
  assert.equal(act(m,'a',command),false);assert.deepEqual(m,saved);
  assert.throws(()=>act(m,'a',{...shot(m),version:m.version-1},m.shot!.finishAt+1),/changed/);
  assert.throws(()=>act(m,m.turnId!,shot(m),m.shot!.startAt+1),/rolling/);
});
test('pocketed balls score and keep a turn; a scratch gives no points and passes',()=>{
  const m=ready();for(const b of m.game.balls)if(b.id>2)b.pocketed=true;
  // Straight shot into the middle side pocket, leaving the cue safe.
  Object.assign(m.game.balls[0],{x:0,z:.28});Object.assign(m.game.balls.find(b=>b.id===1)!,{x:0,z:.57});
  act(m,'a',shot(m,{dx:0,dz:1,power:.04}));assert.equal(m.scores.a,1);assert.equal(m.turnId,'a');assert.equal(m.winnerId,null);
  const scratch=ready();Object.assign(scratch.game.balls[0],{x:0,z:.6});
  act(scratch,'a',shot(scratch,{dx:0,dz:1,power:.2}));assert.equal(scratch.shot?.scratch,true);assert.equal(scratch.scores.a,0);assert.equal(scratch.turnId,'b');
});
test('heartbeat does not invalidate a shot; a departed player forfeits and frees the second seat',()=>{
  const m=ready(),version=m.version;act(m,'a',{type:'heartbeat'},now+1000);assert.equal(m.version,version);
  act(m,'b',{type:'leave'});assert.equal(m.winnerId,'a');assert.equal(m.players.length,1);
  act(m,'c',{type:'join'});assert.equal(m.winnerId,null);assert.deepEqual(m.scores,{a:0,c:0});
  assert.equal(expirePoolPlayers(m,['a','c'],now+POOL_LEASE+1),true);assert.equal(m.players.length,0);
});
test('pool cannot be reracked in the middle of a match and invalid power cannot mutate physics',()=>{
  const m=ready(),saved=structuredClone(m);assert.throws(()=>act(m,'a',{type:'rematch'}),/Finish/);
  for(const power of [NaN,-1,2])assert.throws(()=>act(m,'a',shot(m,{power})),/Invalid/);
  assert.deepEqual(m,saved);
});

test('an early shot packet launches on time, catches up after a pause, and settles without replaying',()=>{
 const m=ready();act(m,'a',shot(m));const start=m.shot!.startAt;
 let replay=syncPoolPlayback(null,m,start-100);assert.equal(poolMoving(replay.game),false);
 replay=syncPoolPlayback(replay,m,start+100);assert.equal(poolMoving(replay.game),true);assert.equal(replay.game.shots,1);
 replay=syncPoolPlayback(replay,m,start+1500);assert.deepEqual(replay.game,poolGameAt(m,start+1500));
 replay=syncPoolPlayback(replay,m,m.shot!.finishAt+100);assert.deepEqual(replay.game,m.game);
 const saved=structuredClone(replay.game);replay=syncPoolPlayback(replay,m,m.shot!.finishAt+200);assert.deepEqual(replay.game,saved);
});

test('a winning shot must finish rolling before either player can start a rematch',()=>{
 const m=ready();m.scores.a=7;for(const b of m.game.balls)if(b.id>2)b.pocketed=true;
 Object.assign(m.game.balls[0],{x:0,z:.28});Object.assign(m.game.balls.find(b=>b.id===1)!,{x:0,z:.57});
 act(m,'a',shot(m,{dx:0,dz:1,power:.04}));assert.equal(m.winnerId,'a');
 assert.throws(()=>act(m,'b',{type:'rematch'},m.shot!.startAt+1),/rolling/);
 act(m,'b',{type:'rematch'},m.shot!.finishAt+1);assert.equal(m.winnerId,null);assert.equal(m.game.shots,0);assert.equal(m.scores.a,0);
});
