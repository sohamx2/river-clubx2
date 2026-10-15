import test from 'node:test';
import assert from 'node:assert/strict';
import {clubSeat,clubSeatApproach,canUseClubSeat,resolveClubWalk,clubHeadYaw} from '../lib/club-layout';
import {createRoom,joinRoom,act} from '../lib/engine';
import type {Settings} from '../lib/types';

const poolBounds={minX:-7.62,maxX:-4.38,minZ:-3.92,maxZ:-2.08};
test('every poker seat has a reachable approach outside its chair and the table, regardless of seat count',()=>{
 for(let count=2;count<=10;count++)for(let seat=0;seat<count;seat++){
  const p=clubSeat(seat,count),approach=clubSeatApproach(seat,count);
  assert.ok(canUseClubSeat(approach,seat,count));
  assert.ok(Math.hypot(approach.x-p.x,approach.z-p.z)>.8);
  assert.ok(approach.x**2/(3.82**2)+approach.z**2/(2.59**2)>1);
  assert.ok(p.x*Math.sin(p.facing)+p.z*Math.cos(p.facing)<0,'avatar faces the centre of the table');
 }
});
test('a player can walk from their poker chair to pool and back without leaving the room',()=>{
 let p=clubSeatApproach(0,6);
 p=resolveClubWalk(p,{x:-5.4,z:0},[poolBounds]);
 p=resolveClubWalk(p,{x:0,z:-5.2},[poolBounds]);
 assert.ok(Math.hypot(p.x+6,p.z+3)<2.9,'within pool interaction range');
 assert.ok(!canUseClubSeat(p,0,6),'cannot remotely teleport back to the chair');
 p=resolveClubWalk(p,{x:0,z:5.2},[poolBounds]);p=resolveClubWalk(p,{x:5.4,z:0},[poolBounds]);
 assert.ok(canUseClubSeat(p,0,6));
});
test('the shared lounge still blocks the poker table, pool rails, and bar counter',()=>{
 const front=resolveClubWalk({x:0,z:3.8},{x:0,z:-12},[]);assert.ok(front.z>2.8);
 const pool=resolveClubWalk({x:-6,z:-1.5},{x:0,z:-5},[poolBounds]);assert.ok(pool.z> -1.8);
 const bar=resolveClubWalk({x:4,z:-4.5},{x:0,z:-6},[{minX:-.4,maxX:8.8,minZ:-7.66,maxZ:-5.94}]);assert.ok(bar.z> -5.7);
});
test('getting up preserves the current hand; E can cancel the queued sit-out or join the next hand',()=>{
 const settings:Settings={theme:'classic',maxPlayers:3,startingStack:2000,smallBlind:10,bigBlind:20,turnSeconds:0};
 const room=createRoom('ABC234','Club','Host','host',settings,1000);joinRoom(room,'Friend','friend',1000);joinRoom(room,'Pool friend','pool',1000);
 act(room,'host',{type:'start'},1000);const p=room.players[0],hole=[...p.hole];
 act(room,'host',{type:'sit',out:true},1001);assert.equal(p.sitNext,true);assert.equal(p.sittingOut,false);assert.equal(p.inHand,true);assert.deepEqual(p.hole,hole);
 act(room,'host',{type:'sit',out:false},1002);assert.equal(p.sitNext,null);assert.equal(p.inHand,true);
 act(room,'host',{type:'sit',out:true},1003);
 while(room.phase!=='showdown'){const player=room.players.find(player=>player.id===room.turnId)!;act(room,player.tokenHash,{type:'act',move:'fold',expectedAction:room.actionNo},1100);}
 assert.equal(p.sittingOut,true);act(room,'host',{type:'sit',out:false},1200);assert.equal(p.sittingOut,false);
 act(room,'host',{type:'start'},1300);assert.equal(p.inHand,true);assert.equal(room.handNo,2);
});

test('every seated avatar faces exactly where its camera looks, without mirroring',()=>{
 for(let count=2;count<=10;count++)for(let seat=0;seat<count;seat++)for(const look of [-.45,0,.45]){
  const facing=clubSeat(seat,count).facing,cameraYaw=facing-Math.PI-look,head=clubHeadYaw(cameraYaw,facing);
  assert.ok(Math.abs(head+look)<1e-10);
  assert.ok(Math.abs(Math.sin(facing+head)+Math.sin(cameraYaw))<1e-10);
  assert.ok(Math.abs(Math.cos(facing+head)+Math.cos(cameraYaw))<1e-10);
 }
});
