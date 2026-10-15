import type {PoolMatch} from './pool-match';
import {advancePool,strikePool,type PoolGame} from './pool-physics';

/** Replay the same fixed physics steps for late arrivals; final positions come from storage. */
export function poolGameAt(match:PoolMatch,now:number):PoolGame {
  const shot=match.shot;if(!shot||now>=shot.finishAt)return structuredClone(match.game);
  const game=structuredClone(shot.initial);if(now<shot.startAt)return game;
  strikePool(game,shot.dx,shot.dz,shot.power);
  let remaining=(now-shot.startAt)/1000;while(remaining>0){const step=Math.min(.1,remaining);advancePool(game,step);remaining-=step;}
  return game;
}

export interface PoolReplay {game:PoolGame;version:number;shotId:string;clock:number;started:boolean;settled:boolean}
/** Handles packets that arrive before launch, mid-shot, after a pause, or after settlement. */
export function syncPoolPlayback(previous:PoolReplay|null,match:PoolMatch,now:number):PoolReplay {
  const shot=match.shot;
  if(!previous||previous.shotId!==(shot?.id||'')||!shot&&previous.version!==match.version){
    return{game:poolGameAt(match,now),version:match.version,shotId:shot?.id||'',clock:now,started:!!shot&&now>=shot.startAt,settled:!shot||now>=shot.finishAt};
  }
  previous.version=match.version;
  now=Math.max(now,previous.clock);
  if(shot&&!previous.settled){
    if(now>=shot.finishAt){previous.game=structuredClone(match.game);previous.settled=true;}
    else if(now>=shot.startAt){
      if(!previous.started){strikePool(previous.game,shot.dx,shot.dz,shot.power);previous.started=true;}
      let elapsed=(now-Math.max(previous.clock,shot.startAt))/1000;
      if(elapsed>.5)previous.game=poolGameAt(match,now);
      else while(elapsed>0){const step=Math.min(.1,elapsed);advancePool(previous.game,step);elapsed-=step;}
    }
  }
  previous.clock=now;return previous;
}
