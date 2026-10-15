import {advancePool,createPoolGame,poolMoving,strikePool,type PoolGame,POOL_STEP} from './pool-physics';
import {GameError} from './engine';

export interface PoolShot {id:string;by:string;startAt:number;finishAt:number;initial:PoolGame;final:PoolGame;dx:number;dz:number;power:number;pocketed:number[];scratch:boolean}
export interface PoolMatch {version:number;players:{id:string;seenAt:number}[];scores:Record<string,number>;turnId:string|null;winnerId:string|null;game:PoolGame;shot:PoolShot|null;message:string}
export type PoolCommand={type:'join'|'leave'|'heartbeat'|'rematch'}|{type:'shoot';id:string;version:number;dx:number;dz:number;power:number};
export function createPoolMatch():PoolMatch {return{version:0,players:[],scores:{},turnId:null,winnerId:null,game:createPoolGame(),shot:null,message:'Two players · first to pocket 8 balls wins.'};}
export const POOL_LEASE=90000;
export function expirePoolPlayers(match:PoolMatch,ids:string[],now:number){
  const gone=match.players.filter(p=>!ids.includes(p.id)||now-p.seenAt>POOL_LEASE);
  if(!gone.length)return false;
  match.players=match.players.filter(p=>!gone.includes(p));
  if(match.players.length===1&&!match.winnerId){match.winnerId=match.players[0].id;match.turnId=null;match.message='Your opponent left. You win by forfeit.';}
  if(!match.players.length)Object.assign(match,createPoolMatch(),{version:match.version});
  return true;
}
function newRack(match:PoolMatch,now:number){match.game=createPoolGame();match.shot=null;match.scores=Object.fromEntries(match.players.map(p=>[p.id,0]));match.winnerId=null;match.turnId=match.players.length===2?match.players[0].id:null;match.message=match.turnId?'Match on. First to 8 balls. Pocket a ball to keep your turn; a scratch passes the turn.':'Waiting for a second player…';match.players.forEach(p=>p.seenAt=now);}
/** Friendly score-race rules. Physics and turn ownership are always server-authoritative. */
export function applyPoolCommand(match:PoolMatch,me:string,command:PoolCommand,now:number):boolean {
  const member=match.players.find(p=>p.id===me);
  if(command.type==='join'){
    if(member){member.seenAt=now;return true;}
    if(match.players.length===2)throw new GameError('Both pool seats are taken. You can watch the match.',409);
    match.players.push({id:me,seenAt:now});newRack(match,now);return true;
  }
  if(command.type==='leave'){
    if(!member)return false;
    match.players=match.players.filter(p=>p.id!==me);
    if(match.players.length){match.winnerId=match.players[0].id;match.turnId=null;match.message='Your opponent left. You win by forfeit.';}
    else Object.assign(match,createPoolMatch(),{version:match.version});
    return true;
  }
  if(!member)throw new GameError('Join the pool match first.',403);
  if(command.type==='heartbeat'){member.seenAt=now;return true;}
  if(command.type==='rematch'){
    if(match.shot&&now<match.shot.finishAt)throw new GameError('Wait for the balls to stop rolling.',409);
    if(match.players.length!==2||!match.winnerId)throw new GameError('Finish this match before starting another.',409);
    newRack(match,now);return true;
  }
  if(command.type!=='shoot')return false;
  // Retrying a request with the same id never takes a second shot.
  if(match.shot?.id===command.id){if(match.shot.by!==me)throw new GameError('Invalid shot id.',409);return false;}
  if(match.version!==command.version)throw new GameError('The pool table changed. Wait for the current state and try again.',409);
  if(match.players.length!==2||match.winnerId)throw new GameError('Wait for an opponent or start a rematch.',409);
  if(match.turnId!==me)throw new GameError('It is your opponent’s turn.',409);
  if(match.shot&&now<match.shot.finishAt)throw new GameError('Wait for the balls to stop rolling.',409);
  if(![command.dx,command.dz,command.power].every(Number.isFinite)||Math.hypot(command.dx,command.dz)<.001||command.power<.04||command.power>1)throw new GameError('Invalid pool shot.');
  const initial=structuredClone(match.game),final=structuredClone(initial);
  if(!strikePool(final,command.dx,command.dz,command.power))throw new GameError('The cue ball is not ready.',409);
  let steps=0;while(poolMoving(final)&&steps<7200){advancePool(final,POOL_STEP);steps++;}
  if(poolMoving(final))throw new GameError('That shot could not be resolved. Try again.',409);
  const pocketed=final.balls.filter(b=>b.id>0&&b.pocketed&&!initial.balls.find(a=>a.id===b.id)!.pocketed).map(b=>b.id);
  const score=final.scratched?0:pocketed.length;
  match.scores[me]=(match.scores[me]||0)+score;
  const opponent=match.players.find(p=>p.id!==me)!.id;
  // There are only 15 object balls; if scratches removed balls, highest score wins at rack end.
  const cleared=final.balls.every(b=>b.id===0||b.pocketed);
  if(match.scores[me]>=8||cleared){
    const a=match.scores[me],b=match.scores[opponent]||0;
    match.winnerId=a===b?'draw':a>b?me:opponent;match.turnId=null;match.message=a===b?'Rack tied. Play a rematch.':'Match finished.';
  }else{match.turnId=score>0?me:opponent;match.message=final.scratched?'Scratch — no points this shot. Opponent’s turn.':score?`${score} ball${score===1?'':'s'} pocketed. Shoot again.`:'No ball pocketed. Turn passes.';}
  const startAt=now+200;match.shot={id:command.id,by:me,startAt,finishAt:startAt+steps*POOL_STEP*1000,initial,final,dx:command.dx,dz:command.dz,power:command.power,pocketed,scratch:final.scratched};
  match.game=final;member.seenAt=now;return true;
}
export {poolGameAt} from './pool-playback';
