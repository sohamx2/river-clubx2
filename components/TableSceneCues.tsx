'use client';
import {useEffect,useState} from 'react';
import { DIE_ROLL_MS } from '@/lib/table-scene';
import type { RoomView } from '@/lib/types';

const cells:Record<number,number[]>={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
export function TableSceneCues({room,now}:{room:RoomView;now:number}){
  const event=[...(room.tableEvents||[])].reverse().find(event=>event.handNo===room.handNo&&event.type==='die');
  const [received,setReceived]=useState<{id:string;at:number}|null>(null);
  useEffect(()=>{if(event)setReceived({id:event.id,at:Date.now()});},[event?.id]);
  if(!event||event.type!=='die'||received?.id!==event.id||Date.now()-received.at<DIE_ROLL_MS||now-event.at>8000)return null;
  return <div className="table-effect-cue" role="status"><div className="die-face" aria-label={`Die rolled ${event.roll}`}>{Array.from({length:9},(_,i)=><span key={i} className={cells[event.roll].includes(i)?'die-pip':''}/>)}</div><div><span>DIE ON THE RIVER</span><strong>Rolled {event.roll}</strong><p>{event.roll===6?'The board stays intact.':`Community card ${event.roll} is replaced.`}</p></div></div>;
}
