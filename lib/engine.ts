import { randomInt, randomUUID } from 'node:crypto';
import { evaluate,compare } from './evaluator';
import type { Action,Player,Room,RoomView,Settings } from './types';
export class GameError extends Error { constructor(message:string,public status=400){super(message);} }
function fail(message:string):never{throw new GameError(message);}
const idle=(r:Room)=>r.phase==='waiting'||r.phase==='showdown';
const active=(r:Room)=>r.players.filter(p=>p.inHand&&!p.folded);
const ready=(r:Room)=>r.players.filter(p=>!p.sittingOut&&p.stack>0);
function log(r:Room,text:string){r.logs.push({id:randomUUID(),text});r.logs=r.logs.slice(-50);}
function next(r:Room,seat:number,list:Player[]):Player { return [...list].sort((a,b)=>((a.seat-seat+10)%10||10)-((b.seat-seat+10)%10||10))[0]; }
function pay(p:Player,n:number){const paid=Math.min(n,p.stack);p.stack-=paid;p.bet+=paid;p.contributed+=paid;p.allIn=p.stack===0;return paid;}
function deal(r:Room,n:number){return Array.from({length:n},()=>r.deck.pop()!);}
function streetCards(r:Room,n:number){deal(r,1);r.board.push(...deal(r,n));}
export function newDeck(){const deck=[...'shdc'].flatMap(s=>[...'23456789TJQKA'].map(v=>v+s));for(let i=51;i>0;i--){const j=randomInt(i+1);[deck[i],deck[j]]=[deck[j],deck[i]];}return deck;}
function newPlayer(name:string,tokenHash:string,seat:number,stack:number,now:number):Player{return{id:randomUUID(),tokenHash,name,seat,stack,bet:0,contributed:0,hole:[],inHand:false,folded:false,allIn:false,sittingOut:false,actedBet:null,lastAction:'Ready',lastSeen:now};}
export function createRoom(code:string,name:string,playerName:string,tokenHash:string,settings:Settings,now=Date.now()):Room {
 const p=newPlayer(playerName,tokenHash,0,settings.startingStack,now);
 return{code,name,hostId:p.id,settings:{...settings},players:[p],version:0,handNo:0,actionNo:0,dealerSeat:-1,phase:'waiting',deck:[],board:[],currentBet:0,minRaise:settings.bigBlind,turnId:null,deadline:null,vote:null,bombNext:null,oceanNext:null,dieRiverNext:null,pocketTripsNext:null,isBomb:false,isOcean:false,isDieRiver:false,isPocketTrips:false,dieRiverRoll:null,bounty:null,sevenDeuce:null,result:null,logs:[{id:randomUUID(),text:`${p.name} opened the table.`}],receipts:[],createdAt:now};
}
export function joinRoom(r:Room,name:string,tokenHash:string,now=Date.now()) {
 const existing=r.players.find(p=>p.tokenHash===tokenHash);if(existing){existing.lastSeen=now;return;}
 if(r.bounty)fail('A bounty game is running. Join after it finishes or is cancelled.');
 if(r.players.length>=r.settings.maxPlayers)fail('This table is full.');
 if(r.players.some(p=>p.name.toLowerCase()===name.toLowerCase()))fail('That name is already at the table. Choose another.');
 const seat=Array.from({length:10},(_,i)=>i).find(s=>!r.players.some(p=>p.seat===s))!;
 r.players.push(newPlayer(name,tokenHash,seat,r.settings.startingStack,now));r.vote=null;r.bombNext=null;r.oceanNext=null;r.dieRiverNext=null;r.pocketTripsNext=null;log(r,`${name} joined${idle(r)?' the table':' · playing next hand'}.`);
}
export function authenticate(r:Room,hash:string){const p=r.players.find(p=>p.tokenHash===hash);if(!p)throw new GameError('Join this room to take a seat.',401);return p;}
export function legal(r:Room,p:Player){const call=Math.min(p.stack,Math.max(0,r.currentBet-p.bet));const otherCanBet=active(r).some(o=>o.id!==p.id&&o.stack>0);return{call,minRaiseTo:r.currentBet<r.settings.bigBlind?r.settings.bigBlind:r.currentBet+r.minRaise,maxRaiseTo:p.bet+p.stack,canRaise:otherCanBet&&(p.actedBet===null||r.currentBet-p.actedBet>=r.minRaise)&&p.bet+p.stack>r.currentBet};}
function turn(r:Room,p:Player,now:number){r.turnId=p.id;r.deadline=r.settings.turnSeconds===0?null:now+r.settings.turnSeconds*1000;}
function releaseLegacyBountyReserve(r:Room){
 const reserve=r.bounty?.reserve;if(!reserve)return;
 for(const id of r.bounty!.players){const p=r.players.find(p=>p.id===id);if(p)p.stack+=reserve;}
}
function cancelBounty(r:Room){if(!r.bounty)return;releaseLegacyBountyReserve(r);r.bounty=null;}
function releaseLegacySevenDeuceReserve(r:Room){if(!r.sevenDeuce?.reserves)return;for(const [id,reserve] of Object.entries(r.sevenDeuce.reserves)){const p=r.players.find(p=>p.id===id);if(p)p.stack+=reserve;}delete r.sevenDeuce.reserves;delete r.sevenDeuce.reserve;delete r.sevenDeuce.players;}
function cancelSevenDeuce(r:Room){if(!r.sevenDeuce)return;releaseLegacySevenDeuceReserve(r);r.sevenDeuce=null;}
function bountyResult(r:Room,winningIds:string[]){
 const b=r.bounty;if(!b)return;
 b.won=[...new Set([...b.won,...winningIds.filter(id=>b.players.includes(id))])];
 const remaining=b.players.filter(id=>!b.won.includes(id));
 if(remaining.length>1)return;
 if(!remaining.length){cancelBounty(r);log(r,'Bounty tied: everyone earned a win, so nobody pays.');return;}
 const loser=r.players.find(p=>p.id===remaining[0])!;
 // Older rooms may already have escrowed this side bet. Restore that escrow first,
 // then use the current direct-settlement rule for every bounty round.
 releaseLegacyBountyReserve(r);
 const opponents=b.players.filter(id=>id!==loser.id);loser.stack-=b.amount*opponents.length;
 for(const id of opponents){const winner=r.players.find(p=>p.id===id);if(winner)winner.stack+=b.amount;}
 log(r,`${loser.name} was last without a win and paid ${b.amount.toLocaleString()} to each player. Bounty complete.`);r.bounty=null;
}
function sevenDeuceResult(r:Room,winningIds:string[]){
 const game=r.sevenDeuce;if(!game)return;
 const participants=r.players.filter(p=>p.inHand);
 const qualifiers=winningIds.map(id=>r.players.find(p=>p.id===id)).filter((p):p is Player=>!!p&&p.inHand&&p.hole.some(c=>c[0]==='7')&&p.hole.some(c=>c[0]==='2'));
 if(!qualifiers.length)return;
 r.result!.revealed=[...new Set([...r.result!.revealed,...qualifiers.map(p=>p.id)])];
 for(const winner of qualifiers){
  let collected=0;for(const payer of participants){if(payer.id===winner.id)continue;const paid=Math.min(game.amount,payer.stack);payer.stack-=paid;winner.stack+=paid;collected+=paid;}
  log(r,`${winner.name} shows 7-2 and collects ${collected.toLocaleString()} chips from the table.`);
 }
}
/** Settle each contribution tier independently; unmatched excess is a refund, never a hand win. */
export function settle(r:Room){
 const players=r.players.filter(p=>p.inHand);const alive=active(r);
 const levels=[...new Set(players.map(p=>p.contributed).filter(Boolean))].sort((a,b)=>a-b);
 const payouts=new Map<string,{id:string;amount:number;hand:string}>();let previous=0;let mainWinners:string[]=[];
 for(const [index,level] of levels.entries()){
  const contributors=players.filter(p=>p.contributed>=level);const amount=(level-previous)*contributors.length;previous=level;
  let eligible=contributors.filter(p=>!p.folded);if(!eligible.length)eligible=alive;
  if(contributors.length===1){contributors[0].stack+=amount;continue;}
  let winners:Player[];let hand='Uncontested';
  if(eligible.length===1)winners=eligible;
  else {const ranked=eligible.map(p=>({p,...evaluate([...p.hole,...r.board])})).sort((a,b)=>compare(b.rank,a.rank));winners=ranked.filter(x=>compare(x.rank,ranked[0].rank)===0).map(x=>x.p);hand=ranked[0].name;}
  winners.sort((a,b)=>((a.seat-r.dealerSeat+10)%10||10)-((b.seat-r.dealerSeat+10)%10||10));
  if(index===0)mainWinners=winners.map(p=>p.id);
  winners.forEach((p,i)=>{const won=Math.floor(amount/winners.length)+(i<amount%winners.length?1:0);p.stack+=won;const prior=payouts.get(p.id);payouts.set(p.id,{id:p.id,amount:won+(prior?.amount||0),hand:prior?.hand||hand});});
 }
 const list=[...payouts.values()];const text=list.map(x=>`${players.find(p=>p.id===x.id)!.name} wins ${x.amount.toLocaleString()}${x.hand==='Uncontested'?'':` · ${x.hand}`}`).join(' / ')||'Uncalled chips returned.';
 r.result={text,winners:list.map(p=>p.id),payouts:list,board:[...r.board],revealed:[]};r.phase='showdown';r.turnId=null;r.deadline=null;log(r,text);bountyResult(r,mainWinners);sevenDeuceResult(r,mainWinners);
}
function runOutBoard(r:Room){
 const target=r.isOcean?6:5;
 while(r.board.length<target)streetCards(r,r.board.length===0?3:1);
 log(r,'The remaining community cards were shown after the fold.');
}
function rollDieOnRiver(r:Room){
 if(!r.isDieRiver||r.dieRiverRoll!==null)return;
 const roll=randomInt(1,7);r.dieRiverRoll=roll;
 if(roll===6){log(r,'Die on the River rolled 6. The board stays intact.');return;}
 const old=r.board[roll-1];const replacement=deal(r,1)[0];r.board[roll-1]=replacement;log(r,`Die on the River rolled ${roll}. ${old} was replaced by ${replacement}.`);
}
function advance(r:Room,afterSeat:number,now:number){
 const alive=active(r);if(alive.length===1){runOutBoard(r);settle(r);return;}
 const canAct=alive.filter(p=>p.stack>0);
 const pending=canAct.filter(p=>p.bet<r.currentBet||p.actedBet===null);
 // A lone funded player may only answer an outstanding wager; no dry-side-pot betting.
 if(pending.length&&(canAct.length>1||pending[0].bet<r.currentBet)){turn(r,next(r,afterSeat,pending),now);return;}
 if(r.phase==='river')rollDieOnRiver(r);
 if(r.phase==='ocean'||r.phase==='river'&&!r.isOcean){settle(r);return;}
 r.phase=r.phase==='preflop'?'flop':r.phase==='flop'?'turn':r.phase==='turn'?'river':'ocean';streetCards(r,r.phase==='flop'?3:1);
 r.currentBet=0;r.minRaise=r.settings.bigBlind;
 for(const p of r.players){p.bet=0;p.actedBet=null;if(p.inHand&&!p.folded&&!p.allIn)p.lastAction='';}
 log(r,`${r.phase[0].toUpperCase()+r.phase.slice(1)} dealt.`);
 if(canAct.length<2){advance(r,r.dealerSeat,now);return;}
 turn(r,next(r,r.dealerSeat,canAct),now);
}
function start(r:Room,now:number){
 if(!idle(r))fail('Finish the current hand first.');
 if(r.vote)fail('Resolve the table vote first.');
 const players=ready(r);if(players.length<2)fail('At least two players with chips must be ready.');
 if(r.bombNext&&(!sameIds(players.map(p=>p.id),r.bombNext.players)||players.some(p=>p.stack<r.bombNext!.amount)))fail('The bomb-pot lineup or stacks changed. Cancel it with a new vote or restore the lineup.');
 if(r.oceanNext&&!sameIds(players.map(p=>p.id),r.oceanNext.players))fail('The Ocean lineup changed. Cancel it with a new vote or restore the lineup.');
 if(r.dieRiverNext&&!sameIds(players.map(p=>p.id),r.dieRiverNext.players))fail('The Die on the River lineup changed. Cancel it with a new vote or restore the lineup.');
 if(r.pocketTripsNext&&!sameIds(players.map(p=>p.id),r.pocketTripsNext.players))fail('The Pocket Trips lineup changed. Cancel it with a new vote or restore the lineup.');
 r.deck=newDeck();r.board=[];r.result=null;r.handNo++;r.actionNo++;r.phase='preflop';r.currentBet=0;r.minRaise=r.settings.bigBlind;r.isBomb=!!r.bombNext;r.isOcean=!!r.oceanNext;r.isDieRiver=!!r.dieRiverNext;r.isPocketTrips=!!r.pocketTripsNext;r.dieRiverRoll=null;r.oceanNext=null;r.dieRiverNext=null;r.pocketTripsNext=null;
 r.dealerSeat=next(r,r.dealerSeat,players).seat;
 for(const p of r.players){p.inHand=players.includes(p);p.hole=[];p.folded=false;p.allIn=false;p.bet=0;p.contributed=0;p.actedBet=null;p.lastAction=p.inHand?'':'Sitting out';}
 const order=[...players].sort((a,b)=>((a.seat-r.dealerSeat+10)%10||10)-((b.seat-r.dealerSeat+10)%10||10));
 for(let i=0;i<(r.isPocketTrips?3:2);i++)for(const p of order)p.hole.push(...deal(r,1));
 log(r,`Hand #${r.handNo}${r.isBomb?' · Bomb pot':''}${r.isOcean?' · Ocean':''}${r.isDieRiver?' · Die on the River':''}${r.isPocketTrips?' · Pocket Trips':''}.`);
 if(r.bombNext){const amount=r.bombNext.amount;for(const p of players){pay(p,amount);p.bet=0;p.lastAction=`Ante ${amount}`;}r.bombNext=null;r.phase='flop';streetCards(r,3);advance(r,r.dealerSeat,now);return;}
 const dealer=players.find(p=>p.seat===r.dealerSeat)!;
 const sb=players.length===2?dealer:next(r,r.dealerSeat,players);const bb=next(r,sb.seat,players);
 pay(sb,r.settings.smallBlind);sb.lastAction=`SB ${sb.bet}`;pay(bb,r.settings.bigBlind);bb.lastAction=`BB ${bb.bet}`;
 r.currentBet=r.settings.bigBlind;advance(r,bb.seat,now);
}
function sameIds(a:string[],b:string[]){return a.length===b.length&&a.every(id=>b.includes(id));}
const votesNeeded=(v:{voters:string[]})=>Math.max(1,v.voters.length-1);
function bet(r:Room,p:Player,move:'fold'|'check'|'call'|'raise',amount:number|undefined,now:number){
 if(r.turnId!==p.id||idle(r))fail('It is not your turn.');
 const l=legal(r,p);
 if(move==='fold'){p.folded=true;p.lastAction='Fold';}
 if(move==='check'){if(l.call>0)fail('Call or fold to answer the bet.');p.lastAction='Check';}
 if(move==='call'){if(!l.call)fail('There is no bet to call.');const paid=pay(p,l.call);p.lastAction=p.allIn?`All in · ${p.bet}`:`Call ${paid}`;}
 if(move==='raise'){
  if(!l.canRaise)fail('Betting has not reopened, or nobody can call a raise.');
  if(!Number.isSafeInteger(amount)||amount!<=r.currentBet||amount!>l.maxRaiseTo)fail('Choose a valid total bet.');
  if(amount!<l.minRaiseTo&&amount!==l.maxRaiseTo)fail(`The minimum total bet is ${l.minRaiseTo}.`);
  const increase=amount!-r.currentBet;if(amount!>=l.minRaiseTo)r.minRaise=r.currentBet<r.settings.bigBlind?Math.max(r.settings.bigBlind,increase):increase;
  pay(p,amount!-p.bet);r.currentBet=amount!;p.lastAction=p.allIn?`All in · ${p.bet}`:`Raise to ${p.bet}`;
 }
 p.actedBet=r.currentBet;r.actionNo++;log(r,`${p.name}: ${p.lastAction}.`);advance(r,p.seat,now);
}
function approveVote(r:Room){
 const v=r.vote!;const ps=ready(r);
 if(!sameIds(r.players.map(p=>p.id),v.voters))fail('The players in the session changed. Propose a new vote.');
 if(v.kind==='bomb'){
  if(ps.some(p=>p.stack<v.amount))fail('Everyone needs enough chips for this ante.');
  r.bombNext={amount:v.amount,players:ps.map(p=>p.id)};log(r,`Bomb pot approved: ${v.amount} each on the next hand.`);
 }else if(v.kind==='bounty'){
  if(r.bounty)fail('A bounty round is already running.');
  const liability=v.amount*(ps.length-1);if(ps.some(p=>p.stack<liability))fail(`Everyone needs at least ${liability} chips to cover this bounty.`);
  r.bounty={amount:v.amount,players:ps.map(p=>p.id),won:[]};log(r,`Bounty round started: the last player without a win will pay ${v.amount} to each opponent.`);
 }else if(v.kind==='sevenDeuce'){
  if(r.sevenDeuce)fail('A 7-2 game is already running.');
  r.sevenDeuce={amount:v.amount};log(r,`7-2 game started for the session: direct payments happen after every qualifying hand.`);
 }else if(v.kind==='ocean'){
  r.oceanNext={players:ps.map(p=>p.id)};log(r,'Ocean approved: the next hand gets a sixth community card and betting round.');
 }else if(v.kind==='dieRiver'){
  r.dieRiverNext={players:ps.map(p=>p.id)};log(r,'Die on the River approved for the next hand.');
 }else{
  r.pocketTripsNext={players:ps.map(p=>p.id)};log(r,'Pocket Trips approved: everyone gets three hole cards next hand.');
 }
 r.vote=null;
}
export function act(r:Room,hash:string,a:Action,now=Date.now()){
 const p=authenticate(r,hash);p.lastSeen=now;
 if(a.type==='act'){if(a.expectedAction!==r.actionNo)fail('The action changed. Review the table and try again.');bet(r,p,a.move,a.amount,now);return;}
 if(a.type==='theme'){if(p.id!==r.hostId)fail('Only the host can change the deck.');r.settings.theme=a.theme;return;}
 if(!idle(r))fail('This option is available between hands.');
 if(a.type==='show'){
  if(r.phase!=='showdown'||!r.result||!p.inHand||p.hole.length<2)fail('You can show cards only after a hand you played.');
  if(!r.result.revealed.includes(p.id)){r.result.revealed.push(p.id);log(r,`${p.name} shows ${p.hole.join(' ')}.`);}return;
 }
 if(a.type==='start'){if(p.id!==r.hostId)fail('Only the host can deal.');start(r,now);return;}
 if(a.type==='seats'){
  if(p.id!==r.hostId)fail('Only the host can change the number of seats.');
  if(!Number.isSafeInteger(a.maxPlayers)||a.maxPlayers<2||a.maxPlayers>10)fail('Choose between 2 and 10 seats.');
  if(a.maxPlayers<r.players.length)fail(`At least ${r.players.length} seats are needed for the players at the table.`);
  const dealer=r.players.find(player=>player.seat===r.dealerSeat);const ordered=[...r.players].sort((x,y)=>x.seat-y.seat);
  if(ordered.some(player=>player.seat>=a.maxPlayers))ordered.forEach((player,index)=>player.seat=index);
  r.dealerSeat=dealer?.seat??-1;r.settings.maxPlayers=a.maxPlayers;log(r,`${p.name} changed the table to ${a.maxPlayers} seats.`);return;
 }
 if(a.type==='propose'){
  if(r.vote)fail('There is already a vote open.');if(a.kind==='bounty'&&r.bounty)fail('A bounty round is already running.');if(a.kind==='sevenDeuce'&&r.sevenDeuce)fail('A 7-2 game is already running.');
  const ps=ready(r);if(ps.length<2||!ps.includes(p))fail('At least two ready players are needed.');
  const usesAmount=['bomb','bounty','sevenDeuce'].includes(a.kind);
  if(usesAmount&&(!Number.isSafeInteger(a.amount)||a.amount<1||a.amount>100000))fail('Choose an amount from 1 to 100,000.');
  if(a.kind==='bomb'&&ps.some(p=>p.stack<a.amount)||a.kind==='bounty'&&ps.some(p=>p.stack<=a.amount*(ps.length-1)))fail('The amount is too high for a player’s stack.');
  const labels={bomb:'bomb pot',bounty:'bounty round',sevenDeuce:'7-2 game',ocean:'Ocean hand',dieRiver:'Die on the River hand',pocketTrips:'Pocket Trips hand'} as const;
  r.vote={id:randomUUID(),kind:a.kind,amount:usesAmount?a.amount:0,voters:r.players.map(p=>p.id),yes:[p.id],expiresAt:now+120000};log(r,`${p.name} proposed a ${labels[a.kind]}${usesAmount?` for ${a.amount} each.`:'.'}`);if(r.vote.yes.length>=votesNeeded(r.vote))approveVote(r);return;
 }
 if(a.type==='vote'){
  const v=r.vote;if(!v||v.id!==a.voteId)fail('This vote has ended.');if(!v.voters.includes(p.id))fail('Only players in this lineup can vote.');
  if(!a.yes){log(r,`${p.name} passed on the vote.`);return;}
  if(!v.yes.includes(p.id))v.yes.push(p.id);if(v.yes.length>=votesNeeded(v))approveVote(r);return;
 }
 if(a.type==='cancelBounty'){if(p.id!==r.hostId)fail('Only the host can cancel side games.');cancelBounty(r);cancelSevenDeuce(r);r.bombNext=null;r.oceanNext=null;r.dieRiverNext=null;r.pocketTripsNext=null;r.vote=null;log(r,'Side games cancelled.');return;}
 if(a.type==='rebuy'){if(p.stack>0)fail('Rebuy when your stack is empty.');p.stack=r.settings.startingStack;p.sittingOut=false;r.vote=null;r.bombNext=null;r.oceanNext=null;r.dieRiverNext=null;r.pocketTripsNext=null;log(r,`${p.name} rebought ${p.stack.toLocaleString()} play chips.`);return;}
 if(a.type==='sit'||a.type==='leave'){
  if(r.bounty)fail('Finish or ask the host to cancel the bounty game before changing the lineup.');
  r.vote=null;r.bombNext=null;r.oceanNext=null;r.dieRiverNext=null;r.pocketTripsNext=null;
  if(a.type==='sit'){p.sittingOut=a.out;log(r,`${p.name} ${a.out?'is sitting out':'is ready to play'}.`);return;}
  r.players=r.players.filter(x=>x!==p);if(r.hostId===p.id)r.hostId=r.players[0]?.id||'';log(r,`${p.name} left the table.`);return;
 }
}
/** Called on reads as well as writes: deadlines survive serverless restarts. */
export function tick(r:Room,now=Date.now()):boolean{
 let changed=false;
 if(r.bounty?.reserve){releaseLegacyBountyReserve(r);delete r.bounty.reserve;log(r,'Bounty escrow released. Future payment will happen when the bounty ends.');changed=true;}
 if(r.sevenDeuce?.reserves){releaseLegacySevenDeuceReserve(r);log(r,'7-2 escrow released. Future payments happen after qualifying hands.');changed=true;}
 if(r.vote&&r.vote.expiresAt<=now){r.vote=null;log(r,'The table vote expired.');changed=true;}
 if(r.turnId&&r.deadline&&r.deadline<=now){const p=r.players.find(p=>p.id===r.turnId)!;const move=r.currentBet>p.bet?'fold':'check';bet(r,p,move,undefined,now);log(r,`${p.name} timed out · automatic ${move}.`);changed=true;}
 const host=r.players.find(p=>p.id===r.hostId);if(host&&now-host.lastSeen>90000){const replacement=r.players.find(p=>p.id!==host.id&&now-p.lastSeen<30000);if(replacement){r.hostId=replacement.id;log(r,`${replacement.name} is now the host.`);changed=true;}}
 return changed;
}
export function view(r:Room,hash:string,localMode=false):RoomView{
 const me=authenticate(r,hash);const{deck:_deck,receipts:_receipts,players,...publicRoom}=r;
 const showdown=r.phase==='showdown'&&active(r).length>1;
 return{...publicRoom,players:players.map(p=>{const{tokenHash:_token,actedBet:_acted,...rest}=p;const forcedReveal=r.result?.revealed?.includes(p.id);return{...rest,hole:p.id===me.id||(showdown&&p.inHand&&!p.folded)||forcedReveal?p.hole:p.hole.map(()=>'?')};}),me:me.id,pot:idle(r)?0:players.reduce((s,p)=>s+p.contributed,0),legal:r.turnId===me.id?legal(r,me):null,localMode};
}
