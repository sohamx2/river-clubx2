'use client';
import { useCallback,useEffect,useRef,useState } from 'react';
import type { HeadPose,PeerMessage,PresenceSnapshot } from '@/lib/presence-types';
import {parseAvatarPose} from '@/lib/avatar-pose';

type Peer={pc:RTCPeerConnection;callId:string;channel:RTCDataChannel|null;candidates:RTCIceCandidateInit[];outgoing:RTCIceCandidateInit[];timer?:ReturnType<typeof setTimeout>;reconnectTimer?:ReturnType<typeof setTimeout>;work:Promise<void>;retries:number;lastSequence:number};
const defaultIce:RTCIceServer[]=[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}];
function iceServers():RTCIceServer[] {
  // Optional TURN configuration for networks that block direct peer connections.
  try{const configured=JSON.parse(process.env.NEXT_PUBLIC_RTC_ICE_SERVERS||'null');if(Array.isArray(configured)&&configured.every(s=>s&&typeof s==='object'&&s.urls))return configured;}catch{}
  return defaultIce;
}
export function useTablePeers({me,playerIds,sessionId,snapshot,localStream,cameraSession,sendSignal}:{me:string;playerIds:string[];sessionId:string;snapshot:PresenceSnapshot;localStream:MediaStream|null;cameraSession:string|null;sendSignal:(to:string,data:PeerMessage)=>Promise<void>}) {
  const peers=useRef(new Map<string,Peer>()),processed=useRef(new Set<string>()),latestPose=useRef<HeadPose>({yaw:0,pitch:0}),sequence=useRef(0);
  const [streams,setStreams]=useState<Record<string,MediaStream>>({}),[poses,setPoses]=useState<Record<string,HeadPose>>({});
  const [connected,setConnected]=useState(0),[failed,setFailed]=useState(false);
  const roster=playerIds.filter(id=>id!==me).map(id=>{
    const remote=snapshot.players.find(p=>p.id===id);
    return remote?{id,sessionId:remote.sessionId,cameraSession:remote.cameraSession}:null;
  }).filter(p=>p!==null);
  const rosterKey=JSON.stringify(roster);
  const refresh=useCallback(()=>setConnected([...peers.current.values()].filter(p=>p.channel?.readyState==='open').length),[]);
  const closePeer=useCallback((id:string)=>{
    const peer=peers.current.get(id);if(!peer)return;peers.current.delete(id);clearTimeout(peer.timer);clearTimeout(peer.reconnectTimer);peer.pc.close();
    setStreams(prev=>{const next={...prev};delete next[id];return next;});setPoses(prev=>{const next={...prev};delete next[id];return next;});refresh();
  },[refresh]);
  useEffect(()=>{
    if(typeof RTCPeerConnection==='undefined')return;
    const members=JSON.parse(rosterKey) as typeof roster;
    const send=(id:string,peer:Peer,data:Omit<PeerMessage,'callId'>)=>{
      if(peers.current.get(id)!==peer)return Promise.resolve();
      return sendSignal(id,{callId:peer.callId,...data}).catch(()=>{if(peers.current.get(id)===peer)setFailed(true);});
    };
    function bindChannel(id:string,peer:Peer,channel:RTCDataChannel) {
      peer.channel=channel;
      channel.onopen=()=>{if(peers.current.get(id)!==peer||peer.channel!==channel)return;refresh();try{channel.send(JSON.stringify({...latestPose.current,sequence:++sequence.current}));}catch{}};
      channel.onclose=()=>{if(peers.current.get(id)===peer&&peer.channel===channel)refresh();};
      channel.onmessage=e=>{
        if(peers.current.get(id)!==peer||peer.channel!==channel||typeof e.data!=='string'||e.data.length>768)return;
        try{const raw=JSON.parse(e.data),value=parseAvatarPose(raw);if(!value)return;
          if(raw.sequence!==undefined){if(!Number.isSafeInteger(raw.sequence)||raw.sequence<=peer.lastSequence)return;peer.lastSequence=raw.sequence;}
          else if(peer.lastSequence>=0)return;
          setPoses(prev=>({...prev,[id]:value}));}catch{}
      };
    }
    for(const id of peers.current.keys())if(!members.some(p=>p.id===id))closePeer(id);
    for(const remote of members) {
      const callId=[{id:me,sessionId,cameraSession},remote].sort((a,b)=>a.id.localeCompare(b.id)).map(p=>`${p.id}:${p.sessionId}:${p.cameraSession||'-'}`).join('|');
      if(peers.current.get(remote.id)?.callId===callId)continue;
      closePeer(remote.id);
      let pc:RTCPeerConnection;
      try{pc=new RTCPeerConnection({iceServers:iceServers()});}catch{setFailed(true);continue;}
      const peer:Peer={pc,callId,channel:null,candidates:[],outgoing:[],work:Promise.resolve(),retries:0,lastSequence:-1};
      peers.current.set(remote.id,peer);
      const video=localStream?.getVideoTracks().find(track=>track.readyState==='live');
      if(video&&localStream)pc.addTrack(video,localStream);else pc.addTransceiver('video',{direction:'recvonly'});
      pc.ontrack=e=>{
        if(peers.current.get(remote.id)!==peer)return;
        const stream=e.streams[0]||new MediaStream([e.track]);
        setStreams(prev=>({...prev,[remote.id]:stream}));
      };
      pc.ondatachannel=e=>{if(peers.current.get(remote.id)===peer)bindChannel(remote.id,peer,e.channel);else e.channel.close();};
      pc.onicecandidate=e=>{
        if(peers.current.get(remote.id)!==peer||!e.candidate)return;peer.outgoing.push(e.candidate.toJSON());clearTimeout(peer.timer);
        peer.timer=setTimeout(()=>{const candidates=peer.outgoing.splice(0);void send(remote.id,peer,{candidates});},200);
      };
      const offer=async(restart=false)=>{
        peer.work=peer.work.then(async()=>{
          if(peers.current.get(remote.id)!==peer||pc.signalingState!=='stable')return;
          await pc.setLocalDescription(await pc.createOffer({iceRestart:restart}));
          await send(remote.id,peer,{description:{type:'offer',sdp:pc.localDescription!.sdp}});
        }).catch(()=>{if(peers.current.get(remote.id)===peer)setFailed(true);});
        await peer.work;
      };
      pc.onconnectionstatechange=()=>{
        if(peers.current.get(remote.id)!==peer)return;
        if(pc.connectionState==='connected')setFailed(false);
        if(pc.connectionState==='failed'){setFailed(true);if(me<remote.id)void offer(true);}
      };
      if(me<remote.id){bindChannel(remote.id,peer,pc.createDataChannel('head-pose',{ordered:false,maxRetransmits:0}));void offer();}
      // A lost offer can leave a connection in "new" forever, without a failure event.
      // Re-send outstanding offers or restart ICE while keeping poker independent.
      const reconnect=async()=>{
        if(peers.current.get(remote.id)!==peer)return;
        if(me<remote.id&&pc.connectionState!=='connected') {
          peer.retries++;
          if(pc.signalingState==='have-local-offer'&&pc.localDescription?.sdp)await send(remote.id,peer,{description:{type:'offer',sdp:pc.localDescription.sdp}});
          else if(pc.signalingState==='stable')await offer(!!pc.remoteDescription);
        } else if(me<remote.id&&peer.channel?.readyState==='closed')bindChannel(remote.id,peer,pc.createDataChannel('head-pose',{ordered:false,maxRetransmits:0}));
        else if(pc.connectionState==='connected')peer.retries=0;
        if(peers.current.get(remote.id)===peer)peer.reconnectTimer=setTimeout(()=>{void reconnect();},peer.retries>3?30000:12000);
      };
      peer.reconnectTimer=setTimeout(()=>{void reconnect();},12000);
    }
    refresh();
  },[rosterKey,me,sessionId,cameraSession,localStream,sendSignal,closePeer,refresh]);
  useEffect(()=>{
    for(const signal of snapshot.signals) {
      const peer=peers.current.get(signal.from);
      if(!peer||signal.data.callId!==peer.callId||processed.current.has(signal.id))continue;
      processed.current.add(signal.id);if(processed.current.size>500)processed.current.delete(processed.current.values().next().value!);
      peer.work=peer.work.then(async()=>{
        if(peers.current.get(signal.from)!==peer)return;
        const {description,candidates}=signal.data;
        if(description) {
          await peer.pc.setRemoteDescription(description);
          for(const candidate of peer.candidates.splice(0))try{await peer.pc.addIceCandidate(candidate);}catch{/* A late candidate from an earlier ICE generation is harmless. */}
          if(description.type==='offer') {
            if(peers.current.get(signal.from)!==peer)return;
            await peer.pc.setLocalDescription(await peer.pc.createAnswer());
            if(peers.current.get(signal.from)!==peer)return;
            await sendSignal(signal.from,{callId:peer.callId,description:{type:'answer',sdp:peer.pc.localDescription!.sdp}});
          }
        }
        for(const candidate of candidates||[]) {
          if(peers.current.get(signal.from)!==peer)return;
          if(peer.pc.remoteDescription)try{await peer.pc.addIceCandidate(candidate);}catch{/* Keep the rest of the candidate batch when one candidate is stale. */}
          else peer.candidates.push(candidate);
        }
      }).catch(()=>{if(peers.current.get(signal.from)===peer)setFailed(true);});
    }
  },[snapshot,sendSignal,rosterKey,cameraSession]);
  useEffect(()=>()=>{const previous=[...peers.current.values()];peers.current.clear();for(const peer of previous){clearTimeout(peer.timer);clearTimeout(peer.reconnectTimer);peer.pc.close();}},[]);
  const broadcast=useCallback((pose:HeadPose)=>{
    latestPose.current=pose;
    const packet=JSON.stringify({...pose,sequence:++sequence.current});
    for(const peer of peers.current.values())if(peer.channel?.readyState==='open'&&peer.channel.bufferedAmount<1024)try{peer.channel.send(packet);}catch{}
  },[]);
  useEffect(()=>{const heartbeat=setInterval(()=>broadcast(latestPose.current),1000);return()=>clearInterval(heartbeat);},[broadcast]);
  const livePoses=Object.fromEntries(Object.entries(poses).filter(([id])=>peers.current.get(id)?.channel?.readyState==='open'));
  return {streams,poses:livePoses,broadcast,connected,failed,needsFallback:connected<playerIds.length-1};
}
