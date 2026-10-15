import * as THREE from 'three';
import {advancePool,createPoolGame,poolMoving,poolPockets,strikePool,type PoolGame} from '@/lib/pool-physics';

export const POOL_POSITION={x:-6,y:1.05,z:-3} as const;
export const POOL_BOUNDS={minX:-7.62,maxX:-4.38,minZ:-3.92,maxZ:-2.08} as const;
export interface PoolStatus {moving:boolean;pocketed:number;shots:number;scratched:boolean;message:string}
export interface PoolWorld {
  group:THREE.Group;bounds:typeof POOL_BOUNDS;update:(dt:number)=>void;
  handleRaycast:(raycaster:THREE.Raycaster)=>boolean;aimAt:(raycaster:THREE.Raycaster)=>boolean;
  setActive:(active:boolean)=>void;shoot:(power:number)=>boolean;reset:()=>void;
  getState:()=>PoolStatus;dispose:()=>void;
}
/** A self-contained, local practice table. The hub owns accessible/touch shot controls. */
export function createPoolWorld(options:{scene:THREE.Scene;onStatus?:(status:PoolStatus)=>void;onPlayingChange?:(active:boolean)=>void}):PoolWorld {
  const group=new THREE.Group();group.position.set(POOL_POSITION.x,0,POOL_POSITION.z);options.scene.add(group);
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
  const geometry=<T extends THREE.BufferGeometry>(g:T):T=>{geometries.add(g);return g;};
  const material=<T extends THREE.Material>(m:T):T=>{materials.add(m);return m;};
  const wood=material(new THREE.MeshStandardMaterial({color:'#4d2c1d',roughness:.5}));
  const brass=material(new THREE.MeshStandardMaterial({color:'#bd9b5a',metalness:.7,roughness:.35}));
  const cushion=material(new THREE.MeshStandardMaterial({color:'#154c47',roughness:.9}));
  const felt=material(new THREE.MeshStandardMaterial({color:'#256a62',roughness:1}));
  const black=material(new THREE.MeshStandardMaterial({color:'#080b0a',roughness:.9}));
  const addBox=(w:number,h:number,d:number,x:number,y:number,z:number,paint:THREE.Material)=>{
    const mesh=new THREE.Mesh(geometry(new THREE.BoxGeometry(w,h,d)),paint);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;
  };
  addBox(3.24,.27,1.84,0,.86,0,wood);
  addBox(2.88,.07,1.44,0,POOL_POSITION.y-.035,0,felt);
  for(const z of [-.82,.82])addBox(3.2,.12,.16,0,1.04,z,wood);
  for(const x of [-1.54,1.54])addBox(.16,.12,1.5,x,1.04,0,wood);
  // Cushions stop at the mouths, leaving six visible recessed pockets.
  for(const z of [-.744,.744])for(const x of [-.72,.72])addBox(1.22,.065,.055,x,1.065,z,cushion);
  for(const x of [-1.464,1.464])addBox(.055,.065,1.19,x,1.065,0,cushion);
  for(const x of [-1.25,1.25])for(const z of [-.56,.56]){
    addBox(.13,.78,.13,x,.4,z,wood);addBox(.18,.06,.18,x,.05,z,brass);
  }
  const poolConfig=createPoolGame().config;
  for(const p of poolPockets(poolConfig)){
    const hole=new THREE.Mesh(geometry(new THREE.CylinderGeometry(.12,.1,.08,24)),black);
    hole.position.set(p.x,POOL_POSITION.y+.004,p.z);group.add(hole);
  }
  for(const x of [-1.08,-.72,-.36,.36,.72,1.08])for(const z of [-.825,.825]){
    const diamond=new THREE.Mesh(geometry(new THREE.BoxGeometry(.025,.006,.025)),brass);
    diamond.position.set(x,1.105,z);diamond.rotation.y=Math.PI/4;group.add(diamond);
  }
  const colors=['#f5f2df','#e7b52b','#2456b4','#b32f39','#692c88','#de7832','#247447','#8c292e','#171a1b'];
  const sphere=geometry(new THREE.SphereGeometry(poolConfig.ballRadius,22,16));
  const ballMeshes=new Map<number,THREE.Mesh<THREE.SphereGeometry,THREE.MeshStandardMaterial>>();
  function ballTexture(id:number){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;
    const ctx=canvas.getContext('2d')!;
    const color=colors[id>8?id-8:id];ctx.fillStyle=id>8?'#f5f2df':color;ctx.fillRect(0,0,512,256);
    if(id>8){ctx.fillStyle=color;ctx.fillRect(0,64,512,128);}
    if(id>0)for(const x of [128,384]){
      ctx.beginPath();ctx.arc(x,128,30,0,Math.PI*2);ctx.fillStyle='#fff9e8';ctx.fill();
      ctx.fillStyle='#15171b';ctx.font='bold 37px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(id),x,130);
    }
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;textures.add(texture);return texture;
  }
  let game:PoolGame=createPoolGame(),active=false;
  const aim=new THREE.Vector2(1,0),axis=new THREE.Vector3();
  for(const b of game.balls){
    const mesh=new THREE.Mesh(sphere,material(new THREE.MeshStandardMaterial({map:ballTexture(b.id),roughness:.22,metalness:.04})));
    mesh.castShadow=true;mesh.position.set(b.x,POOL_POSITION.y+poolConfig.ballRadius,b.z);ballMeshes.set(b.id,mesh);group.add(mesh);
  }
  const lineGeometry=geometry(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]));
  const guide=new THREE.Line(lineGeometry,material(new THREE.LineDashedMaterial({color:'#f6e9b9',dashSize:.08,gapSize:.045,transparent:true,opacity:.85,depthTest:false})));guide.renderOrder=3;guide.frustumCulled=false;group.add(guide);
  const cue=new THREE.Mesh(geometry(new THREE.CylinderGeometry(.011,.018,1.22,10)),material(new THREE.MeshStandardMaterial({color:'#c8a16b',roughness:.7})));group.add(cue);
  const tip=new THREE.Mesh(geometry(new THREE.CylinderGeometry(.012,.012,.025,10)),material(new THREE.MeshStandardMaterial({color:'#60a4bf'})));
  tip.position.y=.61;cue.add(tip);
  const feltPlane=new THREE.Plane(new THREE.Vector3(0,1,0),-POOL_POSITION.y);
  const point=new THREE.Vector3(),yAxis=new THREE.Vector3(0,1,0),direction=new THREE.Vector3();
  let lastStatus='';
  function getState():PoolStatus {
    const moving=poolMoving(game),pocketed=game.balls.filter(b=>b.id>0&&b.pocketed).length;
    return{moving,pocketed,shots:game.shots,scratched:game.scratched,message:moving?'Balls rolling…':pocketed===15?'Rack cleared. Reset for another game.':game.scratched?'Scratch. Cue ball returned — aim your next shot.':'Aim on the felt, choose power, then shoot.'};
  }
  function report(){const state=getState(),key=JSON.stringify(state);if(key!==lastStatus){lastStatus=key;options.onStatus?.(state);}}
  function updateGuide(){
    const ball=game.balls[0],visible=active&&!poolMoving(game)&&!ball.pocketed;
    guide.visible=visible;cue.visible=visible;if(!visible)return;
    // The preview stops at the first ball or rail; it does not promise a calculated outcome.
    const dx=aim.x,dz=aim.y,r=game.config.ballRadius,limitX=game.config.halfWidth-r,limitZ=game.config.halfDepth-r;
    let distance=3.4;
    if(dx>.0001)distance=Math.min(distance,(limitX-ball.x)/dx);
    if(dx<-.0001)distance=Math.min(distance,(-limitX-ball.x)/dx);
    if(dz>.0001)distance=Math.min(distance,(limitZ-ball.z)/dz);
    if(dz<-.0001)distance=Math.min(distance,(-limitZ-ball.z)/dz);
    for(const target of game.balls){
      if(target.id===0||target.pocketed)continue;
      const tx=target.x-ball.x,tz=target.z-ball.z,along=tx*dx+tz*dz,across=tx*dz-tz*dx;
      if(along>0&&Math.abs(across)<r*2)distance=Math.min(distance,along-Math.sqrt(r*r*4-across*across));
    }
    const p=lineGeometry.getAttribute('position') as THREE.BufferAttribute;
    p.setXYZ(0,ball.x,POOL_POSITION.y+r,ball.z);p.setXYZ(1,ball.x+dx*Math.max(.02,distance),POOL_POSITION.y+r,ball.z+dz*Math.max(.02,distance));p.needsUpdate=true;guide.computeLineDistances();
    cue.position.set(ball.x-dx*.76,POOL_POSITION.y+r,ball.z-dz*.76);
    direction.set(dx,0,dz);cue.quaternion.setFromUnitVectors(yAxis,direction);
  }
  function setActive(value:boolean){if(active===value)return;active=value;updateGuide();options.onPlayingChange?.(active);report();}
  function aimAt(raycaster:THREE.Raycaster){
    if(!active||poolMoving(game)||!raycaster.ray.intersectPlane(feltPlane,point))return false;
    group.worldToLocal(point);
    if(Math.abs(point.x)>game.config.halfWidth+.05||Math.abs(point.z)>game.config.halfDepth+.05)return false;
    const b=game.balls[0],dx=point.x-b.x,dz=point.z-b.z;
    if(Math.hypot(dx,dz)<.025)return false;
    aim.set(dx,dz).normalize();updateGuide();return true;
  }
  function handleRaycast(raycaster:THREE.Raycaster){
    if(active)return aimAt(raycaster);
    if(!raycaster.intersectObject(group,true).length)return false;
    setActive(true);return true;
  }
  function update(dt:number){
    advancePool(game,dt);
    for(const b of game.balls){
      const mesh=ballMeshes.get(b.id)!;
      if(b.pocketed){mesh.visible=false;continue;}
      const dx=b.x-mesh.position.x,dz=b.z-mesh.position.z,distance=Math.hypot(dx,dz);
      mesh.visible=true;
      if(distance>.000001){axis.set(dz/distance,0,-dx/distance);mesh.rotateOnWorldAxis(axis,distance/game.config.ballRadius);}
      mesh.position.set(b.x,POOL_POSITION.y+game.config.ballRadius,b.z);
    }
    updateGuide();report();
  }
  function shoot(power:number){if(!active)return false;const result=strikePool(game,aim.x,aim.y,power);updateGuide();report();return result;}
  function reset(){game=createPoolGame();aim.set(1,0);for(const mesh of ballMeshes.values())mesh.rotation.set(0,0,0);update(0);}
  update(0);
  return{group,bounds:POOL_BOUNDS,update,handleRaycast,aimAt,setActive,shoot,reset,getState,dispose:()=>{
    group.removeFromParent();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();
  }};
}
