import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createRoom,joinRoom,legal,newDeck,settle,tick,view} from '../lib/engine';
import {compare,evaluate} from '../lib/evaluator';
import { defaultSideGameAmount } from '../lib/presentation';
import type {Room,Settings,VoteKind} from '../lib/types';
const settings:Settings={theme:'classic',maxPlayers:10,startingStack:1000,smallBlind:10,bigBlind:20,turnSeconds:30};
function table(n=3){const r=createRoom('ABC234','Test table','Player 0','token0',settings,1000);for(let i=1;i<n;i++)joinRoom(r,`Player ${i}`,`token${i}`,1000);return r;}
function start(r:Room){act(r,r.players.find(p=>p.id===r.hostId)!.tokenHash,{type:'start'},1000);}
function move(r:Room,kind:'call'|'check'|'fold'|'raise',amount?:number){const p=r.players.find(p=>p.id===r.turnId)!;act(r,p.tokenHash,{type:'act',move:kind,amount,expectedAction:r.actionNo},1100);}
function passive(r:Room){let steps=0;while(r.phase!=='showdown'&&steps++<300){const p=r.players.find(p=>p.id===r.turnId)!;if(r.stripDiscard)act(r,p.tokenHash,{type:'discard',card:p.hole[0],expectedAction:r.actionNo},1100);else move(r,r.currentBet>p.bet?'call':'check');}assert.equal(r.phase,'showdown');}
function approve(r:Room,kind:VoteKind,amount=0){act(r,'token0',{type:'propose',kind,amount},1000);for(const p of r.players.slice(1)){if(!r.vote)break;act(r,p.tokenHash,{type:'vote',voteId:r.vote.id,yes:true},1000);}}
const total=(r:Room)=>r.players.reduce((s,p)=>s+p.stack+(r.phase==='showdown'||r.phase==='waiting'?0:p.contributed),0)+(r.bounty?.reserve?r.bounty.reserve*r.bounty.players.length:0)+(r.sevenDeuce?.reserves?Object.values(r.sevenDeuce.reserves).reduce((s,n)=>s+n,0):0);
test('52 unique cards, unbiased Fisher–Yates shuffle input',()=>{for(let i=0;i<20;i++){const deck=newDeck();assert.equal(deck.length,52);assert.equal(new Set(deck).size,52);}});
test('hand evaluation orders all categories and recognizes the wheel',()=>{
 const hands=[['As','Jh','9c','7d','3h'],['As','Ah','9c','7d','3h'],['As','Ah','9c','9d','3h'],['As','Ah','Ac','7d','3h'],['As','2h','3c','4d','5h'],['As','Js','9s','7s','3s'],['As','Ah','Ac','7d','7h'],['As','Ah','Ac','Ad','3h'],['9s','Ts','Js','Qs','Ks']];
 for(let i=1;i<hands.length;i++)assert.ok(compare(evaluate(hands[i]).rank,evaluate(hands[i-1]).rank)>0);
 assert.deepEqual(evaluate(hands[4]).rank,[4,5]);assert.equal(evaluate(['As','Ks','Qs','Js','Ts','2d','2c']).name,'Royal flush');
 assert.throws(()=>evaluate(['As','As','Qs','Js','Ts']));
});
test('seven-card evaluation picks the higher full house and kickers',()=>{assert.deepEqual(evaluate(['As','Ah','Ad','Ks','Kh','Kd','2c']).rank,[6,14,13]);assert.ok(compare(evaluate(['As','Ah','Kd','Qd','9c','5d','3s']).rank,evaluate(['Ac','Ad','Ks','Jh','9d','5h','3c']).rank)>0);});
test('eight-card Ocean evaluation still chooses the best five cards',()=>{const hand=evaluate(['As','Ks','Qs','Js','Ts','2d','3c','4h']);assert.equal(hand.name,'Royal flush');assert.deepEqual(hand.rank,[8,14]);});
test('nine-card Pocket Trips Ocean evaluation chooses the best five cards',()=>{const hand=evaluate(['As','Ks','Qs','Js','Ts','2d','3c','4h','5h']);assert.equal(hand.name,'Royal flush');assert.deepEqual(hand.rank,[8,14]);});
test('heads-up: dealer posts small blind and acts first preflop, last postflop',()=>{const r=table(2);start(r);assert.equal(r.dealerSeat,0);assert.equal(r.players[0].bet,10);assert.equal(r.players[1].bet,20);assert.equal(r.turnId,r.players[0].id);move(r,'call');assert.equal(r.turnId,r.players[1].id);move(r,'check');assert.equal(r.phase,'flop');assert.equal(r.turnId,r.players[1].id);passive(r);assert.equal(total(r),2000);start(r);assert.equal(r.dealerSeat,1);assert.equal(r.turnId,r.players[1].id);});
test('big blind retains its option after all preflop calls',()=>{const r=table();start(r);move(r,'call');move(r,'call');assert.equal(r.phase,'preflop');assert.equal(r.turnId,r.players[2].id);assert.ok(legal(r,r.players[2]).canRaise);move(r,'check');assert.equal(r.phase,'flop');assert.equal(r.board.length,3);});
test('a short all-in does not reopen a previous caller’s raise',()=>{const r=table();r.players[1].stack=25;start(r);move(r,'call');move(r,'raise',25);assert.equal(r.currentBet,25);move(r,'call');assert.equal(r.turnId,r.players[0].id);assert.equal(legal(r,r.players[0]).canRaise,false);assert.throws(()=>move(r,'raise',100));move(r,'call');assert.equal(r.phase,'flop');passive(r);assert.equal(total(r),2025);});
test('cumulative short raises reopen action when they reach a full raise',()=>{const r=table(4);r.players[1].stack=45;r.players[2].stack=60;start(r);move(r,'raise',40);move(r,'call');move(r,'raise',45);move(r,'raise',60);assert.equal(r.turnId,r.players[3].id);assert.equal(legal(r,r.players[3]).canRaise,true);passive(r);assert.equal(total(r),2105);});
test('illegal actions, stale action counters and unauthorized players are rejected',()=>{const r=table();start(r);assert.throws(()=>move(r,'check'));assert.throws(()=>move(r,'raise',21));assert.throws(()=>act(r,'token1',{type:'act',move:'fold',expectedAction:r.actionNo}));assert.throws(()=>act(r,'unknown',{type:'theme',theme:'dark'}));assert.throws(()=>act(r,'token1',{type:'theme',theme:'dark'}));assert.throws(()=>act(r,'token0',{type:'act',move:'call',expectedAction:r.actionNo-1}));});
function showdownFixture(){const r=table();r.phase='river';r.board=['2c','3d','7h','8s','9c'];r.players.forEach((p,i)=>{p.inHand=true;p.hole=[['As','Ad'],['Ks','Kd'],['Qs','Qd']][i];p.contributed=(i+1)*100;p.stack=0;});return r;}
test('unequal all-ins build independent side pots and refund uncalled excess',()=>{const r=showdownFixture();settle(r);assert.deepEqual(r.players.map(p=>p.stack),[300,200,100]);assert.equal(r.result!.payouts.length,2);assert.equal(total(r),600);});
test('folded contributions stay in the pot without winning any tier',()=>{const r=showdownFixture();r.players[0].folded=true;settle(r);assert.deepEqual(r.players.map(p=>p.stack),[0,500,100]);});
test('tied pots split with odd chip clockwise from dealer',()=>{const r=showdownFixture();r.board=['As','Ks','Qs','Js','Ts'];r.players.forEach((p,i)=>{p.hole=[['2h','3h'],['4h','5h'],['6h','7h']][i];p.contributed=1;});r.players[2].folded=true;r.dealerSeat=0;settle(r);assert.deepEqual(r.players.map(p=>p.stack),[1,2,0]);});
test('a fold win runs out the full board without revealing hole cards or the deck',()=>{const r=table(2);start(r);let v=view(r,'token0');assert.deepEqual(v.players[1].hole,['?','?']);assert.ok(!('deck'in v));assert.ok(!('tokenHash'in v.players[1]));move(r,'fold');v=view(r,'token0');assert.deepEqual(v.players[1].hole,['?','?']);assert.equal(v.board.length,5);assert.equal(v.result!.board.length,5);assert.equal(total(r),2000);});
test('showdown reveals only live players’ cards',()=>{const r=table();start(r);move(r,'fold');passive(r);const v=view(r,'token1');assert.deepEqual(v.players[0].hole,['?','?']);assert.notDeepEqual(v.players[2].hole,['?','?']);});
test('a player can choose to show folded cards after the hand',()=>{const r=table();start(r);move(r,'fold');passive(r);assert.deepEqual(view(r,'token1').players[0].hole,['?','?']);act(r,'token0',{type:'show'});assert.deepEqual(view(r,'token1').players[0].hole,r.players[0].hole);assert.ok(r.logs.at(-1)?.text.includes('shows'));});
test('ten players receive distinct cards and complete a hand',()=>{const r=table(10);start(r);assert.equal(new Set(r.players.flatMap(p=>p.hole)).size,20);passive(r);assert.equal(new Set([...r.players.flatMap(p=>p.hole),...r.board]).size,25);assert.equal(total(r),10000);});
test('bomb pot passes with n-1 votes, takes equal antes and opens the flop without blinds',()=>{const r=table();act(r,'token0',{type:'propose',kind:'bomb',amount:50},1000);assert.throws(()=>start(r));const id=r.vote!.id;act(r,'token1',{type:'vote',voteId:id,yes:true});assert.ok(r.bombNext);assert.equal(r.vote,null);start(r);assert.equal(r.phase,'flop');assert.equal(r.board.length,3);assert.deepEqual(r.players.map(p=>p.contributed),[50,50,50]);assert.deepEqual(r.players.map(p=>p.bet),[0,0,0]);assert.equal(r.turnId,r.players[1].id);passive(r);assert.equal(total(r),3000);});
test('Ocean adds a sixth community card and a final betting round',()=>{const r=table();approve(r,'ocean');assert.ok(r.oceanNext);start(r);assert.equal(r.isOcean,true);passive(r);assert.equal(r.board.length,6);assert.equal(r.result!.board.length,6);assert.equal(new Set([...r.players.flatMap(p=>p.hole),...r.board]).size,12);assert.equal(total(r),3000);});
test('one player can pass while n-1 approve, and expired votes enable nothing',()=>{const r=table();act(r,'token0',{type:'propose',kind:'bomb',amount:50},1000);const id=r.vote!.id;act(r,'token1',{type:'vote',voteId:id,yes:false},1000);assert.ok(r.vote);act(r,'token2',{type:'vote',voteId:id,yes:true},1000);assert.ok(r.bombNext);const r2=table();act(r2,'token0',{type:'propose',kind:'bomb',amount:50},1000);tick(r2,122000);assert.equal(r2.vote,null);assert.equal(r2.bombNext,null);});
function fixedWin(r:Room,winner:number){r.phase='river';r.board=['2c','3d','7h','8s','9c'];r.players.forEach((p,i)=>{p.inHand=true;p.folded=false;p.hole=i===winner?['As','Ad']:i===(winner+1)%3?['Ks','Kd']:['Qs','Qd'];p.stack-=10;p.contributed=10;});settle(r);}
test('last player without a main-pot win pays every opponent only when the bounty ends',()=>{const r=table();approve(r,'bounty',50);assert.deepEqual(r.players.map(p=>p.stack),[1000,1000,1000]);assert.equal(total(r),3000);fixedWin(r,0);assert.equal(r.bounty!.won.length,1);fixedWin(r,1);assert.equal(r.bounty,null);assert.deepEqual(r.players.map(p=>p.stack),[1060,1060,880]);assert.equal(total(r),3000);assert.equal(view(r,'token0').bountyOutcome?.loserId,r.players[2].id);assert.equal(r.bountyOutcome?.loserName,'Player 2');assert.equal(r.bountyOutcome?.amount,50);approve(r,'bounty',10);assert.equal(r.bountyOutcome,null);});
test('bounty requires present coverage but reserves nothing and cancellation changes no stacks',()=>{const r=table();assert.throws(()=>approve(r,'bounty',501));approve(r,'bounty',50);assert.deepEqual(r.players.map(p=>p.stack),[1000,1000,1000]);assert.throws(()=>joinRoom(r,'Late','late'));assert.throws(()=>act(r,'token1',{type:'leave'}));act(r,'token0',{type:'cancelBounty'});assert.deepEqual(r.players.map(p=>p.stack),[1000,1000,1000]);});
test('an active bounty from the escrow version is migrated without losing chips',()=>{const r=table();r.players.forEach(p=>p.stack-=100);r.bounty={amount:50,players:r.players.map(p=>p.id),won:[],reserve:100};assert.equal(tick(r,1000),true);assert.deepEqual(r.players.map(p=>p.stack),[1000,1000,1000]);assert.equal(r.bounty?.reserve,undefined);assert.equal(total(r),3000);});
function sevenDeuceWin(bluff=false){const r=table();approve(r,'sevenDeuce',50);r.phase='river';r.board=['7c','7d','2c','3d','4h'];r.players.forEach((p,i)=>{p.inHand=true;p.folded=bluff&&i>0;p.hole=i===0?['7s','2h']:i===1?['As','Kd']:['Qs','Jd'];p.stack-=10;p.contributed=10;});settle(r);return r;}
test('7-2 pays directly after the hand, reveals the hand, and stays active',()=>{const r=sevenDeuceWin();const winner=r.players[0];assert.deepEqual(r.players.map(p=>p.stack),[1120,940,940]);assert.ok(r.sevenDeuce);assert.equal(r.sevenDeuce!.reserves,undefined);assert.ok(r.result!.revealed.includes(winner.id));assert.deepEqual(view(r,'token1').players[0].hole,['7s','2h']);assert.equal(total(r),3000);});
test('7-2 also pays and reveals after a successful bluff',()=>{const r=sevenDeuceWin(true);assert.ok(r.result!.revealed.includes(r.players[0].id));assert.deepEqual(view(r,'token2').players[0].hole,['7s','2h']);assert.equal(total(r),3000);});
test('7-2 reserves nothing, accepts new players, and lasts until host cancellation',()=>{const r=table();approve(r,'sevenDeuce',50);assert.deepEqual(r.players.map(p=>p.stack),[1000,1000,1000]);joinRoom(r,'Late','late');assert.equal(r.players.length,4);act(r,'token0',{type:'cancelBounty'});assert.equal(r.sevenDeuce,null);assert.deepEqual(r.players.map(p=>p.stack),[1000,1000,1000,1000]);});
test('legacy 7-2 reserves are refunded and converted to direct settlement',()=>{const r=table();r.players.forEach(p=>p.stack-=100);r.sevenDeuce={amount:50,players:r.players.map(p=>p.id),reserve:100,reserves:Object.fromEntries(r.players.map(p=>[p.id,100]))};assert.equal(tick(r,1000),true);assert.deepEqual(r.players.map(p=>p.stack),[1000,1000,1000]);assert.equal(r.sevenDeuce?.reserves,undefined);assert.equal(total(r),3000);});
test('Die on the River rolls after river betting and leaves a complete board',()=>{const r=table();approve(r,'dieRiver');start(r);passive(r);assert.equal(r.isDieRiver,true);assert.ok((r.dieRiverRoll||0)>=1&&(r.dieRiverRoll||0)<=6);assert.equal(r.board.length,5);assert.equal(r.result!.board.length,5);assert.equal(total(r),3000);});
test('Pocket Trips deals three private cards to every player',()=>{const r=table();approve(r,'pocketTrips');start(r);assert.ok(r.players.every(p=>p.hole.length===3));assert.equal(new Set(r.players.flatMap(p=>p.hole)).size,9);passive(r);assert.equal(r.board.length,5);assert.equal(new Set([...r.players.flatMap(p=>p.hole),...r.board]).size,14);assert.equal(total(r),3000);});
test('Pocket Trips and Ocean settle with nine available cards per player',()=>{const r=table();approve(r,'pocketTrips');approve(r,'ocean');start(r);assert.ok(r.isPocketTrips&&r.isOcean);passive(r);assert.equal(r.board.length,6);assert.equal(r.result!.board.length,6);assert.equal(total(r),3000);});
test('Double Barrel deals two boards and awards every chip across the boards',()=>{const r=table();approve(r,'doubleBarrel');start(r);assert.ok(r.isDoubleBarrel);passive(r);assert.equal(r.board.length,5);assert.equal(r.boardTwo.length,5);assert.equal(r.result!.boardTwo?.length,5);assert.equal(new Set([...r.players.flatMap(p=>p.hole),...r.board,...r.boardTwo]).size,16);assert.equal(total(r),3000);});
test('Strip Club deals five cards then requires three discards before the final betting round',()=>{const r=table();approve(r,'stripClub');start(r);assert.ok(r.players.every(p=>p.hole.length===5));passive(r);assert.ok(r.isStripClub);assert.ok(r.players.every(p=>p.hole.length===2));assert.equal(r.logs.filter(l=>l.text.includes('discarded a card')).length,9);assert.equal(total(r),3000);});
test('Strip Club rejects a ten-seat card demand before a hand begins',()=>{const r=table(10);assert.throws(()=>approve(r,'stripClub'),/up to 8 players/);assert.equal(r.phase,'waiting');assert.equal(r.deck.length,0);});
test('timeouts auto-fold an outstanding bet and auto-check a free action',()=>{const r=table(2);start(r);tick(r,31001);assert.equal(r.phase,'showdown');assert.ok(r.players[0].folded);const r2=table(2);start(r2);move(r2,'call');tick(r2,31101);assert.equal(r2.phase,'flop');assert.equal(total(r2),2000);});
test('no-timer rooms create no deadline and never auto-act',()=>{const r=table(2);r.settings.turnSeconds=0;start(r);const turnId=r.turnId;assert.equal(r.deadline,null);assert.equal(tick(r,Number.MAX_SAFE_INTEGER),false);assert.equal(r.turnId,turnId);assert.equal(r.phase,'preflop');});
test('host can resize the table between hands without dropping players',()=>{const r=table();r.players[2].seat=8;r.dealerSeat=8;act(r,'token0',{type:'seats',maxPlayers:4});assert.equal(r.settings.maxPlayers,4);assert.deepEqual(r.players.map(p=>p.seat).sort((a,b)=>a-b),[0,1,2]);assert.equal(r.dealerSeat,r.players[2].seat);assert.throws(()=>act(r,'token0',{type:'seats',maxPlayers:2}));assert.throws(()=>act(r,'token1',{type:'seats',maxPlayers:5}));start(r);assert.throws(()=>act(r,'token0',{type:'seats',maxPlayers:6}));});
test('late join waits until next hand and reconnect reclaims the same seat',()=>{const r=table(2);start(r);joinRoom(r,'Third','third');assert.equal(r.players[2].inHand,false);joinRoom(r,'Third','third');assert.equal(r.players.length,3);passive(r);start(r);assert.equal(r.players[2].hole.length,2);});
test('absent host transfers to a recently connected player',()=>{const r=table();r.players[1].lastSeen=100000;tick(r,100000);assert.equal(r.hostId,r.players[1].id);});
test('random legal actions conserve chips and finish 500 hands, including all-ins',()=>{
 let seed=90731;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 for(let game=0;game<500;game++){
  const n=2+Math.floor(random()*9);const r=table(n);r.players.forEach(p=>p.stack=20+Math.floor(random()*1000));const before=total(r);start(r);let steps=0;
  while(r.phase!=='showdown'&&steps++<500){const p=r.players.find(p=>p.id===r.turnId)!;const l=legal(r,p);const rand=random();if(rand<.15)move(r,'fold');else if(rand<.4&&l.canRaise){const amount=rand<.22?l.maxRaiseTo:Math.min(l.maxRaiseTo,l.minRaiseTo+Math.floor(random()*Math.max(0,l.maxRaiseTo-l.minRaiseTo)));move(r,'raise',amount);}else move(r,l.call?'call':'check');assert.equal(total(r),before);assert.ok(r.players.every(p=>p.stack>=0&&Number.isSafeInteger(p.stack)));}
  assert.equal(r.phase,'showdown');assert.equal(total(r),before);
 }
});

