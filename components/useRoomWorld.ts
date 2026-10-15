'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {RoomView} from '@/lib/types';
import type {HeadPose} from '@/lib/presence-types';
import {bodyChanged,type BodyPose} from '@/lib/world-presence';
import type {PoolMatch,PoolCommand} from '@/lib/pool-match';

/** Lives above the two renderers so changing scenes never disconnects the room. */
export function useRoomWorld(room:RoomView|null,roaming:boolean){
  const [body,setBody]=useState<BodyPose>(),[peers,setPeers]=useState<Record<string,HeadPose>>({});
  const [match,setMatch]=useState<PoolMatch|null>(null),[error,setError]=useState(''),[online,setOnline]=useState(false),[busy,setBusy]=useState(false);
  const code=room?.code,me=room?.me,live=useRef({match,code,me,roaming});live.current={match,code,me,roaming};
  const offset=useRef(0),generation=useRef(0);
  const onBody=useCallback((next:BodyPose)=>setBody(prev=>bodyChanged(prev,next)?next:prev),[]);
  const onPeers=useCallback((next:Record<string,HeadPose>)=>setPeers(next),[]);
  const request=useCallback(async(command?:PoolCommand,signal?:AbortSignal)=>{
    if(!code)return null;const run=generation.current,start=Date.now();
    const response=await fetch(command?'/api/pool':`/api/pool?code=${encodeURIComponent(code)}`,{method:command?'POST':'GET',headers:command?{'Content-Type':'application/json','x-river-client':'1'}:undefined,body:command?JSON.stringify({code,command}):undefined,cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000)});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Pool is reconnecting.');
    if(run!==generation.current)return null;
    offset.current=data.serverNow-(start+Date.now())/2;
    setMatch(prev=>!prev||data.match.version>=prev.version?data.match:prev);setOnline(true);return data.match as PoolMatch;
  },[code]);
  useEffect(()=>{generation.current++;setBody(undefined);setPeers({});setMatch(null);setError('');setOnline(false);if(!code)return;
    const controller=new AbortController();let stopped=false,timer:ReturnType<typeof setTimeout>,lastBeat=0;
    const poll=async()=>{try{const active=live.current.match?.players.some(p=>p.id===live.current.me),beat=!!active&&Date.now()-lastBeat>20000;await request(beat?{type:'heartbeat'}:undefined,controller.signal);if(beat)lastBeat=Date.now();}catch{if(!stopped)setOnline(false);}finally{if(!stopped)timer=setTimeout(poll,document.hidden?15000:live.current.roaming?800:4000);}};
    void poll();
    return()=>{stopped=true;generation.current++;controller.abort();clearTimeout(timer);};
  },[code,request]);
  const send=useCallback(async(command:PoolCommand)=>{if(!live.current.code)return false;setBusy(true);setError('');try{await request(command);return true;}catch(e){setError((e as Error).message);try{await request();}catch{setOnline(false);}return false;}finally{setBusy(false);}},[request]);
  const shoot=useCallback((dx:number,dz:number,power:number)=>{const current=live.current.match;if(!current)return Promise.resolve(false);return send({type:'shoot',id:crypto.randomUUID(),version:current.version,dx,dz,power});},[send]);
  const serverNow=useCallback(()=>Date.now()+offset.current,[]);
  return{body,peers,onBody,onPeers,pool:{match,error,online,busy,send,shoot,serverNow}};
}
export type RoomWorld=ReturnType<typeof useRoomWorld>;
