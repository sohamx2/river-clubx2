import test from 'node:test';
import assert from 'node:assert/strict';
import { act,createRoom,joinRoom,view } from '../lib/engine';
import { chipBreakdown,tableCinematicEndsAt,DIE_ROLL_MS,OCEAN_WAVE_MS } from '../lib/table-scene';
import type { Room,Settings,VoteKind } from '../lib/types';
const settings:Settings={theme:'classic',maxPlayers:3,startingStack:2000,smallBlind:10,bigBlind:20,turnSeconds:0};
function room(){const r=createRoom('SCENE2','Scene','Alice','alice',settings,1000);joinRoom(r,'Bob','bob',1000);joinRoom(r,'Charlie','charlie',1000);return r;}
function move(r:Room,move:'call'|'check'|'fold'){const p=r.players.find(p=>p.id===r.turnId)!;act(r,p.tokenHash,{type:'act',move,expectedAction:r.actionNo},2000);}
function complete(r:Room){let n=0;while(r.phase!=='showdown'&&n++<100)move(r,r.currentBet>r.players.find(p=>p.id===r.turnId)!.bet?'call':'check');assert.equal(r.phase,'showdown');}
function approve(r:Room,kind:VoteKind){act(r,'alice',{type:'propose',kind,amount:10},1000);if(r.vote)act(r,'bob',{type:'vote',voteId:r.vote.id,yes:true},1000);}

test('checks and exact chip transfers survive a street change without exposing private cards',()=>{
  const r=room();act(r,'alice',{type:'start'},1000);move(r,'call');move(r,'call');const checker=r.turnId;move(r,'check');
  assert.equal(r.phase,'flop');assert.equal(r.players.find(p=>p.id===checker)!.lastAction,'');
  const publicRoom=view(r,'alice'),events=publicRoom.tableEvents!;
  assert.ok(events.some(e=>e.type==='check'&&e.playerId===checker));
  assert.equal(events.filter(e=>e.type==='bet').reduce((sum,e)=>sum+(e.type==='bet'?e.amount:0),0),publicRoom.pot);
  const deal=events.find(e=>e.type==='deal')!;assert.equal(deal.type,'deal');assert.ok(!('hole' in deal));assert.ok(!('deck' in publicRoom));
  assert.deepEqual(publicRoom.players[1].hole,['?','?']);
  assert.deepEqual(view(r,'bob').tableEvents,events);
});
test('fold events are retained and presentation history stays bounded across hands',()=>{
  const r=room();for(let i=0;i<12;i++){act(r,'alice',{type:'start'},1000+i);move(r,'fold');move(r,'fold');}
  assert.equal(r.tableEvents!.length,48);assert.equal(new Set(r.tableEvents!.map(e=>e.id)).size,48);
  assert.equal(r.tableEvents!.at(-1)?.type,'fold');assert.equal(r.phase,'showdown');
});
test('Die on the River and Ocean provide authoritative outcomes for their table effects',()=>{
  const die=room();approve(die,'dieRiver');act(die,'alice',{type:'start'},1000);complete(die);
  const roll=die.tableEvents!.find(e=>e.type==='die');assert.ok(roll&&roll.type==='die');assert.equal(roll.roll,die.dieRiverRoll);
  assert.equal(tableCinematicEndsAt(view(die,'alice')),2000+DIE_ROLL_MS+2500);
  const ocean=room();approve(ocean,'ocean');act(ocean,'alice',{type:'start'},1000);complete(ocean);
  assert.equal(ocean.board.length,6);assert.equal(ocean.tableEvents!.filter(e=>e.type==='ocean').length,1);
  assert.equal(tableCinematicEndsAt(view(ocean,'alice')),2000+OCEAN_WAVE_MS+1400);
  ocean.handNo++;assert.equal(tableCinematicEndsAt(view(ocean,'alice')),0);
});
test('coloured denominations represent the full bankroll with consistent values',()=>{
  for(const amount of [0,1,4,5,24,25,99,100,1999,2000,54321,1000000,10000000]){
    const chips=chipBreakdown(amount);assert.equal(chips.reduce((sum,c)=>sum+c.value*c.count,0),amount);
    assert.ok(chips.every(chip=>chip.count>0&&chip.color.startsWith('#')));
  }
  assert.deepEqual(chipBreakdown(2000).map(c=>[c.value,c.count]),[[100,20]]);
  assert.deepEqual(chipBreakdown(-100),[]);
});
