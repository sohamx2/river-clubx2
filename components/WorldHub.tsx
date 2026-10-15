'use client';

import {useEffect, useRef, useState} from 'react';
import * as THREE from 'three';
import {PoolControls} from './PoolControls';
import {createClubInterior} from './club-interior';
import {createPoolWorld, POOL_BOUNDS, POOL_POSITION} from '@/components/pool-world';
import {cuePullFromDrag} from '@/lib/pool-controls';
import {resolveHubMovement, type HubObstacle} from '@/lib/hub-controls';
import '@/app/world-hub.css';

interface WorldHubProps {
  entered: boolean;
  paused?: boolean;
  onEnter: () => void;
  onBartender: () => void;
  onTableView: () => void;
}
interface PoolStatus {moving:boolean;pocketed:number;shots:number;scratched:boolean;message:string}
interface HubCommands {enter:()=>void;interact:()=>void;leavePool:()=>void;beginPull:()=>void;releasePull:()=>void;cancelPull:()=>void;resetPool:()=>void;move:(key:string,pressed:boolean)=>void}
const INITIAL_POOL:PoolStatus={moving:false,pocketed:0,shots:0,scratched:false,message:'Aim on the felt, then take your shot.'};
const BAR={x:4.2,z:-6.8};
const START=new THREE.Vector3(0,1.72,7.2);

