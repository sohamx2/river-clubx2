'use client';
import dynamic from 'next/dynamic';
import { useCallback,useEffect,useRef,useState,type CSSProperties,type PointerEvent,type ReactNode } from 'react';
import { BookOpen,Camera,CameraOff,Focus,MousePointer2,Users } from 'lucide-react';
import { createPortal } from 'react-dom';
import { PlayerSeat } from './PlayerSeat';
import { CameraFace } from './CameraFace';
import { TrackedFacePreview } from './TrackedFacePreview';
import { useFacialTracking } from './useFacialTracking';
import { NEUTRAL_FACE,type FacePose } from '@/lib/face-pose';
import { TableSceneCues } from './TableSceneCues';
import { useTablePresence } from './useTablePresence';
import { useTablePeers } from './useTablePeers';
import type { HeadPose } from '@/lib/presence-types';
import type { RoomView } from '@/lib/types';

const ThreePokerScene=dynamic(()=>import('./ThreePokerScene').then(module=>module.ThreePokerScene),{ssr:false,loading:()=> <div className="scene-loading" role="status">Taking your seat…</div>});
type CameraMode='off'|'expressions'|'video';
const clamp=(value:number)=>Math.max(-1,Math.min(1,value));
export function TableScene({room,seconds,now,firstPerson,topDown,onInvite,onBookOpen,bookOpen=false,controlsTarget,onFallback,children}:{room:RoomView;seconds:number;now:number;firstPerson:boolean;topDown:boolean;onInvite:()=>void;onBookOpen?:()=>void;bookOpen?:boolean;controlsTarget?:HTMLElement|null;onFallback?:()=>void;children:ReactNode}) {
  const {snapshot,sessionId,online,setPose,sendSignal,setCamera,stopCamera}=useTablePresence(room.code);
  const [pose,setLocalPose]=useState<HeadPose>({yaw:0,pitch:0}),[stream,setStream]=useState<MediaStream|null>(null),[cameraSession,setCameraSession]=useState<string|null>(null);
  const [walking,setWalking]=useState(false),[walkReset,setWalkReset]=useState(0),[walkInput,setWalkInput]=useState({forward:0,right:0});
  const [cameraMode,setCameraMode]=useState<CameraMode>('off');
  const [cameraBusy,setCameraBusy]=useState(false),[cameraError,setCameraError]=useState(''),[webGLFailed,setWebGLFailed]=useState(false);
  const streamRef=useRef<MediaStream|null>(null),mounted=useRef(true),viewRef=useRef(firstPerson),pageActive=useRef(true),cameraAttempt=useRef(0),frame=useRef(0),queuedPose=useRef(pose),lastBroadcast=useRef(0),broadcastTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const faceRef=useRef<FacePose|null>(null),cameraModeRef=useRef<CameraMode>('off'),fallbackRef=useRef(true);
  const touch=useRef<{x:number;y:number;pose:HeadPose}|null>(null);
  viewRef.current=firstPerson;
  const peers=useTablePeers({me:room.me,playerIds:room.players.map(p=>p.id),sessionId,snapshot,localStream:cameraMode==='video'?stream:null,cameraSession,sendSignal});
  fallbackRef.current=peers.needsFallback;
  const publish=useCallback((next:HeadPose)=>{
    const value={...next,face:faceRef.current};queuedPose.current=value;setPose(value,fallbackRef.current);
    if(!frame.current)frame.current=requestAnimationFrame(()=>{frame.current=0;setLocalPose(queuedPose.current);});
    const elapsed=performance.now()-lastBroadcast.current;
    if(elapsed>=65){peers.broadcast(value);lastBroadcast.current=performance.now();}
    else if(!broadcastTimer.current)broadcastTimer.current=setTimeout(()=>{broadcastTimer.current=null;peers.broadcast(queuedPose.current);lastBroadcast.current=performance.now();},65-elapsed);
  },[peers.broadcast,setPose]);
  const turnOff=useCallback(()=>{
    cameraAttempt.current++;cameraModeRef.current='off';faceRef.current=null;publish(queuedPose.current);
    streamRef.current?.getTracks().forEach(track=>track.stop());streamRef.current=null;setStream(null);setCameraSession(null);setCameraMode('off');stopCamera();
  },[stopCamera,publish]);
  const mirrorFace=useCallback((face:FacePose)=>{if(cameraModeRef.current!=='expressions')return;faceRef.current=face;publish(queuedPose.current);},[publish]);
  const trackingFailed=useCallback((message:string)=>{if(cameraModeRef.current!=='expressions')return;turnOff();setCameraError(message);},[turnOff]);
  const tracking=useFacialTracking(cameraMode==='expressions'?stream:null,mirrorFace,trackingFailed);
  useEffect(()=>{
    mounted.current=true;const leave=()=>{pageActive.current=false;turnOff();};const resume=()=>{pageActive.current=true;};
    window.addEventListener('pagehide',leave);window.addEventListener('pageshow',resume);
    return()=>{mounted.current=false;pageActive.current=false;cameraAttempt.current++;streamRef.current?.getTracks().forEach(track=>track.stop());if(streamRef.current)stopCamera();cancelAnimationFrame(frame.current);if(broadcastTimer.current)clearTimeout(broadcastTimer.current);window.removeEventListener('pagehide',leave);window.removeEventListener('pageshow',resume);};
  },[stopCamera,turnOff]);
  useEffect(()=>{if(!firstPerson){cameraAttempt.current++;setCameraBusy(false);if(streamRef.current)turnOff();const neutral={yaw:0,pitch:0};queuedPose.current=neutral;setLocalPose(neutral);peers.broadcast(neutral);}},[firstPerson,turnOff,peers.broadcast]);
  useEffect(()=>{setPose(pose,peers.needsFallback);},[pose,peers.needsFallback,setPose]);
  const sceneReady=useCallback((ready:boolean)=>{setWebGLFailed(!ready);setWalking(false);if(!ready){turnOff();onFallback?.();}},[turnOff,onFallback]);
  async function toggleCamera(mode:'expressions'|'video') {
    if(stream&&cameraMode===mode){turnOff();return;}
    if(streamRef.current)turnOff();
    const attempt=++cameraAttempt.current;
    setCameraBusy(true);setCameraError('');
    let video:MediaStream|null=null;
    try {
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('Your browser needs a secure HTTPS connection to use the camera.');
      if(mode==='video'&&typeof RTCPeerConnection==='undefined')throw new Error('This browser does not support live camera sharing. You can keep using your stick character.');
      // Only an explicit click requests permission. Audio is never captured.
      video=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:320},height:{ideal:320},frameRate:{ideal:15,max:20}},audio:false});
      if(!mounted.current||!pageActive.current||!viewRef.current||attempt!==cameraAttempt.current){video.getTracks().forEach(track=>track.stop());return;}
      const next=mode==='video'?crypto.randomUUID():null;if(next)await setCamera(next);
      if(!mounted.current||!pageActive.current||!viewRef.current||attempt!==cameraAttempt.current){video.getTracks().forEach(track=>track.stop());stopCamera();return;}
      cameraModeRef.current=mode;faceRef.current=mode==='expressions'?{...NEUTRAL_FACE}:null;publish(queuedPose.current);
      streamRef.current=video;setStream(video);setCameraSession(next);setCameraMode(mode);
      video.getVideoTracks()[0].onended=turnOff;
    }catch(e){video?.getTracks().forEach(track=>track.stop());const error=e as Error;if(mounted.current&&pageActive.current&&attempt===cameraAttempt.current)setCameraError(error.name==='NotAllowedError'?'Camera permission was declined. You can keep using your stick character.':error.name==='NotFoundError'?'No camera was found. Your stick character is still available.':error.message||'The camera could not be started.');}
    finally{if(mounted.current&&attempt===cameraAttempt.current)setCameraBusy(false);}
  }
  function look(event:PointerEvent<HTMLDivElement>) {
    if(!firstPerson||webGLFailed||bookOpen||walking||(event.target as HTMLElement).closest('button,input,video'))return;
    const rect=event.currentTarget.getBoundingClientRect();
    if(event.pointerType==='touch') {
      if(!touch.current)return;
      const dx=event.clientX-touch.current.x,dy=event.clientY-touch.current.y;
      if(Math.abs(dx)<=Math.abs(dy))return;
      publish({yaw:clamp(touch.current.pose.yaw+dx/rect.width*2),pitch:touch.current.pose.pitch});
    }else publish({yaw:clamp((event.clientX-rect.left-rect.width/2)/(rect.width/2)),pitch:clamp((event.clientY-rect.top-rect.height/2)/(rect.height/2))});
  }
  function center(){setWalkReset(value=>value+1);publish({yaw:0,pitch:0});}
  useEffect(()=>{const stop=()=>setWalkInput({forward:0,right:0});window.addEventListener('blur',stop);document.addEventListener('visibilitychange',stop);return()=>{window.removeEventListener('blur',stop);document.removeEventListener('visibilitychange',stop);};},[]);
  const mySeat=room.players.find(p=>p.id===room.me)?.seat||0;
  const poses:Record<string,HeadPose>={},streams:Record<string,MediaStream>={};
  for(const player of room.players){const present=snapshot.players.find(p=>p.id===player.id);poses[player.id]=player.id===room.me?pose:peers.poses[player.id]||present||{yaw:0,pitch:0};if(player.id!==room.me&&present?.cameraSession&&peers.streams[player.id])streams[player.id]=peers.streams[player.id];}
  const render3D=firstPerson&&!webGLFailed;
  const cameraTools=<div className={`first-person-tools ${controlsTarget?'book-controls-embedded':''}`}><div className="pov-control-row">
      <button className={`camera-toggle ${cameraMode==='expressions'?'camera-live':''}`} onClick={()=>toggleCamera('expressions')} disabled={cameraBusy||webGLFailed} aria-pressed={cameraMode==='expressions'}><Camera size={15}/>{cameraMode==='expressions'?'Stop expressions':'Mirror expressions'}</button>
      <button className={`camera-toggle ${cameraMode==='video'?'camera-live':''}`} onClick={()=>toggleCamera('video')} disabled={cameraBusy||webGLFailed} aria-pressed={cameraMode==='video'}>{cameraMode==='video'?<CameraOff size={15}/>:<Camera size={15}/>} {cameraMode==='video'?'Turn camera off':'Share camera face'}</button>
      <button className="center-view" onClick={center} aria-label="Center first-person view" title="Center view"><Focus size={16}/></button><span className="look-hint"><MousePointer2 size={12}/> Move to look · drag on touch</span>
      {stream&&<div className="local-face-preview">{cameraMode==='video'?<CameraFace stream={stream} name="Your" local/>:<TrackedFacePreview face={pose.face||NEUTRAL_FACE}/>}</div>}
    </div><p className="camera-sharing-note" role="status">{cameraBusy?'Waiting for camera permission…':webGLFailed?'3D graphics are unavailable in this browser. Table view is still playable.':cameraMode==='expressions'?tracking==='loading'?'Starting expression tracking…':tracking==='no-face'?'Looking for your face · camera stays private':`Mirroring facial movements · video stays on your device${peers.needsFallback?' · table updates while peers reconnect':''}`:cameraMode==='video'?'Camera shared with this table · microphone off':!online?'Head movement is reconnecting. You can still play.':'Mirror expressions keeps video private · Share camera face sends video to the table · microphone off'}</p>{cameraError&&<p className="camera-error" role="alert">{cameraError}</p>}</div>;
  return <div className="table-visuals" onPointerMove={look} onPointerDown={e=>{if(e.pointerType==='touch')touch.current={x:e.clientX,y:e.clientY,pose};}} onPointerUp={()=>{touch.current=null;}} onPointerCancel={()=>{touch.current=null;}} data-head-connections={peers.connected} data-presence-online={online}>
    {render3D?<><ThreePokerScene room={room} now={now} pose={pose} poses={poses} streams={streams} localStream={cameraMode==='video'?stream:null} topDown={topDown} onBookOpen={onBookOpen} bookOpen={bookOpen} onReady={sceneReady} onWalkingChange={setWalking} walkReset={walkReset} walkInput={walkInput}/><div className="table-walk-tools"><span>{walking?'Walking · drag to look':'WASD to walk around the table'}</span>{walking&&<button onClick={()=>{setWalkReset(value=>value+1);setWalkInput({forward:0,right:0});}}>Sit back down</button>}</div><div className="table-touch-walk" aria-label="Walk around table">{[{axis:'forward',value:1,label:'Walk forward',symbol:'↑'},{axis:'right',value:-1,label:'Walk left',symbol:'←'},{axis:'forward',value:-1,label:'Walk backward',symbol:'↓'},{axis:'right',value:1,label:'Walk right',symbol:'→'}].map(({axis,value,label,symbol},index)=><button key={label} className={`table-walk-${index}`} aria-label={label} onPointerDown={event=>{event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);setWalkInput(input=>({...input,[axis]:value}));}} onPointerUp={()=>setWalkInput(input=>({...input,[axis]:0}))} onPointerCancel={()=>setWalkInput(input=>({...input,[axis]:0}))} onLostPointerCapture={()=>setWalkInput(input=>({...input,[axis]:0}))}>{symbol}</button>)}</div><div className="sr-only" aria-label="Table state"><p>Pot: {room.pot.toLocaleString()} chips. Board: {room.board.join(', ')||'Not dealt'}.{room.isDoubleBarrel&&` Second board: ${room.boardTwo.join(', ')||'Not dealt'}.`}</p>{room.players.map(player=><p key={player.id}>{player.name}{player.id===room.me?' (you)':''}: {player.stack.toLocaleString()} chips. {room.turnId===player.id?'Thinking':player.lastAction}. Cards: {player.hole.join(', ')||'Not dealt'}.</p>)}</div>{onBookOpen&&<button className="table-book-trigger" onClick={onBookOpen} aria-label="Open table book" aria-haspopup="dialog" aria-expanded={bookOpen}><BookOpen size={18}/><span>Table book</span><kbd>B</kbd></button>}{room.phase==='waiting'&&!onBookOpen&&<div className="first-person-welcome"><button onClick={onInvite}><Users size={15}/> Invite friends</button></div>}</>:<><div className="pov-room-backdrop" aria-hidden="true"/><div className="table-world"><div className="table-stage"><div className="poker-table"><div className="table-stitch"/><div className="table-center">{children}</div></div></div></div><div className="pov-seat-layer">{Array.from({length:room.settings.maxPlayers},(_,seat)=>{
      const player=room.players.find(p=>p.seat===seat),count=room.settings.maxPlayers;
      const seatOffset=(seat-mySeat+count)%count,angle=Math.PI/2+2*Math.PI*seatOffset/count;
      const depth=(Math.sin(angle)+1)/2,reach=Math.min(seatOffset,count-seatOffset)/(count/2),side=seatOffset<=count/2?-1:1;
      return <PlayerSeat key={seat} p={player} room={room} seconds={seconds} now={now} onInvite={onInvite} style={{'--pov-left':`${50+42*Math.cos(angle)}%`,'--pov-top':`${52+35*Math.sin(angle)}%`,'--pov-mobile-left':`${50+side*40*Math.pow(Math.sin(Math.PI*reach),.6)}%`,'--pov-mobile-top':`${87-71*reach}%`,'--pov-scale':String(.8+depth*.23),'--seat-z':String(Math.round(20+depth*35))} as CSSProperties}/>;
    })}</div></>}
    {render3D&&<TableSceneCues room={room} now={now}/>}
    {firstPerson&&(controlsTarget?createPortal(cameraTools,controlsTarget):!onBookOpen?cameraTools:null)}

  </div>;
}
