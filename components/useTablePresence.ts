'use client';
import { useCallback,useEffect,useRef,useState } from 'react';
import type { HeadPose,PeerMessage,PresenceSnapshot,PresenceWrite } from '@/lib/presence-types';

export function useTablePresence(code:string) {
  const [sessionId]=useState(()=>crypto.randomUUID());
  const [snapshot,setSnapshot]=useState<PresenceSnapshot>({players:[],signals:[],serverNow:0});
  const [online,setOnline]=useState(true);
  const pose=useRef<HeadPose>({yaw:0,pitch:0}),fallback=useRef(true);
  const alive=useRef(true),requests=useRef<AbortController|null>(null);
  const accept=useCallback((data:PresenceSnapshot)=>{if(alive.current){setSnapshot(prev=>data.serverNow>=prev.serverNow?data:prev);setOnline(true);}},[]);
  const request=useCallback(async(write?:PresenceWrite)=>{
    if(!alive.current)throw new DOMException('The table was closed.','AbortError');
    const controller=requests.current;
    const response=await fetch(write?'/api/presence':`/api/presence?code=${code}`,{
      method:write?'POST':'GET',cache:'no-store',headers:write?{'Content-Type':'application/json','x-river-client':'1'}:undefined,
      body:write?JSON.stringify({code,write}):undefined,signal:controller?AbortSignal.any([controller.signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000),
    });
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Table presence is reconnecting.');
    if(controller!==requests.current||!alive.current)throw new DOMException('The table was closed.','AbortError');
    accept(data);return data as PresenceSnapshot;
  },[code,accept]);
  useEffect(()=>{
    alive.current=true;requests.current=new AbortController();let stopped=false,inFlight=false,lastWrite=0,lastPose={yaw:2,pitch:2};
    let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{
      if(stopped||inFlight)return;inFlight=true;
      try {
        const changed=Math.abs(pose.current.yaw-lastPose.yaw)+Math.abs(pose.current.pitch-lastPose.pitch)>.04;
        if(Date.now()-lastWrite>10000||fallback.current&&changed) {
          const sent={...pose.current};await request({type:'pose',sessionId,...sent});lastPose=sent;lastWrite=Date.now();
        } else await request();
      }catch{if(!stopped)setOnline(false);}
      finally{inFlight=false;if(!stopped)timer=setTimeout(poll,document.hidden?10000:fallback.current?1200:5000);}
    };
    void poll();
    const wake=()=>{clearTimeout(timer);if(!inFlight)void poll();};window.addEventListener('focus',wake);
    return()=>{stopped=true;alive.current=false;requests.current?.abort();clearTimeout(timer);window.removeEventListener('focus',wake);};
  },[request,sessionId]);
  const setPose=useCallback((next:HeadPose,needsFallback:boolean)=>{pose.current=next;fallback.current=needsFallback;},[]);
  const sendSignal=useCallback(async(to:string,data:PeerMessage)=>{
    const write:PresenceWrite={type:'signal',id:crypto.randomUUID(),to,data};
    for(let attempt=0;attempt<3;attempt++) {
      try{await request(write);return;}catch(e){if(attempt===2||!alive.current)throw e;await new Promise(resolve=>setTimeout(resolve,400*(attempt+1)));}
    }
  },[request]);
  const setCamera=useCallback(async(cameraSession:string|null)=>{
    // Register this tab before enabling video; camera writes cannot claim another session.
    if(cameraSession)await request({type:'pose',sessionId,...pose.current});
    return request({type:'camera',sessionId,cameraSession});
  },[request,sessionId]);
  const stopCamera=useCallback(()=>{
    void fetch('/api/presence',{method:'POST',headers:{'Content-Type':'application/json','x-river-client':'1'},body:JSON.stringify({code,write:{type:'camera',sessionId,cameraSession:null}}),keepalive:true}).catch(()=>{});
  },[code,sessionId]);
  return {snapshot,sessionId,online,setPose,sendSignal,setCamera,stopCamera};
}