function reachTurn(r:Room){let n=0;while(r.phase!=='turn'&&n++<100)move(r,r.currentBet>r.players.find(p=>p.id===r.turnId)!.bet?'call':'check');assert.equal(r.phase,'turn');}
function rigRiver(r:Room,reds:number){
 const red=r.deck.filter(c=>/[hd]$/.test(c)).slice(0,reds),black=r.deck.find(c=>/[sc]$/.test(c))!;
 assert.equal(red.length,reds);const used=[...red,black];const remaining=r.deck.filter(c=>!used.includes(c));const burn=remaining.pop()!;
 r.deck=[...remaining,black,...red.slice().reverse(),burn];return{red,black};
}
test('Red River draws a red chain before a single river betting round',()=>{
 const r=table();approve(r,'redRiver');start(r);reachTurn(r);const {red,black}=rigRiver(r,3);
 while(r.phase==='turn')move(r,'check');assert.equal(r.phase,'river');assert.deepEqual(r.board.slice(4),[...red,black]);assert.equal(r.board.length,8);assert.ok(r.turnId);
 passive(r);assert.equal(total(r),3000);assert.equal(r.result!.board.length,8);assert.equal(r.logs.filter(log=>log.text==='River dealt.').length,1);
});
test('Red River with Pocket Trips evaluates more than nine cards and protects private cards',()=>{
 const r=table();approve(r,'pocketTrips');approve(r,'redRiver');start(r);reachTurn(r);rigRiver(r,4);while(r.phase==='turn')move(r,'check');assert.equal(r.board.length,9);
 assert.deepEqual(view(r,'token0').players[1].hole,['?','?','?']);passive(r);assert.equal(total(r),3000);assert.equal(r.result!.board.length,9);
});
test('a black Red River starts betting immediately without extra cards',()=>{const r=table();approve(r,'redRiver');start(r);reachTurn(r);rigRiver(r,0);while(r.phase==='turn')move(r,'check');assert.equal(r.board.length,5);passive(r);assert.equal(total(r),3000);});
test('Red River runs out safely after folds and if the deck is exhausted',()=>{
 const r=table(2);approve(r,'redRiver');start(r);reachTurn(r);rigRiver(r,2);move(r,'fold');assert.equal(r.phase,'showdown');assert.equal(r.board.length,7);assert.match(r.board.at(-1)!,/[sc]$/);assert.equal(total(r),2000);
 const short=table();approve(short,'redRiver');start(short);reachTurn(short);const reds=short.deck.filter(c=>/[hd]$/.test(c)).slice(0,2);short.deck=reds;
 while(short.phase==='turn')move(short,'check');assert.equal(short.phase,'river');assert.equal(short.deck.length,0);passive(short);assert.ok(short.logs.some(log=>log.text.includes('deck is exhausted')));assert.equal(total(short),3000);
});
test('Red River cannot queue alongside a conflicting board format; cancellation clears both new games',()=>{
 const r=table();approve(r,'redRiver');assert.throws(()=>approve(r,'ocean'),/board format/);approve(r,'potOrNot');act(r,'token0',{type:'cancelBounty'});assert.equal(r.redRiverNext,null);assert.equal(r.potOrNotNext,null);approve(r,'ocean');assert.throws(()=>approve(r,'redRiver'),/board format/);
});
test('Pot or Not snapshots each street wager, credits blinds, and disables raises',()=>{
 const r=table();approve(r,'potOrNot');start(r);assert.equal(r.currentBet,30);assert.equal(r.potOrNotBet,30);const p=r.players.find(p=>p.id===r.turnId)!;assert.equal(legal(r,p).canRaise,false);assert.throws(()=>move(r,'raise',60));move(r,'call');assert.equal(r.currentBet,30);move(r,'call');assert.equal(r.currentBet,30);move(r,'call');assert.equal(r.phase,'flop');assert.equal(r.currentBet,90);assert.equal(r.potOrNotBet,90);assert.deepEqual(r.players.map(p=>p.contributed),[30,30,30]);move(r,'call');assert.equal(r.currentBet,90);move(r,'call');assert.equal(r.currentBet,90);move(r,'call');assert.equal(r.phase,'turn');assert.equal(r.currentBet,360);passive(r);assert.equal(total(r),3000);
});
test('Pot or Not handles short all-ins, folding, and timeout without raising its wager',()=>{
 const r=table(2);r.players[0].stack=25;const before=total(r);approve(r,'potOrNot');start(r);move(r,'call');assert.equal(r.currentBet,30);move(r,'call');assert.equal(r.phase,'showdown');assert.equal(total(r),before);
 const folded=table(2);approve(folded,'potOrNot');start(folded);tick(folded,31001);assert.equal(folded.phase,'showdown');assert.equal(total(folded),2000);
});
test('Bomb pot, Strip Club, Red River and Pot or Not cooperate without skipping discards',()=>{
 const r=table();for(const kind of ['bomb','stripClub','redRiver','potOrNot'] as const)approve(r,kind,kind==='bomb'?10:0);start(r);assert.equal(r.phase,'flop');assert.ok(r.stripDiscard);assert.equal(r.potOrNotBet,30);assert.throws(()=>move(r,'call'),/turn to bet/);passive(r);assert.ok(r.players.every(p=>p.hole.length===2));assert.equal(r.logs.filter(l=>l.text.includes('discarded a card')).length,9);assert.equal(total(r),3000);
});
test('side-game default is one percent of all chips, including the pot, with a minimum of one',()=>{
 const r=table();assert.equal(defaultSideGameAmount(view(r,'token0')),30);start(r);assert.equal(defaultSideGameAmount(view(r,'token0')),30);passive(r);assert.equal(defaultSideGameAmount(view(r,'token0')),30);r.players.forEach(p=>p.stack=1);assert.equal(defaultSideGameAmount(view(r,'token0')),1);
});
test('large-board evaluator recognizes the strongest five without enumerating combinations',()=>{
 assert.deepEqual(evaluate(['As','Ks','Qs','Js','Ts','Ah','Ad','Ac','Kh','Kd','Kc','2d','3d']).rank,[8,14]);
 assert.deepEqual(evaluate(['As','Ah','Ad','Ks','Kh','Kd','Qs','Qh','Qd','2c']).rank,[6,14,13]);
 assert.deepEqual(evaluate(['As','Ks','9s','7s','4s','Ah','Kh','Qh','9h','6h','3d']).rank,[5,14,13,12,9,6]);
 assert.deepEqual(evaluate(newDeck()).rank,[8,14]);
});
test('Pot or Not does not invent a preflop wager when both blinds are already all in',()=>{
 const r=table();r.players[1].stack=10;r.players[2].stack=7;const before=total(r);approve(r,'potOrNot');start(r);assert.equal(r.currentBet,10);assert.equal(r.potOrNotBet,10);assert.equal(legal(r,r.players[0]).call,10);move(r,'call');assert.equal(r.phase,'showdown');assert.equal(total(r),before);
});

