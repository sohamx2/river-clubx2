'use client';

import {useEffect, useRef, useState} from 'react';
import * as THREE from 'three';
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
    const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
    const geo=<T extends THREE.BufferGeometry>(value:T):T=>{geometries.add(value);return value;};
    const mat=<T extends THREE.Material>(value:T):T=>{materials.add(value);return value;};
    const tex=<T extends THREE.Texture>(value:T):T=>{textures.add(value);value.colorSpace=THREE.SRGBColorSpace;return value;};
    const standard=(color:string,extra:THREE.MeshStandardMaterialParameters={})=>mat(new THREE.MeshStandardMaterial({color,roughness:.74,...extra}));
    const cube=geo(new THREE.BoxGeometry(1,1,1));
    const cylinder=geo(new THREE.CylinderGeometry(1,1,1,32));
    const sphere=geo(new THREE.SphereGeometry(1,20,16));
    const white=standard('#e0d8be'),brass=standard('#a17b3e',{metalness:.72,roughness:.35});
    const darkWood=standard('#392419',{roughness:.55}),leather=standard('#243d32'),black=standard('#151715');
    const warmGlow=mat(new THREE.MeshBasicMaterial({color:'#ffd897'}));
    const add=(geometry:THREE.BufferGeometry,paint:THREE.Material,parent:THREE.Object3D,position:[number,number,number],scale:[number,number,number])=>{
      const object=new THREE.Mesh(geometry,paint);object.position.set(...position);object.scale.set(...scale);object.castShadow=true;object.receiveShadow=true;parent.add(object);return object;
    };
    const box=(paint:THREE.Material,parent:THREE.Object3D,position:[number,number,number],scale:[number,number,number])=>add(cube,paint,parent,position,scale);
    const tube=(paint:THREE.Material,parent:THREE.Object3D,position:[number,number,number],scale:[number,number,number])=>add(cylinder,paint,parent,position,scale);
    const orb=(paint:THREE.Material,parent:THREE.Object3D,position:[number,number,number],scale:[number,number,number])=>add(sphere,paint,parent,position,scale);
    function canvasTexture(width:number,height:number,draw:(ctx:CanvasRenderingContext2D)=>void){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d')!;draw(ctx);return tex(new THREE.CanvasTexture(canvas));}
    function sign(text:string,subtitle:string,width:number,height:number,position:[number,number,number],rotationY=0){
      const map=canvasTexture(1024,512,ctx=>{ctx.fillStyle='#17251f';ctx.fillRect(0,0,1024,512);ctx.strokeStyle='#ba9558';ctx.lineWidth=5;ctx.strokeRect(24,24,976,464);ctx.strokeStyle='#5e654b';ctx.lineWidth=2;ctx.strokeRect(36,36,952,440);ctx.textAlign='center';ctx.fillStyle='#f2dbac';ctx.font='56px Georgia';ctx.fillText('♠',512,130);ctx.font='68px Georgia';ctx.fillText(text,512,246);ctx.font='23px Arial';ctx.letterSpacing='5px';ctx.fillStyle='#b5b198';ctx.fillText(subtitle,512,340);});
      return add(geo(new THREE.PlaneGeometry(width,height)),mat(new THREE.MeshBasicMaterial({map})),scene,position,[1,1,1]).rotateY(rotationY);
    }
    const floorMap=canvasTexture(1024,1024,ctx=>{ctx.fillStyle='#59402e';ctx.fillRect(0,0,1024,1024);for(let row=0;row<8;row++){const y=row*128;ctx.fillStyle=row%2?'#503726':'#644936';ctx.fillRect(0,y,1024,128);for(let line=0;line<17;line++){ctx.strokeStyle=`rgba(15,8,3,${.025+(line%3)*.008})`;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,y+line*7.2+8);ctx.bezierCurveTo(300,y+line*7.2+4,680,y+line*7.2+13,1024,y+line*7.2+6);ctx.stroke();}ctx.fillStyle='#281d16';ctx.fillRect(0,y,1024,3);for(let column=0;column<2;column++){const x=((row%3)*149+column*512)%1024;ctx.fillRect(x,y,2,128);}}});floorMap.wrapS=floorMap.wrapT=THREE.RepeatWrapping;floorMap.repeat.set(5,5);floorMap.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),4);
    box(standard('#b99b7a',{map:floorMap,roughness:.68}),scene,[0,-.09,0],[20,.18,21]);
    const brickMap=canvasTexture(768,384,ctx=>{ctx.fillStyle='#281c17';ctx.fillRect(0,0,768,384);for(let y=0;y<6;y++)for(let x=-1;x<7;x++){ctx.fillStyle=['#4a3024','#543528','#40291f','#4b3428'][(x+10+y*3)%4];ctx.fillRect(x*128+(y%2)*64+3,y*64+3,122,57);ctx.fillStyle='#1d171333';ctx.fillRect(x*128+(y%2)*64+3,y*64+52,122,8);}});brickMap.wrapS=brickMap.wrapT=THREE.RepeatWrapping;brickMap.repeat.set(4,1.5);
    const wall=standard('#c4a38b',{map:brickMap});
    box(wall,scene,[0,2.25,-10],[20,4.5,.25]);box(wall,scene,[-10,2.25,0],[.25,4.5,20]);box(wall,scene,[10,2.25,0],[.25,4.5,20]);box(wall,scene,[0,2.25,10],[20,4.5,.25]);
    const panel=standard('#32291f');
    for(const side of [-1,1]){box(panel,scene,[side*9.83,.53,0],[.12,1.06,20]);box(brass,scene,[side*9.72,1.08,0],[.06,.055,20]);for(let z=-9;z<=9;z+=1.4)box(darkWood,scene,[side*9.66,.53,z],[.08,1.05,.065]);}
    box(panel,scene,[0,.53,-9.84],[20,1.06,.12]);box(brass,scene,[0,1.08,-9.72],[20,.055,.06]);
    box(standard('#201a17'),scene,[0,4.45,0],[20,.18,21]);
    for(let z=-8;z<=8;z+=4){box(darkWood,scene,[0,4.12,z],[20,.43,.28]);box(darkWood,scene,[-9.2,2,z],[.3,4,.3]);box(darkWood,scene,[9.2,2,z],[.3,4,.3]);}
    scene.add(new THREE.HemisphereLight('#e9cfa0','#243328',1.0));scene.add(new THREE.AmbientLight('#ad8a68',.7));
    function pendant(x:number,z:number,y=3.2,green=false){
      tube(black,scene,[x,(y+4.25)/2,z],[.018,4.25-y,.018]);
      const shade=add(geo(new THREE.ConeGeometry(.58,.32,32,1,true)),standard(green?'#1c4a37':'#352a1e',{side:THREE.DoubleSide,metalness:.35,roughness:.45}),scene,[x,y,z],[1,1,1]);shade.rotation.z=Math.PI;
      tube(brass,scene,[x,y+.16,z],[.12,.07,.12]);tube(warmGlow,scene,[x,y-.12,z],[.43,.018,.43]);
      const lamp=new THREE.PointLight('#ffd294',23,8,2);lamp.position.set(x,y-.23,z);lamp.castShadow=false;scene.add(lamp);
    }
    pendant(-6,-3,3.15,true);pendant(.9,.6,3.25,true);pendant(2,-6.4,3.15);pendant(6.4,-6.4,3.15);
    const keyLight=new THREE.SpotLight('#ffca91',75,14,Math.PI*.32,.6,1.5);keyLight.position.set(2.5,4,-5.6);keyLight.target.position.set(BAR.x,1,-7.3);keyLight.castShadow=renderer.shadowMap.enabled;keyLight.shadow.mapSize.set(1024,1024);keyLight.shadow.bias=-.001;scene.add(keyLight,keyLight.target);
    const pokerLight=new THREE.SpotLight('#ffdfaf',48,10,Math.PI*.28,.7,1.5);pokerLight.position.set(.9,3.7,.6);pokerLight.target.position.set(.9,.9,.6);scene.add(pokerLight,pokerLight.target);
    // A proper counter, with a warm back bar and bottles. The bartender is the room menu.
    const bar=new THREE.Group();bar.position.set(BAR.x,0,BAR.z);scene.add(bar);
    box(darkWood,bar,[0,.62,0],[8.5,1.24,1.35]);box(standard('#5c3825',{roughness:.28}),bar,[0,1.3,0],[8.9,.18,1.58]);box(brass,bar,[0,1.22,.78],[8.8,.045,.025]);
    for(let x=-3.9;x<4.2;x+=1.3){box(standard('#3d2a20'),bar,[x,.63,.69],[1.08,.87,.028]);box(brass,bar,[x,1.05,.713],[.96,.02,.025]);}
    const footRail=tube(brass,bar,[0,.27,1.05],[.035,8.7,.035]);footRail.rotation.z=Math.PI/2;
    for(const x of [-3.4,-1.15,1.15,3.4]){tube(black,bar,[x,.37,1.9],[.055,.7,.055]);tube(black,bar,[x,.06,1.9],[.31,.08,.31]);tube(standard('#543e31'),bar,[x,.76,1.9],[.35,.13,.35]);tube(brass,bar,[x,.44,1.9],[.23,.025,.23]);}
    box(darkWood,scene,[4.2,2.15,-9.4],[8.7,2.52,.32]);
    const shelfWood=standard('#67462c',{roughness:.45});
    for(const y of [1.18,2.04,2.91]){box(shelfWood,scene,[4.2,y,-9.03],[8.6,.1,.73]);box(warmGlow,scene,[4.2,y-.055,-8.84],[8.3,.017,.018]);}
    for(const x of [.05,2.15,6.3,8.45])box(shelfWood,scene,[x,2.05,-9.14],[.07,2.52,.68]);
    const bottles=['#304f34','#a47730','#4b384c','#62715b','#4f291c'];
    for(let row=0;row<3;row++)for(let i=0;i<18;i++){if(row===2&&i>5&&i<13)continue;const x=.3+i*.46,y=1.24+row*.86,h=.27+(i%3)*.055;const paint=standard(bottles[(i*3+row)%5],{metalness:.12,roughness:.22});tube(paint,scene,[x,y+h/2,-8.89],[.085,h,.085]);tube(paint,scene,[x,y+h+.065,-8.89],[.035,.13,.035]);tube(brass,scene,[x,y+h+.13,-8.89],[.04,.025,.04]);box(standard('#c8b386'),scene,[x,y+h/2,-8.802],[.11,.11,.004]);}
    sign('RIVER CLUB','THE GOOD COMPANY SOCIAL CLUB',3.7,1.85,[4.2,3.36,-9.15]);
    sign('HOUSE RULES','BE KIND. DEAL FAIR. STAY A WHILE.',2.2,1.1,[-2.5,2.4,-9.79]);
    // Original, expressive stick-human host. No licensed character/model assets.
    const bartender=new THREE.Group();bartender.position.set(4.2,0,-8.12);scene.add(bartender);
    const skin=standard('#d6ac85'),shirt=standard('#d4cbb5'),apron=standard('#293d35'),hair=standard('#2d211a');
    function segment(parent:THREE.Object3D,a:THREE.Vector3,b:THREE.Vector3,r:number,paint:THREE.Material){const object=tube(paint,parent,[0,0,0],[r,a.distanceTo(b),r]);object.position.copy(a).add(b).multiplyScalar(.5);object.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());return object;}
    const body=new THREE.Group();bartender.add(body);orb(shirt,body,[0,1.3,0],[.30,.47,.18]);box(apron,body,[0,1.21,.175],[.39,.61,.035]);segment(body,new THREE.Vector3(-.17,1.7,0),new THREE.Vector3(-.1,1.3,.2),.025,apron);segment(body,new THREE.Vector3(.17,1.7,0),new THREE.Vector3(.1,1.3,.2),.025,apron);
    tube(skin,body,[0,1.76,0],[.085,.16,.085]);const head=new THREE.Group();head.position.set(0,1.99,0);body.add(head);orb(skin,head,[0,0,0],[.24,.28,.225]);orb(hair,head,[0,.15,-.025],[.245,.15,.225]);
    const faceMap=canvasTexture(256,256,ctx=>{ctx.clearRect(0,0,256,256);ctx.strokeStyle='#30241c';ctx.fillStyle='#30241c';ctx.lineWidth=7;ctx.lineCap='round';for(const x of [83,173]){ctx.beginPath();ctx.arc(x,113,8,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(x-17,91);ctx.quadraticCurveTo(x,83,x+15,88);ctx.stroke();}ctx.beginPath();ctx.moveTo(97,153);ctx.quadraticCurveTo(128,176,159,153);ctx.stroke();});
    add(geo(new THREE.PlaneGeometry(.4,.4)),mat(new THREE.MeshBasicMaterial({map:faceMap,transparent:true,depthWrite:false})),head,[0,-.015,.219],[1,1,1]);
    const leftArm=new THREE.Group();leftArm.position.set(-.26,1.58,0);body.add(leftArm);segment(leftArm,new THREE.Vector3(),new THREE.Vector3(-.2,-.25,.12),.065,shirt);segment(leftArm,new THREE.Vector3(-.2,-.25,.12),new THREE.Vector3(-.1,-.30,.52),.056,skin);orb(skin,leftArm,[-.1,-.30,.52],[.08,.055,.09]);
    const rightArm=new THREE.Group();rightArm.position.set(.26,1.58,0);body.add(rightArm);segment(rightArm,new THREE.Vector3(),new THREE.Vector3(.18,-.25,.12),.065,shirt);segment(rightArm,new THREE.Vector3(.18,-.25,.12),new THREE.Vector3(.33,-.29,.56),.056,skin);orb(skin,rightArm,[.33,-.29,.56],[.08,.055,.09]);
    const glassPaint=standard('#d8e4d0',{transparent:true,opacity:.4,metalness:.15,roughness:.12});for(const x of [-.6,.75]){tube(glassPaint,bar,[x,1.52,.12],[.085,.28,.085]);tube(standard('#b27e30'),bar,[x,1.47,.12],[.077,.12,.077]);}
    const barInteraction=new THREE.Group();barInteraction.position.set(BAR.x,1.2,BAR.z+.25);scene.add(barInteraction);const hot=box(mat(new THREE.MeshBasicMaterial({visible:false})),barInteraction,[0,0,0],[8.7,2.4,1.85]);hot.userData.interaction='bar';
    // A small home-game table at the heart of the lounge.
    const table=new THREE.Group();table.position.set(.9,0,1.0);scene.add(table);
    tube(darkWood,table,[0,.96,0],[2.8,.21,1.55]);tube(black,table,[0,1.08,0],[2.79,.14,1.54]);tube(standard('#215641',{roughness:.97}),table,[0,1.16,0],[2.57,.045,1.32]);
    for(const x of [-1.65,1.65])for(const z of [-.7,.7])box(darkWood,table,[x,.45,z],[.15,.9,.15]);
    const stitchPoints=[];for(let i=0;i<96;i++){const theta=i/96*Math.PI*2;stitchPoints.push(new THREE.Vector3(Math.cos(theta)*2.46,1.188,Math.sin(theta)*1.22));}const stitchGeo=geo(new THREE.BufferGeometry().setFromPoints(stitchPoints));const stitching=new THREE.LineLoop(stitchGeo,mat(new THREE.LineDashedMaterial({color:'#b3c69c',dashSize:.035,gapSize:.055,transparent:true,opacity:.3})));stitching.computeLineDistances();table.add(stitching);
    const cardMaps=new Map<string,THREE.Texture>();
    for(const [index,label]of ['A♠','K♥','Q♠'].entries()){const map=canvasTexture(128,192,ctx=>{ctx.fillStyle='#f6ecd5';ctx.fillRect(0,0,128,192);ctx.fillStyle=index===1?'#9e3135':'#22382e';ctx.font='bold 37px Georgia';ctx.fillText(label[0],12,41);ctx.font='30px Georgia';ctx.fillText(label[1],12,76);ctx.font='67px Georgia';ctx.textAlign='center';ctx.fillText(label[1],65,132);});cardMaps.set(label,map);const card=add(geo(new THREE.PlaneGeometry(.27,.39)),mat(new THREE.MeshBasicMaterial({map})),table,[-.38+index*.38,1.193,0],[1,1,1]);card.rotation.x=-Math.PI/2;}
    for(let i=0;i<12;i++){const chip=tube(standard(i<6?'#a43b3a':'#dbc480'),table,[.75+(i%3)*.15,1.2+Math.floor(i/3)*.027,.1],[.09,.026,.09]);chip.castShadow=false;}
    function chair(x:number,z:number,angle:number){const root=new THREE.Group();root.position.set(x,0,z);root.rotation.y=angle;scene.add(root);box(leather,root,[0,.57,0],[.68,.17,.64]);box(darkWood,root,[0,1.02,.29],[.73,.86,.12]);box(leather,root,[0,1.06,.21],[.59,.57,.07]);for(const side of [-1,1])for(const depth of [-1,1])box(darkWood,root,[side*.25,.26,depth*.23],[.07,.52,.07]);return root;}
    const chairObstacles:HubObstacle[]=[];for(let i=0;i<8;i++){const angle=i*Math.PI/4;const x=.9+Math.sin(angle)*3.24,z=1+Math.cos(angle)*2.05;chair(x,z,angle);chairObstacles.push({minX:x-.4,maxX:x+.4,minZ:z-.4,maxZ:z+.4});}
    // Side booth, coat hooks, rugs, and a doorway give the space a home rather than a stage.
    const booth=standard('#3f3128');box(booth,scene,[8.9,.46,3.7],[1.2,.77,4.7]);box(booth,scene,[9.38,1.08,3.7],[.23,1.3,4.9]);box(standard('#4d4531'),scene,[8.24,.52,3.7],[.05,.07,4.3]);
    for(const z of [2.3,5]){tube(brass,scene,[7.3,.35,z],[.055,.7,.055]);tube(darkWood,scene,[7.3,.78,z],[.62,.12,.62]);}
    const rug=standard('#423830');box(rug,scene,[.5,.018,6],[5.6,.016,2.7]);for(const x of [-2.17,3.17])box(standard('#957b51'),scene,[x,.028,6],[.035,.01,2.5]);
    box(darkWood,scene,[0,1.5,9.8],[2.45,3.1,.18]);box(standard('#263d32'),scene,[0,1.5,9.68],[2.12,2.8,.10]);for(const x of [-.53,.53])box(standard('#96a388',{transparent:true,opacity:.17}),scene,[x,2.12,9.61],[.76,.9,.025]);orb(brass,scene,[.78,1.25,9.56],[.04,.04,.04]);
    sign('POOL','PULL UP FOR A GAME',2.35,1.18,[-9.79,2.35,-3],Math.PI/2);
    sign('TAKE YOUR TIME','THE NIGHT IS STILL YOUNG',2.1,1.05,[9.78,2.55,4.1],-Math.PI/2);
    // Low-cost warm wall fixtures, with no full-screen post processing.
    for(const side of [-1,1])for(const z of [-6,2,7]){box(brass,scene,[side*9.7,2.6,z],[.12,.6,.18]);orb(warmGlow,scene,[side*9.56,2.58,z],[.1,.21,.1]);const glow=new THREE.PointLight('#e9a861',6,3.8,2);glow.position.set(side*9.3,2.6,z);scene.add(glow);}
    const pool=createPoolWorld({scene,onStatus:setPoolStatus,onPlayingChange:active=>{poolMode=active;setPoolActive(active);held.clear();resize();}});
    const stoolObstacles=[-3.4,-1.15,1.15,3.4].map(offset=>({minX:BAR.x+offset-.34,maxX:BAR.x+offset+.34,minZ:BAR.z+1.56,maxZ:BAR.z+2.24}));
    const obstacles:HubObstacle[]=[{minX:-2,maxX:3.8,minZ:-.6,maxZ:2.6},{minX:-.4,maxX:8.8,minZ:-7.66,maxZ:-5.94},POOL_BOUNDS,{minX:8.2,maxX:9.7,minZ:1.2,maxZ:6.2},...chairObstacles,...stoolObstacles];
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
    const beginPull=()=>{if(!blocked()&&!pool.getState().moving){pullStarted=performance.now();setDraw(0);}};
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
      if(!reduced){head.rotation.y=THREE.MathUtils.clamp(Math.atan2(player.x-bartender.position.x,player.z-bartender.position.z),-.7,.7);rightArm.rotation.z=Math.sin(time*.0015)*.045;body.position.y=Math.sin(time*.0012)*.008;}
      const fps=renderer.domElement.clientWidth<650?30:45;if(time-lastDraw<1000/fps)return;lastDraw=time;renderer.render(scene,camera);
    }
    frame=requestAnimationFrame(tick);
    return()=>{disposed=true;cancelAnimationFrame(frame);if(hintTimer)clearTimeout(hintTimer);observer.disconnect();commands.current=null;pool.dispose();window.removeEventListener('keydown',keyDown);window.removeEventListener('keyup',keyUp);window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',blur);renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointermove',pointerMove);renderer.domElement.removeEventListener('pointerup',pointerUp);renderer.domElement.removeEventListener('pointercancel',cancelPointer);renderer.domElement.removeEventListener('webglcontextlost',contextLost);geometries.forEach(value=>value.dispose());materials.forEach(value=>value.dispose());textures.forEach(value=>value.dispose());renderer.dispose();renderer.domElement.remove();};
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
      {!poolActive&&<div className={`hub-interact ${near?'available':''}`} aria-live="polite">{near?<><span className="hub-interact-name">{near==='bar'?'THE BARTENDER':'THE POOL TABLE'}</span><button onClick={()=>commands.current?.interact()}><kbd>E</kbd>{near==='bar'?'Talk to the bartender':'Play a little pool'}<span aria-hidden>↗</span></button><small>{near==='bar'?'Host a room · Join your friends':'Local practice · Real ball physics'}</small></>:<span className="hub-explore-hint">Drag to look around</span>}</div>}
      {!poolActive&&<div className="hub-walk-guide" aria-label="Movement instructions"><span className="hub-key-cluster"><kbd>W</kbd><span><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span></span><span>Walk around<br/><small>Drag to look · E to interact</small></span></div>}
      {!poolActive&&<div className="hub-touch-walk" aria-label="Touch movement controls">{[{key:'w',label:'Walk forward',symbol:'↑'},{key:'a',label:'Walk left',symbol:'←'},{key:'s',label:'Walk backward',symbol:'↓'},{key:'d',label:'Walk right',symbol:'→'}].map(({key,label,symbol})=><button key={key} className={`hub-move-${key}`} aria-label={label} onPointerDown={event=>{event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);mobileMove(key,true);}} onPointerUp={()=>mobileMove(key,false)} onPointerCancel={()=>mobileMove(key,false)} onLostPointerCapture={()=>mobileMove(key,false)}>{symbol}</button>)}</div>}
      {poolActive&&<aside className="hub-pool-controls" aria-label="Pool practice controls"><div className="hub-pool-title"><span><small>FIRST PERSON POOL</small><strong>A little pool.</strong></span><button aria-label="Leave pool table" onClick={()=>commands.current?.leavePool()}>✕</button></div><p aria-live="polite">{poolStatus.message}</p><div className="hub-pool-score"><span>{poolStatus.pocketed} / 15 <small>POCKETED</small></span><span>{poolStatus.shots} <small>SHOTS</small></span><button onClick={()=>commands.current?.resetPool()}>Re-rack</button></div><div className="pool-draw-meter" role="meter" aria-label="Cue pullback" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(power*100)}><span style={{width:`${power*100}%`}}/></div><button className="hub-pool-shoot" onPointerDown={event=>{event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);commands.current?.beginPull();}} onPointerUp={()=>commands.current?.releasePull()} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();if(!event.repeat)commands.current?.beginPull();}}} onKeyUp={event=>{if(event.key==='Enter'){event.preventDefault();commands.current?.releasePull();}}} onPointerCancel={()=>commands.current?.cancelPull()} onLostPointerCapture={()=>commands.current?.cancelPull()} disabled={poolStatus.moving}>{poolStatus.moving?'Balls in motion…':power>.01?'Release to shoot':'Hold to draw cue'} <span aria-hidden>↗</span></button><small className="hub-pool-note">Move pointer to aim · drag down on the table & release to shoot<br/>Or hold Space / the button · Local practice · Esc to leave</small></aside>}
    </>}
    {!props.entered&&!failed&&<footer className="hub-menu-bottom"><span>2–10 FRIENDS <i/> NO HOUSE. JUST US.</span><span>LEAVE THE WORLD AT THE DOOR.</span></footer>}
  </section>;
}