/** The lobby is a place you enter. Only room/game state lives outside the world. */
export function WorldHub(props:WorldHubProps) {
  const host=useRef<HTMLDivElement>(null);
  const live=useRef(props);live.current=props;
  const commands=useRef<HubCommands|null>(null);
  const [ready,setReady]=useState(false);
  const [failed,setFailed]=useState(false);
  const [entering,setEntering]=useState(false);
  const [near,setNear]=useState<'bar'|'pool'|null>(null);
  const [poolActive,setPoolActive]=useState(false);
  const [poolStatus,setPoolStatus]=useState<PoolStatus>(INITIAL_POOL);
  const [power,setPower]=useState(0);
  const [hint,setHint]=useState('');

  useEffect(()=>{
    const element=host.current;if(!element)return;
    let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});}catch{setFailed(true);return;}
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scene=new THREE.Scene();scene.background=new THREE.Color('#171110');scene.fog=new THREE.FogExp2('#201511',.023);
    const camera=new THREE.PerspectiveCamera(65,1,.05,65);camera.rotation.order='YXZ';
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
    renderer.shadowMap.enabled=element.clientWidth>700;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute('aria-hidden','true');renderer.domElement.className='hub-canvas';element.appendChild(renderer.domElement);
    const interior=createClubInterior(scene,renderer,{previewTable:true});
    const {barInteraction}=interior;
    const pool=createPoolWorld({scene,onStatus:setPoolStatus,onPlayingChange:active=>{poolMode=active;setPoolActive(active);held.clear();resize();}});
    const obstacles:HubObstacle[]=[{minX:-3.72,maxX:3.72,minZ:-2.48,maxZ:2.48},POOL_BOUNDS,...interior.obstacles,...interior.chairObstacles];
    let poolMode=false,disposed=false,frame=0,lastFrame=0,lastDraw=0,yaw=0,pitch=-.045,walkingPhase=0,cinematicStart=-1,cinematicDone=live.current.entered;
    let drawPower=0,pullStarted:number|null=null,poolPointerX:number|null=null;
    let nearValue:'bar'|'pool'|null=null;
    const held=new Set<string>();
    const player=START.clone();
    camera.position.copy(live.current.entered?START:new THREE.Vector3(5.5,3.12,8.6));
    if(live.current.entered)camera.rotation.set(pitch,yaw,0,'YXZ');
    const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),lookTarget=new THREE.Vector3();
    const previousRotation=new THREE.Quaternion(),desiredRotation=new THREE.Quaternion();
    const menuEye=new THREE.Vector3(5.5,3.12,8.6),menuTarget=new THREE.Vector3(.8,1.25,-2.7);
    let dragging=false,lastPointerX=0,lastPointerY=0,downX=0,downY=0,downTime=0;
    let hintTimer:ReturnType<typeof setTimeout>|undefined;
    const blocked=()=>Boolean(live.current.paused||document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]'));
    const setDraw=(value:number)=>{drawPower=value;pool.setDraw(value);setPower(previous=>Math.abs(previous-value)>.005?value:previous);};
    const cancelPull=()=>{pullStarted=null;setDraw(0);};
    const beginPull=()=>{if(!blocked()&&pool.canShoot()&&!pool.getState().moving){pullStarted=performance.now();setDraw(0);}};
    const releasePull=()=>{pullStarted=null;if(drawPower>=.04&&!blocked())pool.shoot(drawPower);setDraw(0);};
    const showHint=(message:string)=>{setHint(message);if(hintTimer)clearTimeout(hintTimer);hintTimer=setTimeout(()=>setHint(''),3500);};
    function interact(){
      if(!live.current.entered||blocked())return;
      if(poolMode)return;
      if(nearValue==='bar'){held.clear();dragging=false;live.current.onBartender();return;}
      if(nearValue==='pool'){poolPointerX=null;pool.setActive(true);return;}
      showHint('Walk up to the bar to host or join a poker table.');
    }
    commands.current={
      enter:()=>{if(cinematicStart>=0||cinematicDone)return;cinematicStart=performance.now();setEntering(true);},
      interact,
      leavePool:()=>{cancelPull();pool.setActive(false);held.clear();},
      beginPull,releasePull,cancelPull,resetPool:()=>pool.reset(),
      move:(key,pressed)=>{if(pressed)held.add(key);else held.delete(key);},
    };
    const resize=()=>{const width=element.clientWidth,height=element.clientHeight;if(!width||!height)return;renderer.setSize(width,height,false);camera.aspect=width/height;camera.fov=poolMode?(width<650?74:60):width<650?74:65;camera.updateProjectionMatrix();};resize();const observer=new ResizeObserver(resize);observer.observe(element);
    function rayAt(clientX:number,clientY:number){const bounds=renderer.domElement.getBoundingClientRect();pointer.set((clientX-bounds.left)/bounds.width*2-1,-(clientY-bounds.top)/bounds.height*2+1);raycaster.setFromCamera(pointer,camera);return raycaster;}
    const pointerDown=(event:PointerEvent)=>{
      if(!live.current.entered||blocked()||event.button>0)return;
      downX=lastPointerX=event.clientX;downY=lastPointerY=event.clientY;downTime=performance.now();
      if(poolMode&&pool.getState().moving)return;
      dragging=true;renderer.domElement.setPointerCapture(event.pointerId);
      if(poolMode){pullStarted=null;setDraw(0);poolPointerX=event.clientX;}
    };
    const pointerMove=(event:PointerEvent)=>{
      if(!live.current.entered||blocked())return;
      if(poolMode){
        if(dragging){if(Math.abs(event.clientY-downY)<12&&poolPointerX!==null)pool.rotateAim((event.clientX-poolPointerX)*.004);setDraw(cuePullFromDrag(downY,event.clientY,element.clientHeight));}
        else if(poolPointerX!==null)pool.rotateAim((event.clientX-poolPointerX)*.004);
        poolPointerX=event.clientX;return;
      }
      if(!dragging)return;yaw-=(event.clientX-lastPointerX)*.0034;pitch=THREE.MathUtils.clamp(pitch-(event.clientY-lastPointerY)*.0028,-.88,.82);lastPointerX=event.clientX;lastPointerY=event.clientY;
    };
    const pointerUp=(event:PointerEvent)=>{
      const wasDragging=dragging;dragging=false;
      if(renderer.domElement.hasPointerCapture(event.pointerId))renderer.domElement.releasePointerCapture(event.pointerId);
      if(poolMode){if(wasDragging&&!blocked())releasePull();else cancelPull();return;}
      if(!wasDragging||blocked()||Math.hypot(event.clientX-downX,event.clientY-downY)>8||performance.now()-downTime>550)return;
      const ray=rayAt(event.clientX,event.clientY);
      if(ray.intersectObject(barInteraction,true).length){if(nearValue==='bar')interact();else showHint('The bartender is at the back counter. Walk a little closer.');}
      else if(ray.intersectObject(pool.group,true).length){if(nearValue==='pool'){poolPointerX=null;pool.handleRaycast(ray);held.clear();}else showHint('Walk closer to the pool table to play.');}
    };
    const cancelPointer=()=>{dragging=false;cancelPull();poolPointerX=null;};
    const keyDown=(event:KeyboardEvent)=>{if(!live.current.entered||blocked()||event.metaKey||event.ctrlKey||event.altKey)return;const target=event.target as HTMLElement|null;if(target?.closest('input,textarea,select,[contenteditable="true"]'))return;const key=event.key.toLowerCase();if(poolMode&&(key==='arrowleft'||key==='arrowright')){pool.rotateAim(key==='arrowleft'?-.035:.035);event.preventDefault();return;}if(poolMode&&event.code==='Space'){if(target?.closest('button,a,[role=button]')&&!target.closest('.hub-pool-shoot'))return;if(!event.repeat)beginPull();event.preventDefault();return;}if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key)){if(!poolMode){held.add(key);event.preventDefault();}}else if(key==='e'&&!event.repeat){interact();event.preventDefault();}else if(key==='escape'&&poolMode){cancelPull();pool.setActive(false);event.preventDefault();}};
    const keyUp=(event:KeyboardEvent)=>{held.delete(event.key.toLowerCase());if(poolMode&&event.code==='Space'&&pullStarted!==null){releasePull();event.preventDefault();}};
    const blur=()=>{held.clear();dragging=false;cancelPull();};
    renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointermove',pointerMove);renderer.domElement.addEventListener('pointerup',pointerUp);renderer.domElement.addEventListener('pointercancel',cancelPointer);
    window.addEventListener('keydown',keyDown);window.addEventListener('keyup',keyUp);window.addEventListener('blur',blur);document.addEventListener('visibilitychange',blur);
    const contextLost=(event:Event)=>{event.preventDefault();cancelAnimationFrame(frame);held.clear();dragging=false;setFailed(true);};renderer.domElement.addEventListener('webglcontextlost',contextLost);
    setReady(true);
    function tick(time:number){
      if(disposed)return;frame=requestAnimationFrame(tick);const dt=Math.min((time-lastFrame)/1000||0,.045);lastFrame=time;if(document.hidden)return;
      pool.update(dt);
      if(blocked()){held.clear();dragging=false;if(pullStarted!==null||drawPower)cancelPull();}
      if(pullStarted!==null)setDraw(Math.min(1,(performance.now()-pullStarted)/1100));
      const active=live.current.entered||cinematicDone;
      if(!active&&cinematicStart<0){camera.position.copy(menuEye);if(!reduced)camera.position.x+=Math.sin(time*.00014)*.16;camera.lookAt(menuTarget);}
      else if(!active&&cinematicStart>=0){const progress=reduced?1:Math.min(1,(time-cinematicStart)/1750),ease=progress*progress*(3-2*progress);camera.position.lerpVectors(menuEye,START,ease);lookTarget.lerpVectors(menuTarget,new THREE.Vector3(0,1.4,-3),ease);camera.lookAt(lookTarget);if(progress>=1){cinematicDone=true;live.current.onEnter();}}
      else{
        if(!cinematicDone)cinematicDone=true;
        if(!blocked()&&!poolMode){const forward=(held.has('w')||held.has('arrowup')?1:0)-(held.has('s')||held.has('arrowdown')?1:0),right=(held.has('d')||held.has('arrowright')?1:0)-(held.has('a')||held.has('arrowleft')?1:0);if(forward||right){const length=Math.hypot(forward,right);const speed=2.7*dt/length;const next=resolveHubMovement({x:player.x,z:player.z},{x:(-Math.sin(yaw)*forward+Math.cos(yaw)*right)*speed,z:(-Math.cos(yaw)*forward-Math.sin(yaw)*right)*speed},obstacles);player.x=next.x;player.z=next.z;walkingPhase+=dt*8;}else walkingPhase=0;}
        const bodyY=START.y+(!reduced&&!poolMode?Math.sin(walkingPhase)*.012:0);const poolView=pool.getView();const targetEye=poolMode?new THREE.Vector3(poolView.eye.x,poolView.eye.y,poolView.eye.z):new THREE.Vector3(player.x,bodyY,player.z);camera.position.lerp(targetEye,reduced?1:1-Math.exp(-dt*9));
        if(poolMode){previousRotation.copy(camera.quaternion);camera.lookAt(poolView.target.x,poolView.target.y,poolView.target.z);desiredRotation.copy(camera.quaternion);camera.quaternion.copy(previousRotation).slerp(desiredRotation,reduced?1:1-Math.exp(-dt*9));}else{const targetQuaternion=new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch,yaw,0,'YXZ'));camera.quaternion.slerp(targetQuaternion,reduced?1:1-Math.exp(-dt*14));}
        const barDistance=Math.hypot(player.x-BAR.x,player.z-(BAR.z+1.5));const poolDistance=Math.hypot(player.x-POOL_POSITION.x,player.z-POOL_POSITION.z);
        const nextNear=barDistance<3.35&&player.z>BAR.z+.75?'bar':poolDistance<3.2?'pool':null;
        if(nextNear!==nearValue){nearValue=nextNear;setNear(nextNear);}
      }
      // The host follows you and polishes the glass while you find a seat.
      interior.update(time,player,reduced);
      const fps=renderer.domElement.clientWidth<650?30:45;if(time-lastDraw<1000/fps)return;lastDraw=time;renderer.render(scene,camera);
    }
    frame=requestAnimationFrame(tick);
    return()=>{disposed=true;cancelAnimationFrame(frame);if(hintTimer)clearTimeout(hintTimer);observer.disconnect();commands.current=null;pool.dispose();interior.dispose();window.removeEventListener('keydown',keyDown);window.removeEventListener('keyup',keyUp);window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',blur);renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointermove',pointerMove);renderer.domElement.removeEventListener('pointerup',pointerUp);renderer.domElement.removeEventListener('pointercancel',cancelPointer);renderer.domElement.removeEventListener('webglcontextlost',contextLost);renderer.dispose();renderer.domElement.remove();};
  },[]);

  const play=()=>commands.current?.enter();
  const mobileMove=(key:string,pressed:boolean)=>commands.current?.move(key,pressed);
  return <section className={`world-hub ${props.entered?'hub-entered':''} ${entering?'hub-entering':''}`} aria-label="River Club walkable bar">
    <div className="hub-world" ref={host}/>
    <div className="hub-vignette"/>
    <header className="hub-masthead"><span className="hub-brand"><span aria-hidden>♠</span> RIVER CLUB<small>EST. AFTER HOURS</small></span><span className="hub-location"><i/> THE LOUNGE</span></header>
    {!props.entered&&!failed&&<div className="hub-menu" aria-label="Main menu"><div className="hub-menu-rule"><span/> YOUR NIGHT. YOUR PEOPLE. <span/></div><h1>Make yourself<br/><em>at home.</em></h1><p>A private table. A familiar face.<br/>One more hand with your friends.</p><button className="hub-play" disabled={!ready||entering} onClick={play}><span>{!ready?'Opening the bar…':entering?'Come on in':'Play'}</span><span aria-hidden>↗</span></button><span className="hub-menu-foot">POKER WITH YOUR PEOPLE</span></div>}
    {failed&&<div className="hub-webgl-fallback" role="alert"><span aria-hidden>♠</span><h2>The lounge needs a 3D-capable browser.</h2><p>You can still play poker in Table View.</p><button onClick={props.onTableView}>Use Table View <span aria-hidden>↗</span></button></div>}
    {props.entered&&!failed&&<>
      {!poolActive&&<div className="hub-world-caption"><span>THE NIGHT IS YOURS</span><p>Find the bartender to host or join your table.</p></div>}
      {hint&&<div className="hub-status-toast" role="status">{hint}</div>}
      {!poolActive&&<div className={`hub-interact ${near?'available':''}`} aria-live="polite">{near?<><span className="hub-interact-name">{near==='bar'?'THE BARTENDER':'THE POOL TABLE'}</span><button onClick={()=>commands.current?.interact()}><kbd>E</kbd>{near==='bar'?'Talk to the bartender':'Play a little pool'}<span aria-hidden>↗</span></button><small>{near==='bar'?'Host a room · Join your friends':'Local practice · Join a room to challenge friends'}</small></>:<span className="hub-explore-hint">Drag to look around</span>}</div>}
      {!poolActive&&<div className="hub-walk-guide" aria-label="Movement instructions"><span className="hub-key-cluster"><kbd>W</kbd><span><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span></span><span>Walk around<br/><small>Drag to look · E to interact</small></span></div>}
      {!poolActive&&<div className="hub-touch-walk" aria-label="Touch movement controls">{[{key:'w',label:'Walk forward',symbol:'↑'},{key:'a',label:'Walk left',symbol:'←'},{key:'s',label:'Walk backward',symbol:'↓'},{key:'d',label:'Walk right',symbol:'→'}].map(({key,label,symbol})=><button key={key} className={`hub-move-${key}`} aria-label={label} onPointerDown={event=>{event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);mobileMove(key,true);}} onPointerUp={()=>mobileMove(key,false)} onPointerCancel={()=>mobileMove(key,false)} onLostPointerCapture={()=>mobileMove(key,false)}>{symbol}</button>)}</div>}
      {poolActive&&<PoolControls status={poolStatus} power={power} commands={commands.current}/>}
    </>}
    {!props.entered&&!failed&&<footer className="hub-menu-bottom"><span>2–10 FRIENDS <i/> NO HOUSE. JUST US.</span><span>LEAVE THE WORLD AT THE DOOR.</span></footer>}
  </section>;
}