test('net chip results include fold losses and wins without counting bets as losses twice',()=>{
 const r=table(2);start(r);assert.deepEqual(r.players.map(p=>p.netChips),[0,0]);move(r,'fold');assert.deepEqual(r.players.map(p=>p.netChips),[-10,10]);
 const saved=JSON.parse(JSON.stringify(r)) as Room;assert.deepEqual(view(saved,'token0').players.map(p=>p.netChips),[-10,10]);
});
function headsUpResult(r:Room,winner:number){
 r.phase='river';r.board=['2c','3d','7h','8s','9c'];
 r.players.forEach((p,i)=>{p.inHand=true;p.folded=false;p.hole=i===winner?['As','Ad']:['Ks','Kd'];p.stack-=1000;p.contributed=1000;});settle(r);
}
test('net result survives multiple rebuys and includes later wins',()=>{
 const r=table(2);headsUpResult(r,0);assert.equal(r.players[1].netChips,-1000);act(r,'token1',{type:'rebuy'});assert.equal(r.players[1].netChips,-1000);
 headsUpResult(r,0);assert.equal(r.players[1].netChips,-2000);act(r,'token1',{type:'rebuy'});headsUpResult(r,1);assert.equal(r.players[1].netChips,-1000);assert.equal(r.players[0].netChips,1000);assert.equal(total(r),4000);
});
test('net includes side pots, bounty transfers and seven-deuce payments',()=>{
 const side=showdownFixture();settle(side);assert.deepEqual(side.players.map(p=>p.netChips),[200,0,-200]);
 const bounty=table();approve(bounty,'bounty',50);fixedWin(bounty,0);fixedWin(bounty,1);assert.deepEqual(bounty.players.map(p=>p.netChips),[60,60,-120]);
 const deuce=sevenDeuceWin();assert.deepEqual(deuce.players.map(p=>p.netChips),[120,-60,-60]);
});
test('older rooms begin a clearly marked tracker without inventing past results',()=>{
 const r=table(2);r.players.forEach(p=>delete p.netChips);r.players[0].stack=1500;assert.equal(tick(r,1000),true);assert.ok(r.players.every(p=>p.netChips===0&&p.netFromUpdate));assert.equal(tick(r,1000),false);
 start(r);move(r,'fold');assert.deepEqual(r.players.map(p=>p.netChips),[-10,10]);
});
test('sit-out queues during a hand and takes effect only at settlement',()=>{
 const r=table();start(r);const action=r.actionNo,turn=r.turnId,hole=[...r.players[0].hole];act(r,'token0',{type:'sit',out:true},1100);assert.equal(r.players[0].sittingOut,false);assert.equal(r.players[0].sitNext,true);assert.equal(r.actionNo,action);assert.equal(r.turnId,turn);assert.deepEqual(r.players[0].hole,hole);
 const saved=JSON.parse(JSON.stringify(r)) as Room;passive(saved);assert.equal(saved.players[0].sittingOut,true);assert.equal(saved.players[0].sitNext,null);start(saved);assert.equal(saved.players[0].inHand,false);assert.equal(saved.players[0].hole.length,0);
});
test('queued sit-out can be cancelled and queued sit-in waits until the next hand',()=>{
 const r=table();start(r);act(r,'token0',{type:'sit',out:true});act(r,'token0',{type:'sit',out:false});assert.equal(r.players[0].sitNext,null);passive(r);assert.equal(r.players[0].sittingOut,false);
 const paused=table();act(paused,'token2',{type:'sit',out:true});start(paused);act(paused,'token2',{type:'sit',out:false});assert.equal(paused.players[2].sittingOut,true);assert.equal(paused.players[2].sitNext,false);assert.equal(paused.players[2].inHand,false);passive(paused);assert.equal(paused.players[2].sittingOut,false);start(paused);assert.equal(paused.players[2].hole.length,2);
});
test('timeout settlement also applies queued seats; bounty participants can pause',()=>{
 const r=table(2);start(r);act(r,'token1',{type:'sit',out:true},1100);tick(r,31001);assert.equal(r.phase,'showdown');assert.equal(r.players[1].sittingOut,true);
 const bounty=table();approve(bounty,'bounty',50);start(bounty);act(bounty,'token0',{type:'sit',out:true});bounty.players.forEach(p=>{p.stack=1000;p.contributed=0;});fixedWin(bounty,0);assert.equal(bounty.players[0].sittingOut,true);assert.equal(bounty.bounty!.players.length,3);assert.throws(()=>act(bounty,'token0',{type:'leave'}),/bounty/);
});
test('emoji reactions are shared, bounded and do not change poker actions or timers',()=>{
 const r=table();start(r);const before=total(r),turn=r.turnId,action=r.actionNo,deadline=r.deadline;act(r,'token0',{type:'react',emoji:'🔥'},1100);
 assert.equal(view(r,'token1').players[0].reaction?.emoji,'🔥');assert.equal(r.turnId,turn);assert.equal(r.actionNo,action);assert.equal(r.deadline,deadline);assert.equal(total(r),before);
 assert.throws(()=>act(r,'token0',{type:'react',emoji:'😂'},1200),/moment/);act(r,'token0',{type:'react',emoji:'😂'},2700);assert.equal(r.players[0].reaction?.emoji,'😂');assert.throws(()=>act(r,'token0',{type:'react',emoji:'<script>' as never},4400),/table reactions/);tick(r,8800);assert.equal(r.players[0].reaction,undefined);assert.equal(r.actionNo,action);
});
function rigBothRivers(r:Room,firstReds=2,secondReds=3){
 const reds=r.deck.filter(c=>/[hd]$/.test(c)).slice(0,firstReds+secondReds),blacks=r.deck.filter(c=>/[sc]$/.test(c)).slice(0,4+(firstReds===0?1:0)+(secondReds===0?1:0));
 const remaining=r.deck.filter(card=>![...reds,...blacks].includes(card));let bi=0;const burnI=blacks[bi++],burnII=blacks[bi++];
 const first=reds.slice(0,firstReds),second=reds.slice(firstReds);if(firstReds===0)first.push(blacks[bi++]);if(secondReds===0)second.push(blacks[bi++]);
 if(firstReds)first.push(blacks[bi++]);if(secondReds)second.push(blacks[bi++]);
 const drawn=[burnI,first[0],burnII,second[0],...first.slice(1),...second.slice(1)];r.deck=[...remaining,...drawn.reverse()];return{first,second};
}
test('Double Barrel and Red River can be voted in either order',()=>{
 for(const order of [['doubleBarrel','redRiver'],['redRiver','doubleBarrel']] as const){const r=table();order.forEach(kind=>approve(r,kind));assert.ok(r.doubleBarrelNext&&r.redRiverNext);assert.throws(()=>approve(r,'ocean'),/board format/);assert.throws(()=>approve(r,'dieRiver'),/board format/);start(r);assert.ok(r.isDoubleBarrel&&r.isRedRiver);passive(r);assert.equal(total(r),3000);assert.equal(r.players.reduce((sum,p)=>sum+(p.netChips||0),0),0);}
});
test('Red River extends each board independently before the shared final betting round',()=>{
 const r=table();approve(r,'doubleBarrel');approve(r,'redRiver');start(r);reachTurn(r);const expected=rigBothRivers(r);
 while(r.phase==='turn')move(r,'check');assert.equal(r.phase,'river');assert.deepEqual(r.board.slice(4),expected.first);assert.deepEqual(r.boardTwo.slice(4),expected.second);assert.equal(r.board.length,7);assert.equal(r.boardTwo.length,8);assert.ok(r.turnId);
 passive(r);assert.deepEqual(r.result!.boardTwo,r.boardTwo);assert.equal(total(r),3000);assert.equal(new Set([...r.players.flatMap(p=>p.hole),...r.board,...r.boardTwo]).size,21);
});
test('a black first-board river can coexist with a red second-board river',()=>{
 const r=table();approve(r,'redRiver');approve(r,'doubleBarrel');start(r);reachTurn(r);rigBothRivers(r,0,2);while(r.phase==='turn')move(r,'check');assert.equal(r.board.length,5);assert.equal(r.boardTwo.length,7);passive(r);assert.equal(total(r),3000);
});
test('both Red River boards run out after all-ins or folds without exhausting a base board',()=>{
 for(const finish of ['all-in','fold'] as const){const r=table();approve(r,'doubleBarrel');approve(r,'redRiver');start(r);reachTurn(r);rigBothRivers(r);
 if(finish==='fold'){move(r,'fold');move(r,'fold');}else{move(r,'raise',legal(r,r.players.find(p=>p.id===r.turnId)!).maxRaiseTo);move(r,'call');move(r,'call');}
 assert.equal(r.phase,'showdown');assert.equal(r.board.length,7);assert.equal(r.boardTwo.length,8);assert.equal(total(r),3000);}
});
test('Double Barrel + Red River handles a finite deck and works with Bomb Pot',()=>{
 const r=table();approve(r,'doubleBarrel');approve(r,'redRiver');start(r);reachTurn(r);const reds=r.deck.filter(c=>/[hd]$/.test(c)).slice(0,6);r.deck=reds;while(r.phase==='turn')move(r,'check');assert.ok(r.board.length>=5&&r.boardTwo.length>=5);passive(r);assert.equal(total(r),3000);assert.ok(r.logs.some(log=>log.text.includes('Board II: the deck is exhausted')));
 const bomb=table();approve(bomb,'bomb',10);approve(bomb,'redRiver');approve(bomb,'doubleBarrel');start(bomb);assert.equal(bomb.phase,'flop');assert.equal(bomb.board.length,3);assert.equal(bomb.boardTwo.length,3);passive(bomb);assert.equal(total(bomb),3000);
});
test('ten-player Pocket Trips, Double Barrel, Red River and Pot or Not conserve chips and net results',()=>{
 for(let hand=0;hand<12;hand++){
  const r=table(10);for(const kind of ['pocketTrips','doubleBarrel','redRiver','potOrNot'] as const)approve(r,kind);start(r);passive(r);
  assert.ok(r.board.length>=5&&r.boardTwo.length>=5);assert.equal(total(r),10000);assert.equal(r.players.reduce((sum,p)=>sum+(p.netChips||0),0),0);
  for(const p of r.players)assert.equal(p.netChips,p.stack-1000);
  const exposed=[...r.players.flatMap(p=>p.hole),...r.board,...r.boardTwo];assert.equal(new Set(exposed).size,exposed.length);
 }
});
