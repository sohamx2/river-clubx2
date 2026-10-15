'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { characterExpression, EXPRESSION_LABELS, type CharacterExpression } from '@/lib/table-characters';
import type { HeadPose } from '@/lib/presence-types';
import type { PublicPlayer, RoomView, Theme } from '@/lib/types';
import { chipBreakdown, CHIP_VALUES, DIE_ROLL_MS, OCEAN_WAVE_MS } from '@/lib/table-scene';
import {resolveTableWalk} from '@/lib/table-walk';
import {drawTrackedFace} from '@/lib/draw-tracked-face';
import {FACE_FIELDS,type FacePose} from '@/lib/face-pose';

interface SceneProps {
  room: RoomView;
  now: number;
  pose: HeadPose;
  poses: Record<string, HeadPose>;
  streams: Record<string, MediaStream>;
  localStream: MediaStream | null;
  topDown: boolean;
  onBookOpen?: () => void;
  bookOpen?: boolean;
  onReady?: (ready: boolean) => void;
  onWalkingChange?: (walking:boolean)=>void;
  walkReset?:number;
  walkInput?:{forward:number;right:number};
}

const PALETTES: Record<Theme, { felt: string; wall: string; wood: string; rail: string; light: string; accent: string; card: string; ink: string; red: string; back: string }> = {
  classic: { felt: '#185d46', wall: '#302019', wood: '#774c2d', rail: '#39271d', light: '#ffcc8c', accent: '#e6dcaf', card: '#fff9ed', ink: '#192f28', red: '#bb314b', back: '#1f5b47' },
  dark: { felt: '#263746', wall: '#181d26', wood: '#48404a', rail: '#1d232c', light: '#d1defa', accent: '#d0d9f1', card: '#dce9ed', ink: '#183241', red: '#b72452', back: '#22324b' },
  astral: { felt: '#252b59', wall: '#131627', wood: '#3e3059', rail: '#17162c', light: '#bfceff', accent: '#c6b5ff', card: '#171e43', ink: '#e1eeff', red: '#ff90c5', back: '#22234e' },
  metalluxe: { felt: '#28302c', wall: '#1a1813', wood: '#5e4930', rail: '#201c17', light: '#ffe0a1', accent: '#e9bc62', card: '#17191b', ink: '#e9c06b', red: '#ffd59f', back: '#191c20' },
  cyberpunk: { felt: '#232956', wall: '#101423', wood: '#332747', rail: '#19182a', light: '#9dadff', accent: '#66e8ff', card: '#111c35', ink: '#9aefff', red: '#ff83cf', back: '#192644' },
};

interface Actor {
  root: THREE.Group;
  head: THREE.Group;
  face: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  nameplate: THREE.Sprite;
  cards: THREE.Group;
  reaction: THREE.Sprite;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  expression?: CharacterExpression;
  label?: string;
  hole?: string;
  videoStream?: MediaStream;
  video?: HTMLVideoElement;
  videoTexture?: THREE.VideoTexture;
  idlePhase: number;
}
interface TableMotion {
  object:THREE.Object3D; from:THREE.Vector3; target:THREE.Vector3;
  rotation:THREE.Quaternion; start:number; duration:number; arc:number; spin:number; remove:boolean;
}
const FELT_Y = 1.185;

/** A real, original 3D room. Game rules and camera permission stay outside this renderer. */
export function ThreePokerScene(props: SceneProps) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef(props);
  live.current = props;

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch {
      live.current.onReady?.(false);
      return;
    }

    const palette = PALETTES[live.current.room.settings.theme];
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(palette.wall);
    scene.fog = new THREE.Fog(palette.wall, 10, 27);
    const camera = new THREE.PerspectiveCamera(61, 1, 0.06, 36);
    const viewTarget = new THREE.Vector3();
    const seatedTarget = new THREE.Vector3();
    const overheadTarget = new THREE.Vector3(0, 1.35, 0);
    const seatedPosition = new THREE.Vector3();
    const overheadPosition = new THREE.Vector3();
    const worldUp = new THREE.Vector3(0, 1, 0);
    scene.add(camera);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    renderer.shadowMap.enabled = element.clientWidth > 700;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;position:absolute;inset:0';
    renderer.domElement.setAttribute('aria-hidden', 'true');
    element.appendChild(renderer.domElement);

    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    const actors = new Map<string, Actor>();
    const emptySeats = new THREE.Group();
    const boards = new THREE.Group();
    const heldCards = new THREE.Group();
    const hands = new THREE.Group();
    const world = new THREE.Group();
    const chipsOnTable = new THREE.Group(), flyingChips = new THREE.Group(), muck = new THREE.Group();
    scene.add(world, boards, emptySeats, heldCards, hands, chipsOnTable, flyingChips, muck);
    let disposed = false;
    let animationFrame = 0;
    let narrow = false;
    let layoutSignature = '';
    let boardSignature = '';
    let handSignature = '';
    let lastRendered = 0;
    let walking=false,walkYaw=0,walkPitch=-.35,walkReset=live.current.walkReset;
    let walkPosition={x:0,z:3.55};
    const walkKeys=new Set<string>();
    let walkPointer:{id:number;x:number;y:number}|null=null;
    let currentYaw = 0;
    let currentPitch = 0;
    let topDownBlend = 0;
    let previousFrame = 0;
    let bookBlend = 0;
    let loungeBlend = 0;
    let bookHovered = false;
    let eventHand = -1;
    let eventsInitialized = false;
    let dealerCue: {handNo:number;start:number;players:string[];rounds:number;dealerId:string}|null = null;
    let oceanStarted = -Infinity;
    let dieStarted = -Infinity;
    let dieValue = 0;
    let posterSignature = '';
    let lastShownBoard:string[]=[];
    let boardBeforeDie:string[]|null=null;
    const seenEvents = new Set<string>();
    const gestures = new Map<string,{kind:'check'|'fold'|'bet';start:number}>();
    const stackGroups = new Map<string,THREE.Group>();
    const born = performance.now();
    const motions:TableMotion[] = [];
    const geometry = <T extends THREE.BufferGeometry>(value: T): T => { geometries.add(value); return value; };
    const material = <T extends THREE.Material>(value: T): T => { materials.add(value); return value; };
    const texture = <T extends THREE.Texture>(value: T): T => { textures.add(value); value.colorSpace = THREE.SRGBColorSpace; return value; };
    const standard = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => material(new THREE.MeshStandardMaterial({ color, roughness: .78, ...extra }));
    const mesh = <G extends THREE.BufferGeometry, M extends THREE.Material | THREE.Material[]>(shape: G, paint: M, parent: THREE.Object3D, position?: [number, number, number]) => {
      const object = new THREE.Mesh(shape, paint);
      if (position) object.position.set(...position);
      object.castShadow = true; object.receiveShadow = true; parent.add(object); return object;
    };
    const sphere = geometry(new THREE.SphereGeometry(1, 16, 10));
    const cube = geometry(new THREE.BoxGeometry(1, 1, 1));
    const limb = geometry(new THREE.CylinderGeometry(1, 1, 1, 12));
    const cardPlane = geometry(new THREE.PlaneGeometry(.39, .565));
    const cardThickness = geometry(new THREE.BoxGeometry(.397, .573, .009));
    const headPlane = geometry(new THREE.PlaneGeometry(.49, .49));
    const ivory = standard('#e9e0ce');
    const skin = standard('#eac49c', { roughness: .63 });
    const hair = standard('#292124');
    const chairMaterial = standard(palette.rail);
    const chairMetal = standard('#4a4540', { metalness: .5, roughness: .44 });
    const wood = standard(palette.wood, { roughness: .56 });
    const rail = standard(palette.rail, { roughness: .52 });
    const accent = standard(palette.accent, { metalness: .35, roughness: .42 });
    const cardMaterials = new Map<string, THREE.MeshBasicMaterial>();
    const faceTextures = new Map<CharacterExpression, THREE.CanvasTexture>();
    const trackedFaces=new Map<string,{texture:THREE.CanvasTexture;key:string}>();

    function segment(parent: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, radius: number, paint: THREE.Material) {
      const object = mesh(limb, paint, parent);
      const difference = new THREE.Vector3().subVectors(to, from);
      object.scale.set(radius, difference.length(), radius);
      object.position.copy(from).add(to).multiplyScalar(.5);
      object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), difference.normalize());
      return object;
    }
    function ball(parent: THREE.Object3D, paint: THREE.Material, at: [number, number, number], size: [number, number, number]) {
      const object = mesh(sphere, paint, parent, at); object.scale.set(...size); return object;
    }
    function block(parent: THREE.Object3D, paint: THREE.Material, at: [number, number, number], size: [number, number, number]) {
      const object = mesh(cube, paint, parent, at); object.scale.set(...size); return object;
    }
    function drawTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) draw(ctx);
      const result = texture(new THREE.CanvasTexture(canvas));
      result.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
      return result;
    }
    function retireTexture(old?: THREE.Texture | null) {
      if (old) { old.dispose(); textures.delete(old); }
    }
    function labelTexture(title: string, detail: string, action = '', active = false) {
      return drawTexture(512,128,ctx=>{
        ctx.fillStyle=active?'#20352bd4':'#10191c85';ctx.beginPath();ctx.roundRect(12,5,488,118,18);ctx.fill();
        if(active){ctx.fillStyle=palette.accent;ctx.beginPath();ctx.arc(33,31,5,0,Math.PI*2);ctx.fill();}
        ctx.textAlign='center';ctx.fillStyle='#fff8e8';ctx.font='600 44px system-ui';ctx.fillText(title.slice(0,20),256,39,440);
        ctx.fillStyle=palette.accent;ctx.font='700 40px system-ui';ctx.fillText(detail,256,77,450);
        if(action){ctx.fillStyle='#e0e9e4';ctx.font='22px system-ui';ctx.fillText(action,256,108,450);}
      });
    }
    function sprite(map: THREE.Texture, width: number, height: number, parent: THREE.Object3D) {
      const object = new THREE.Sprite(material(new THREE.SpriteMaterial({ map, transparent: true, depthTest: false, toneMapped: false })));
      object.scale.set(width, height, 1); object.renderOrder = 20; parent.add(object); return object;
    }
    function setSpriteTexture(object: THREE.Sprite, next: THREE.Texture) {
      retireTexture(object.material.map); object.material.map = next; object.material.needsUpdate = true;
    }
    const faceMask = drawTexture(256, 256, ctx => {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(128, 128, 123, 126, 0, 0, Math.PI * 2); ctx.fill();
    });
    faceMask.colorSpace = THREE.NoColorSpace;

    // Felt has fine grain rather than a flat color. All room art is generated locally.
    const feltTexture = drawTexture(256, 256, ctx => {
      ctx.fillStyle = palette.felt; ctx.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 256; y += 3) for (let x = 0; x < 256; x += 3) {
        ctx.fillStyle = (x * 7 + y * 13) % 11 < 5 ? '#ffffff09' : '#00000010'; ctx.fillRect(x, y, 1, 2);
      }
      if (live.current.room.settings.theme === 'astral') {
        for (let i = 0; i < 55; i++) { ctx.fillStyle = '#e8eaff77'; ctx.beginPath(); ctx.arc((i * 47) % 256, (i * 83) % 256, i % 7 === 0 ? 1.3 : .6, 0, Math.PI * 2); ctx.fill(); }
      }
    });
    feltTexture.wrapS = feltTexture.wrapT = THREE.RepeatWrapping; feltTexture.repeat.set(6, 5);
    const felt = standard('#ffffff', { map: feltTexture, roughness: .93 });
    const oval = geometry(new THREE.CylinderGeometry(1, 1, 1, 96));
    const table = new THREE.Group(); world.add(table);
    const slab = mesh(oval, wood, table, [0, 1.025, 0]); slab.scale.set(3.72, .22, 2.48);
    const underside = mesh(oval, rail, table, [0, .91, 0]); underside.scale.set(3.59, .13, 2.36);
    const cloth = mesh(oval, felt, table, [0, 1.15, 0]); cloth.scale.set(3.48, .035, 2.24);
    const ellipsePoints = Array.from({ length: 97 }, (_, i) => new THREE.Vector3(Math.cos(i / 96 * Math.PI * 2) * 3.61, 1.17, Math.sin(i / 96 * Math.PI * 2) * 2.36));
    mesh(geometry(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ellipsePoints, true), 128, .115, 10, true)), rail, table);
    const stitchPoints = ellipsePoints.map(point => new THREE.Vector3(point.x * .89, 1.174, point.z * .88));
    mesh(geometry(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(stitchPoints, true), 128, .009, 6, true)), accent, table);
    for (const x of [-1.9, 1.9]) {
      block(table, rail, [x, .45, 0], [.3, .9, 1.9]); block(table, wood, [x, .13, 0], [1, .22, 2.1]);
    }

    // The table's controls live in a leather book, within reach of your seat.
    const tableBook = new THREE.Group(); table.add(tableBook);
    tableBook.rotation.y = -.18;
    const leather = standard('#35231c', { roughness: .58 });
    const bookGold = standard('#e7bf72', { metalness: .35, roughness: .42, emissive: '#9c6321', emissiveIntensity: .08 });
    const paper = standard('#eddfbd', { roughness: .95 });
    block(tableBook, leather, [0, .016, 0], [.73, .032, .97]);
    block(tableBook, paper, [.01, .055, 0], [.68, .058, .9]);
    for (let i = 0; i < 4; i++) block(tableBook, standard('#b8a784'), [.01, .036 + i * .011, .452], [.66, .003, .005]);
    const spine = block(tableBook, leather, [-.36, .06, 0], [.045, .11, .97]);
    spine.rotation.z = -.06;
    const coverHinge = new THREE.Group(); coverHinge.position.set(-.355, .098, 0); tableBook.add(coverHinge);
    block(coverHinge, leather, [.355, .005, 0], [.73, .026, .97]);
    for (const z of [-.434, .434]) block(coverHinge, bookGold, [.355, .021, z], [.61, .004, .009]);
    for (const x of [.052, .658]) block(coverHinge, bookGold, [x, .021, 0], [.009, .004, .87]);
    const coverArt = drawTexture(512, 640, ctx => {
      ctx.clearRect(0, 0, 512, 640); ctx.textAlign = 'center'; ctx.fillStyle = '#f0cd8c';
      ctx.font = 'bold 49px Georgia'; ctx.fillText('THE TABLE', 256, 220); ctx.fillText('BOOK', 256, 285);
      ctx.font = '100px Georgia'; ctx.fillText('♠', 256, 425);
      ctx.font = '22px Georgia'; ctx.fillText('PLAY · VOTE · BELONG', 256, 525);
    });
    const coverWords = mesh(geometry(new THREE.PlaneGeometry(.6, .78)), material(new THREE.MeshBasicMaterial({map:coverArt,transparent:true,toneMapped:false})), coverHinge, [.355,.023,0]);
    coverWords.rotation.x = -Math.PI/2;
    const pageArt = drawTexture(512, 640, ctx => {
      ctx.fillStyle='#ead9b3';ctx.fillRect(0,0,512,640);ctx.fillStyle='#493222';ctx.textAlign='center';
      ctx.font='bold 44px Georgia';ctx.fillText('A GOOD HAND',256,105);ctx.font='29px Georgia';
      ['Your next move','Side games & votes','Friends at the table','Table view & camera'].forEach((line,i)=>{ctx.fillText(line,256,205+i*83);ctx.fillStyle='#a8804c';ctx.fillRect(85,225+i*83,342,2);ctx.fillStyle='#493222';});
    });
    const page = mesh(geometry(new THREE.PlaneGeometry(.635,.855)), material(new THREE.MeshBasicMaterial({map:pageArt,toneMapped:false})), tableBook,[.01,.087,0]);page.rotation.x=-Math.PI/2;
    // A little bookmark signals that the world object is interactive.
    block(tableBook, standard('#9b3546'), [.19,.014,.53], [.09,.009,.21]);
    const bookHitbox = mesh(geometry(new THREE.BoxGeometry(.92,.32,1.13)), material(new THREE.MeshBasicMaterial({visible:false})), tableBook,[0,.11,0]);
    bookHitbox.castShadow=false;bookHitbox.receiveShadow=false;
    const bookRay = new THREE.Raycaster(), pointer = new THREE.Vector2();
    let bookPointerDown:{x:number;y:number;id:number}|null=null;
    function hitsBook(event:globalThis.PointerEvent) {
      if(!live.current.onBookOpen)return false;
      const rect=renderer.domElement.getBoundingClientRect();
      pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
      bookRay.setFromCamera(pointer,camera);
      return bookRay.intersectObject(bookHitbox,false).length>0;
    }
    const bookMove=(event:globalThis.PointerEvent)=>{if(walkPointer&&walkPointer.id===event.pointerId){walkYaw-=(event.clientX-walkPointer.x)*.004;walkPitch=THREE.MathUtils.clamp(walkPitch-(event.clientY-walkPointer.y)*.003,-1.15,.65);walkPointer={id:event.pointerId,x:event.clientX,y:event.clientY};}bookHovered=hitsBook(event);renderer.domElement.style.cursor=bookHovered?'pointer':'';};
    const bookDown=(event:globalThis.PointerEvent)=>{if(event.button!==0||live.current.bookOpen)return;if(hitsBook(event))bookPointerDown={x:event.clientX,y:event.clientY,id:event.pointerId};else if(walking){walkPointer={id:event.pointerId,x:event.clientX,y:event.clientY};renderer.domElement.setPointerCapture(event.pointerId);}};
    const bookUp=(event:globalThis.PointerEvent)=>{
      if(renderer.domElement.hasPointerCapture(event.pointerId))renderer.domElement.releasePointerCapture(event.pointerId);walkPointer=null;
      const down=bookPointerDown;bookPointerDown=null;
      if(down&&down.id===event.pointerId&&Math.hypot(event.clientX-down.x,event.clientY-down.y)<7&&hitsBook(event))live.current.onBookOpen?.();
    };
    const bookLeave=()=>{walkPointer=null;bookHovered=false;bookPointerDown=null;renderer.domElement.style.cursor='';};
    renderer.domElement.addEventListener('pointermove',bookMove);
    renderer.domElement.addEventListener('pointerdown',bookDown);
    renderer.domElement.addEventListener('pointerup',bookUp);
    renderer.domElement.addEventListener('pointercancel',bookLeave);
    renderer.domElement.addEventListener('pointerleave',bookLeave);

    // A dimensional bar interior gives the viewer a stable seated frame of reference.
    const floor = standard('#2c211b');
    block(world, floor, [0, -.12, 0], [24, .2, 24]);
    const wall = standard(palette.wall);
    block(world, wall, [0, 3.05, -8.2], [22, 6.2, .25]);
    block(world, wall, [-10.8, 3, 0], [.2, 6, 18]); block(world, wall, [10.8, 3, 0], [.2, 6, 18]);
    const trim = standard('#140f10');
    for (let x = -10; x <= 10; x += 1.4) block(world, trim, [x, 1.25, -8.03], [.045, 2.5, .055]);
    block(world, wood, [0, 2.5, -8.0], [22, .13, .14]);
    for (const x of [-7, 6]) {
      block(world, rail, [x, 1.7, -7.45], [3.6, 3.4, .5]);
      for (const y of [.65, 1.6, 2.55, 3.3]) block(world, wood, [x, y, -7.05], [3.9, .14, 1]);
      for (let i = 0; i < 16; i++) {
        const bottle = new THREE.Group(); bottle.position.set(x - 1.4 + (i % 4) * .86, .83 + Math.floor(i / 4) * .88, -7.0); world.add(bottle);
        const glass = standard(['#496356', '#795232', '#714343', '#586674'][i % 4], { metalness: .15, roughness: .25 });
        const body = mesh(limb, glass, bottle, [0, .2, 0]); body.scale.set(.12, .4, .12);
        const neck = mesh(limb, glass, bottle, [0, .46, 0]); neck.scale.set(.052, .19, .052);
        block(bottle, ivory, [0, .23, .122], [.16, .16, .008]);
      }
    }
    block(world, wood, [6, 1.02, -5.4], [5.4, 2, 1.3]); block(world, rail, [6, 2.08, -5.4], [5.75, .19, 1.6]);
    const door = new THREE.Group(); door.position.set(-3.0, 1.7, -7.99); world.add(door);
    block(door, wood, [0, 0, 0], [1.85, 3.4, .16]);
    for (const y of [-.65, .6]) block(door, rail, [0, y, .09], [1.35, 1.04, .045]);
    ball(door, accent, [.61, -.07, .14], [.06, .06, .06]);
    for (let x = -9; x <= 9; x += .65) block(world, standard('#413329'), [x, -.005, 0], [.025, .015, 22]);
    const ambient = new THREE.HemisphereLight('#eef4ff', '#34231c', 1.8); scene.add(ambient);
    const tableLight = new THREE.SpotLight(palette.light, 78, 17, Math.PI / 2.6, .8, 1.35);
    tableLight.position.set(0, 6.8, 1.4); tableLight.target.position.set(0, 1, -.8); tableLight.castShadow = true;
    tableLight.shadow.mapSize.set(512, 512); tableLight.shadow.bias = -.001; scene.add(tableLight, tableLight.target);
    const fill = new THREE.PointLight('#d8eaff', 19, 14, 1.7); fill.position.set(0, 3.8, 3.5); scene.add(fill);
    const roseLight = new THREE.PointLight('#f04e87',0,12,1.6);roseLight.position.set(-4,3.1,-1.2);scene.add(roseLight);
    const amberLight = new THREE.PointLight('#ffb454',0,11,1.8);amberLight.position.set(4.1,3.5,-4);scene.add(amberLight);
    const loungeDecor = new THREE.Group();world.add(loungeDecor);loungeDecor.visible=false;
    const velvet=standard('#5d1834',{roughness:1});
    for(const side of [-1,1])for(let fold=0;fold<7;fold++){
      const drape=mesh(limb,velvet,loungeDecor,[side*(4.9+fold*.16),3.55,-7.85]);drape.scale.set(.12,3.1,.15);
    }
    const loungeSign=drawTexture(768,180,ctx=>{ctx.clearRect(0,0,768,180);ctx.textAlign='center';ctx.fillStyle='#ffb6cf';ctx.font='italic 70px Georgia';ctx.fillText('The Velvet Hour',384,96);ctx.fillStyle='#ffd5ac';ctx.font='21px Georgia';ctx.fillText('A LITTLE MYSTERY. A LITTLE JAZZ.',384,142);});
    const sign=mesh(geometry(new THREE.PlaneGeometry(4.5,1.05)),material(new THREE.MeshBasicMaterial({map:loungeSign,transparent:true,toneMapped:false})),loungeDecor,[0,4.35,-7.95]);
    sign.castShadow=false;
    const normalWall=new THREE.Color(palette.wall),roseWall=new THREE.Color('#321824');
    const normalAmbient=new THREE.Color('#eef4ff'),roseAmbient=new THREE.Color('#ffd4d4');
    const normalKey=new THREE.Color(palette.light),roseKey=new THREE.Color('#ffc48c');
    const normalFill=new THREE.Color('#d8eaff'),roseFill=new THREE.Color('#f3a2c3');
    const whiteFelt=new THREE.Color('#ffffff'),roseFelt=new THREE.Color('#f1d4e2');
    for (const x of [-5.8, 5.8]) {
      const lamp = mesh(geometry(new THREE.ConeGeometry(.62, .45, 24, 1, true)), rail, world, [x, 4.6, -4.2]); lamp.rotation.x = Math.PI;
      segment(world, new THREE.Vector3(x, 4.7, -4.2), new THREE.Vector3(x, 6.1, -4.2), .025, chairMetal);
      ball(world, standard(palette.light, { emissive: palette.light, emissiveIntensity: 2 }), [x, 4.4, -4.2], [.13, .1, .13]);
      const light = new THREE.PointLight(palette.light, 24, 10, 1.7); light.position.set(x, 4.35, -4.2); scene.add(light);
    }
    if (live.current.room.settings.theme === 'cyberpunk' || live.current.room.settings.theme === 'astral') {
      const neon = standard(palette.accent, { emissive: palette.accent, emissiveIntensity: 1.6 });
      block(world, neon, [0, 3.0, -8.01], [10, .025, .025]);
      const glow = new THREE.PointLight(palette.accent, 13, 10, 1.9); glow.position.set(0, 3.1, -6.5); scene.add(glow);
    }

    function chair(parent: THREE.Object3D) {
      block(parent, chairMaterial, [0, .71, -.08], [.75, .14, .62]);
      block(parent, chairMaterial, [0, 1.14, -.38], [.75, .85, .12]);
      for (const x of [-.29, .29]) for (const z of [-.32, .2]) segment(parent, new THREE.Vector3(x, .02, z), new THREE.Vector3(x, .72, z), .033, chairMetal);
      for (const x of [-.33, .33]) block(parent, wood, [x, 1.07, -.35], [.055, .65, .07]);
    }
    function faceTexture(expression: CharacterExpression) {
      const cached = faceTextures.get(expression); if (cached) return cached;
      const value = drawTexture(256, 256, ctx => {
        const path = (points: [number, number][], color = '#302224', width = 8) => {
          ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
          points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
        };
        const circle = (x: number, y: number, r: number, color = '#302224') => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
        const smile = (open = false) => { ctx.strokeStyle = '#302224'; ctx.fillStyle = '#302224'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(85, 161); ctx.quadraticCurveTo(128, open ? 220 : 196, 173, 161); if (open) { ctx.closePath(); ctx.fill(); path([[100, 168], [160, 168]], '#fff9ed', 8); } else ctx.stroke(); };
        const eyes = () => { circle(82, 103, 10); circle(174, 103, 10); };
        ctx.clearRect(0, 0, 256, 256);
        if (expression === 'love') {
          for (const x of [82, 174]) { ctx.fillStyle = '#db5379'; ctx.beginPath(); ctx.moveTo(x, 124); ctx.bezierCurveTo(x - 53, 91, x - 26, 56, x, 84); ctx.bezierCurveTo(x + 26, 56, x + 53, 91, x, 124); ctx.fill(); }
          smile(); path([[48, 146], [63, 149]], '#dc786e', 10); path([[194, 149], [208, 146]], '#dc786e', 10);
        } else if (expression === 'skull') {
          for (const x of [82, 174]) { path([[x - 15, 88], [x + 15, 118]]); path([[x + 15, 88], [x - 15, 118]]); }
          path([[91, 170], [167, 170]]); for (const x of [104, 128, 152]) path([[x, 158], [x, 181]], '#302224', 5);
        } else if (expression === 'surprised') {
          for (const x of [82, 174]) { circle(x, 102, 22, '#fff9ed'); circle(x, 102, 9); }
          circle(128, 175, 22); path([[59, 65], [81, 56], [101, 65]]); path([[154, 65], [175, 56], [196, 65]]);
        } else if (expression === 'laugh' || expression === 'winner') {
          path([[59, 106], [82, 88], [105, 106]]); path([[151, 106], [174, 88], [197, 106]]); smile(true);
          if (expression === 'laugh') { circle(44, 133, 10, '#4aafe5'); circle(212, 133, 10, '#4aafe5'); }
        } else if (expression === 'away') {
          path([[60, 108], [83, 119], [106, 108]]); path([[150, 108], [173, 119], [196, 108]]); path([[112, 174], [144, 174]]);
        } else {
          eyes();
          if (expression === 'thinking') {
            path([[57, 73], [100, 62]]); path([[151, 71], [194, 88]]); path([[98, 176], [126, 164], [156, 176]]);
            ctx.fillStyle = '#684733'; ctx.font = 'bold 42px system-ui'; ctx.fillText('?', 210, 64);
          } else if (expression === 'fold' || expression === 'sad') { path([[58, 75], [99, 88]]); path([[156, 88], [198, 75]]); path([[97, 181], [129, 165], [160, 181]]); }
          else if (expression === 'fire' || expression === 'all-in') { path([[55, 69], [100, 87]]); path([[154, 87], [199, 69]]); path([[92, 166], [166, 166], [156, 184], [102, 184], [92, 166]], '#302224', 6); path([[105, 174], [153, 174]], '#fff9ed', 8); }
          else if (expression === 'raise') { path([[54, 73], [100, 85]]); path([[154, 85], [200, 73]]); path([[93, 175], [126, 183], [168, 161]]); }
          else if (expression === 'call') { path([[57, 72], [101, 72]]); path([[155, 72], [199, 72]]); path([[107, 174], [149, 174]]); }
          else smile();
        }
        path([[129, 125], [121, 145], [135, 145]], '#a66c51', 4);
      });
      faceTextures.set(expression, value); return value;
    }
    function trackedFaceTexture(id:string,face:FacePose){
      const key=FACE_FIELDS.map(field=>face[field]).join(',');
      let entry=trackedFaces.get(id);
      if(!entry){entry={texture:drawTexture(256,256,ctx=>drawTrackedFace(ctx,face)),key};trackedFaces.set(id,entry);}
      else if(entry.key!==key){const ctx=(entry.texture.image as HTMLCanvasElement).getContext('2d');if(ctx)drawTrackedFace(ctx,face);entry.texture.needsUpdate=true;entry.key=key;}
      return entry.texture;
    }
    function playerPortrait(ctx:CanvasRenderingContext2D,room:RoomView,id:string,x:number,y:number,size:number){
      const player=room.players.find(p=>p.id===id);if(!player)return;
      const actor=actors.get(id),video=id===room.me?posterVideo:actor?.video;
      const pose=id===room.me?live.current.pose:live.current.poses[id];
      ctx.save();ctx.translate(x,y);ctx.scale(size/256,size/256);ctx.beginPath();ctx.arc(128,128,122,0,Math.PI*2);ctx.clip();
      if(video&&video.readyState>=2){const side=Math.min(video.videoWidth,video.videoHeight);ctx.drawImage(video,(video.videoWidth-side)/2,(video.videoHeight-side)/2,side,side,0,0,256,256);}
      else{
        ctx.fillStyle='#c8b68b';ctx.fillRect(0,0,256,256);ctx.fillStyle=`hsl(${(player.seat*47+27)%360},35%,43%)`;
        ctx.beginPath();ctx.ellipse(128,261,119,72,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#eac49c';ctx.beginPath();ctx.ellipse(128,121,89,103,0,0,Math.PI*2);ctx.fill();
        const face=pose?.face?trackedFaceTexture(id,pose.face):faceTexture(characterExpression(player,room,live.current.now));
        ctx.drawImage(face.image as HTMLCanvasElement,36,23,184,193);ctx.fillStyle='#292124';ctx.beginPath();ctx.ellipse(128,36,91,24,0,Math.PI,Math.PI*2);ctx.fill();
      }
      ctx.restore();
    }
    function cardMaterial(card: string) {
      const key = card || '?'; const cached = cardMaterials.get(key); if (cached) return cached;
      const map = drawTexture(320, 464, ctx => {
        const back = key === '?'; ctx.fillStyle = back ? palette.back : palette.card;
        ctx.beginPath(); ctx.roundRect(0, 0, 320, 464, 20); ctx.fill();
        ctx.lineWidth = 5; ctx.strokeStyle = back ? palette.accent : '#a5a79d'; ctx.stroke();
        if (back) {
          ctx.strokeStyle = palette.accent; ctx.globalAlpha = .7; ctx.lineWidth = 2;
          for (let x = -420; x < 420; x += 26) { ctx.beginPath(); ctx.moveTo(x, 16); ctx.lineTo(x + 440, 448); ctx.stroke(); }
          ctx.globalAlpha = 1; ctx.fillStyle = palette.back; ctx.beginPath(); ctx.arc(160, 232, 79, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = palette.accent; ctx.lineWidth = 4; ctx.stroke(); ctx.fillStyle = palette.accent; ctx.font = '110px Georgia'; ctx.textAlign = 'center'; ctx.fillText('♠', 160, 270);
          return;
        }
        const rank = key.slice(0, -1) === 'T' ? '10' : key.slice(0, -1), suitCode = key.slice(-1).toLowerCase();
        const suit = ({ s: '♠', h: '♥', d: '♦', c: '♣' } as Record<string, string>)[suitCode] || key.slice(-1);
        const red = suitCode === 'h' || suitCode === 'd' || suit === '♥' || suit === '♦'; const ink = red ? palette.red : palette.ink;
        ctx.fillStyle = ink; ctx.textAlign = 'left'; ctx.font = 'bold 66px Georgia'; ctx.fillText(rank, 19, 72); ctx.font = '57px Georgia'; ctx.fillText(suit, 23, 127);
        ctx.save(); ctx.translate(320, 464); ctx.rotate(Math.PI); ctx.font = 'bold 66px Georgia'; ctx.fillText(rank, 19, 72); ctx.font = '57px Georgia'; ctx.fillText(suit, 23, 127); ctx.restore();
        ctx.textAlign = 'center';
        if (['J', 'Q', 'K'].includes(rank)) {
          // Original small court portrait, drawn into the card texture rather than borrowed artwork.
          ctx.strokeStyle = ink; ctx.lineWidth = 4; ctx.beginPath(); ctx.roundRect(81, 121, 158, 225, 8); ctx.stroke();
          ctx.fillStyle = ink; ctx.globalAlpha = .13; ctx.fillRect(86, 127, 148, 213); ctx.globalAlpha = 1;
          ctx.beginPath(); ctx.moveTo(108, 212); ctx.lineTo(104, 172); ctx.lineTo(126, 184); ctx.lineTo(160, 147); ctx.lineTo(190, 184); ctx.lineTo(215, 172); ctx.lineTo(210, 212); ctx.closePath(); ctx.fill();
          ctx.fillStyle = palette.card; ctx.beginPath(); ctx.ellipse(160, 246, 43, 48, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(145, 239, 3, 0, Math.PI * 2); ctx.arc(175, 239, 3, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.moveTo(147, 263); ctx.quadraticCurveTo(160, 272, 177, 260); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(98, 336); ctx.quadraticCurveTo(113, 280, 160, 293); ctx.quadraticCurveTo(207, 280, 223, 336); ctx.closePath(); ctx.fill();
          ctx.fillStyle = palette.card; ctx.font = '50px Georgia'; ctx.fillText(suit, 160, 330);
        } else { ctx.font = '150px Georgia'; ctx.fillText(suit, 160, 286); }
        if (live.current.room.settings.theme === 'astral' || live.current.room.settings.theme === 'cyberpunk') {
          ctx.fillStyle = palette.accent; for (let i = 0; i < 12; i++) { ctx.beginPath(); ctx.arc(30 + (i * 53) % 258, 155 + (i * 41) % 230, 1.5, 0, Math.PI * 2); ctx.fill(); }
        }
      });
      const paint = material(new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide, toneMapped: false })); cardMaterials.set(key, paint); return paint;
    }
    function moveObject(object:THREE.Object3D, from:THREE.Vector3, target:THREE.Vector3, start:number, duration=650, arc=.22, spin=0, remove=false) {
      if(reducedMotion){object.position.copy(target);if(remove)object.removeFromParent();return;}
      object.position.copy(from);
      motions.push({object,from:from.clone(),target:target.clone(),rotation:object.quaternion.clone(),start,duration,arc,spin,remove});
    }
    function makeCard(card:string,parent:THREE.Group,target:THREE.Vector3,rotation:THREE.Euler,delay=0,origin?:THREE.Vector3) {
      const group=new THREE.Group();group.position.copy(target);group.rotation.copy(rotation);parent.add(group);
      mesh(cardThickness,ivory,group);
      const front=mesh(cardPlane,cardMaterial(card),group,[0,0,.0055]);front.castShadow=false;
      if(origin){parent.updateWorldMatrix(true,false);moveObject(group,parent.worldToLocal(origin.clone()),target,performance.now()+delay,660,.28,.22);}
      return group;
    }
    function clear(parent:THREE.Group) {
      const removed=new Set<THREE.Object3D>();parent.traverse(object=>removed.add(object));
      for(let i=motions.length-1;i>=0;i--)if(removed.has(motions[i].object))motions.splice(i,1);
      for(const child of [...parent.children]){child.traverse(object=>{if(object instanceof THREE.InstancedMesh)object.dispose();});parent.remove(child);}
    }
    function placement(room:RoomView,id:string) {
      const player=room.players.find(p=>p.id===id),mySeat=room.players.find(p=>p.id===room.me)?.seat||0;
      if(!player||id===room.me)return {x:0,z:2.8,facing:Math.PI};
      const count=room.settings.maxPlayers,offset=(player.seat-mySeat+count)%count,span=Math.min(1,(count-1)/5);
      const progress=count===2?.5:(1-span)/2+(offset-1)/(count-2)*span,angle=progress*Math.PI;
      const x=-(narrow?2.38:3.86)*Math.cos(angle),z=(narrow?-1.1:-.6)-(narrow?1.8:2.2)*Math.sin(angle);
      return {x,z,facing:Math.atan2(-x,-z)};
    }
    function playerPoint(room:RoomView,id:string,x=0,forward=1.05,height=FELT_Y) {
      const seat=placement(room,id);
      return new THREE.Vector3(seat.x+x*Math.cos(seat.facing)+forward*Math.sin(seat.facing),height,seat.z-x*Math.sin(seat.facing)+forward*Math.cos(seat.facing));
    }
    function dealerOrigin(room:RoomView) {
      const dealer=room.players.find(p=>p.seat===room.dealerSeat);
      return playerPoint(room,dealer?.id||room.me,0,.63,1.48);
    }
    function cardDealDelay(room:RoomView,id:string,index:number) {
      if(dealerCue?.handNo!==room.handNo)return undefined;
      if(performance.now()-dealerCue.start>dealerCue.players.length*dealerCue.rounds*105+600)return undefined;
      const order=dealerCue.players.indexOf(id);if(order<0)return undefined;
      return Math.max(0,dealerCue.start-performance.now())+(index*dealerCue.players.length+order)*105;
    }
    function makeArms(parent:THREE.Group,shirt:THREE.Material) {
      const leftArm=new THREE.Group(),rightArm=new THREE.Group();parent.add(leftArm,rightArm);
      for(const [side,arm] of [[-1,leftArm],[1,rightArm]] as const){
        arm.position.set(side*.27,1.58,0);
        segment(arm,new THREE.Vector3(),new THREE.Vector3(side*.12,-.36,.28),.057,shirt);
        segment(arm,new THREE.Vector3(side*.12,-.36,.28),new THREE.Vector3(side*.11,-.35,.64),.051,skin);
        ball(arm,skin,[side*.11,-.35,.64],[.074,.045,.1]);
      }
      return {leftArm,rightArm};
    }
    function makeActor(player: PublicPlayer) {
      const root = new THREE.Group(); world.add(root); chair(root);
      const shirt = standard(`hsl(${(player.seat * 47 + 27) % 360}, 35%, 43%)`);
      const trouser = standard('#24252a');
      segment(root, new THREE.Vector3(0, .82, 0), new THREE.Vector3(0, 1.63, 0), .12, shirt);
      ball(root, shirt, [0, 1.61, 0], [.28, .1, .13]);
      segment(root, new THREE.Vector3(0, 1.61, 0), new THREE.Vector3(0, 1.94, 0), .061, skin);
      for (const x of [-.14, .14]) {
        segment(root, new THREE.Vector3(x, .83, .02), new THREE.Vector3(x, .49, .38), .075, trouser);
        segment(root, new THREE.Vector3(x, .49, .38), new THREE.Vector3(x, .1, .35), .065, trouser);
        ball(root, hair, [x, .08, .42], [.09, .07, .17]);
      }
      const {leftArm,rightArm}=makeArms(root,shirt);
      const head = new THREE.Group(); head.position.set(0, 2.04, 0); root.add(head);
      ball(head, skin, [0, .12, 0], [.27, .31, .255]);
      for (const x of [-.267, .267]) ball(head, skin, [x, .115, 0], [.049, .073, .05]);
      ball(head, hair, [0, .335, -.05], [.275, .095, .229]);
      if (player.seat % 3 === 0) ball(head, hair, [-.07, .355, .08], [.24, .055, .19]);
      const face = mesh(headPlane, material(new THREE.MeshBasicMaterial({ map: faceTexture('neutral'), alphaMap: faceMask, alphaTest: .015, transparent: true, depthWrite: false, toneMapped: false })), head, [0, .12, .257]);
      face.castShadow = false;
      const nameplate = sprite(labelTexture(player.name, player.stack.toLocaleString()), 1.1, .275, world);
      nameplate.material.sizeAttenuation=false;
      const cards = new THREE.Group(); root.add(cards);
      const reaction = sprite(drawTexture(128, 128, () => {}), .42, .42, world); reaction.visible = false;
      const actor: Actor = { root, head, face, nameplate, cards, reaction, leftArm, rightArm, idlePhase: player.seat * 1.83 };
      actors.set(player.id, actor); return actor;
    }
    function stopVideo(actor: Actor) {
      if (actor.video) { actor.video.pause(); actor.video.srcObject = null; actor.video.remove(); actor.video = undefined; }
      retireTexture(actor.videoTexture); actor.videoTexture = undefined; actor.videoStream = undefined;
    }
    function removeActor(actor: Actor) {
      stopVideo(actor); retireTexture(actor.nameplate.material.map); retireTexture(actor.reaction.material.map);
      const id=[...actors].find(([,candidate])=>candidate===actor)?.[0];if(id){retireTexture(trackedFaces.get(id)?.texture);trackedFaces.delete(id);}
      world.remove(actor.root, actor.nameplate, actor.reaction);
    }
    function attachVideo(actor: Actor, stream?: MediaStream) {
      if (actor.videoStream === stream) return;
      stopVideo(actor);
      if (!stream) return;
      const video = document.createElement('video'); video.autoplay = true; video.muted = true; video.playsInline = true; video.srcObject = stream;
      const map = texture(new THREE.VideoTexture(video)); map.minFilter = THREE.LinearFilter;
      actor.video = video; actor.videoStream = stream; actor.videoTexture = map;
      video.onloadedmetadata = () => {
        if (video.videoWidth > video.videoHeight) { map.repeat.x = video.videoHeight / video.videoWidth; map.offset.x = (1 - map.repeat.x) / 2; }
        else if (video.videoHeight > video.videoWidth) { map.repeat.y = video.videoWidth / video.videoHeight; map.offset.y = (1 - map.repeat.y) / 2; }
      };
      void video.play().catch(() => { /* A blocked video keeps the expressive character face. */ });
    }
    const boardLabels = ['BOARD I','BOARD II'].map(label=>sprite(drawTexture(256,64,ctx=>{
      ctx.fillStyle='#111925da';ctx.beginPath();ctx.roundRect(0,0,256,64,14);ctx.fill();
      ctx.fillStyle=palette.accent;ctx.font='700 34px system-ui';ctx.textAlign='center';ctx.fillText(label,128,44);
    }),.72,.18,boards));
    hands.position.set(0,0,2.8);hands.rotation.y=Math.PI;
    const ownArms=makeArms(hands,standard('#242b37'));

    const chipGeometry=geometry(new THREE.CylinderGeometry(.078,.078,.028,20));
    const chipPaints=new Map<number,THREE.Material[]>();
    for(const chip of CHIP_VALUES){
      const edge=drawTexture(256,32,ctx=>{
        ctx.fillStyle=chip.color;ctx.fillRect(0,0,256,32);ctx.fillStyle='#f3e5bf';
        for(let x=0;x<256;x+=32)ctx.fillRect(x+3,1,10,30);
        ctx.fillStyle='#0004';ctx.fillRect(0,27,256,5);
      });
      const top=drawTexture(128,128,ctx=>{
        ctx.fillStyle=chip.color;ctx.fillRect(0,0,128,128);ctx.strokeStyle='#f3e5bf';ctx.lineWidth=7;
        ctx.setLineDash([12,10]);ctx.beginPath();ctx.arc(64,64,55,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
        ctx.lineWidth=2;ctx.beginPath();ctx.arc(64,64,40,0,Math.PI*2);ctx.stroke();
        ctx.fillStyle=chip.value===1?'#25312b':'#fff7da';ctx.font=`700 ${chip.value>=1000?25:32}px system-ui`;ctx.textAlign='center';ctx.fillText(String(chip.value),64,75);
      });
      const side=standard('#ffffff',{map:edge,roughness:.5}),face=standard('#ffffff',{map:top,roughness:.5});
      chipPaints.set(chip.value,[side,face,face]);
    }
    const dealerButton=new THREE.Group();world.add(dealerButton);
    mesh(geometry(new THREE.CylinderGeometry(.14,.14,.035,32)),ivory,dealerButton,[0,0,0]);
    const dealerArt=drawTexture(256,256,ctx=>{ctx.fillStyle='#f7efd6';ctx.fillRect(0,0,256,256);ctx.strokeStyle='#28372f';ctx.lineWidth=7;ctx.beginPath();ctx.arc(128,128,110,0,Math.PI*2);ctx.stroke();ctx.textAlign='center';ctx.fillStyle='#28372f';ctx.font='bold 32px Georgia';ctx.fillText('DEALER',128,141);});
    const dealerFace=mesh(geometry(new THREE.CircleGeometry(.132,32)),material(new THREE.MeshBasicMaterial({map:dealerArt,toneMapped:false})),dealerButton,[0,.018,0]);dealerFace.rotation.x=-Math.PI/2;
    const instance=new THREE.Object3D();
    function fillChipStack(group:THREE.Group,amount:number){
      if(group.userData.amount===amount)return;group.userData.amount=amount;clear(group);
      let used=0,tower=0;
      for(const chip of chipBreakdown(amount)){
        const count=Math.min(chip.count,80,Math.max(0,128-used));if(!count)continue;
        const batch=new THREE.InstancedMesh(chipGeometry,chipPaints.get(chip.value)!,count);group.add(batch);
        for(let i=0;i<count;i++){
          const column=tower+Math.floor(i/18),level=i%18;
          instance.position.set((column%4-1.5)*.175,.014+level*.029,Math.floor(column/4)*.18);
          instance.rotation.set(0,(i%5)*.31,0);instance.updateMatrix();batch.setMatrixAt(i,instance.matrix);
        }
        batch.instanceMatrix.needsUpdate=true;batch.castShadow=true;batch.receiveShadow=true;
        batch.computeBoundingSphere();tower+=Math.ceil(count/18);used+=count;
      }
    }
    const potChips=new THREE.Group();chipsOnTable.add(potChips);
    function potPoint(room:RoomView){
      const lines=[room.board,...(room.isDoubleBarrel?[room.boardTwo]:[])].reduce((sum,row)=>sum+Math.max(1,Math.ceil(row.length/(row.length>9?8:Math.max(5,row.length)))),0);
      return new THREE.Vector3(narrow?1.85:lines>2?2.5:2.15,FELT_Y,-.85);
    }
    function playerStackPoint(room:RoomView,id:string,height=FELT_Y){
      // Leave the near-right felt clear for the physical table companion.
      return id===room.me?playerPoint(room,id,narrow?-1.6:-2.3,narrow?2.35:1.9,height):playerPoint(room,id,-.42,1.15,height);
    }
    function updateChipStacks(room:RoomView){
      const ids=new Set(room.players.map(p=>p.id));
      for(const [id,group] of stackGroups)if(!ids.has(id)){clear(group);group.removeFromParent();stackGroups.delete(id);}
      for(const player of room.players){
        let group=stackGroups.get(player.id);if(!group){group=new THREE.Group();chipsOnTable.add(group);stackGroups.set(player.id,group);}
        group.position.copy(playerStackPoint(room,player.id));
        group.rotation.y=placement(room,player.id).facing;group.scale.setScalar(narrow?.8:1);fillChipStack(group,player.stack);
      }
      potChips.position.copy(potPoint(room));
      fillChipStack(potChips,room.phase==='showdown'?room.result?.payouts.reduce((sum,p)=>sum+p.amount,0)||0:room.pot);
    }
    function throwChips(room:RoomView,id:string,amount:number,time:number){
      if(reducedMotion)return;
      const source=playerStackPoint(room,id,FELT_Y+.25),chips=chipBreakdown(amount);
      let index=0;
      for(const chip of chips)for(let i=0;i<Math.min(chip.count,3)&&index<8;i++,index++){
        const object=mesh(chipGeometry,chipPaints.get(chip.value)!,flyingChips);
        const target=potPoint(room).add(new THREE.Vector3((index%3-1)*.14,.02+Math.floor(index/3)*.029,(i-1)*.13));
        moveObject(object,source,target,time+index*38,700,.5,Math.PI*2,true);
      }
    }
    const knockGeometry=geometry(new THREE.TorusGeometry(.13,.009,6,32));
    const knockRings:{object:THREE.Mesh;start:number}[]=[];
    function knock(room:RoomView,id:string,time:number){
      if(reducedMotion)return;
      const ring=mesh(knockGeometry,material(new THREE.MeshBasicMaterial({color:palette.accent,transparent:true,opacity:.5,depthWrite:false})),flyingChips);
      ring.rotation.x=-Math.PI/2;ring.position.copy(playerPoint(room,id,.38,.67,FELT_Y+.015));knockRings.push({object:ring,start:time});
    }

    function pips(ctx:CanvasRenderingContext2D,value:number,size:number){
      const positions:Record<number,[number,number][]>= {
        1:[[.5,.5]],2:[[.27,.27],[.73,.73]],3:[[.27,.27],[.5,.5],[.73,.73]],
        4:[[.27,.27],[.73,.27],[.27,.73],[.73,.73]],
        5:[[.27,.27],[.73,.27],[.5,.5],[.27,.73],[.73,.73]],
        6:[[.27,.25],[.73,.25],[.27,.5],[.73,.5],[.27,.75],[.73,.75]],
      };
      ctx.fillStyle='#24342f';for(const [x,y] of positions[value]||[]){ctx.beginPath();ctx.arc(x*size,y*size,size*.075,0,Math.PI*2);ctx.fill();}
    }
    const diePaints=[3,4,1,6,2,5].map(value=>standard('#ffffff',{map:drawTexture(128,128,ctx=>{
      ctx.fillStyle='#f7edda';ctx.fillRect(0,0,128,128);ctx.strokeStyle='#cdb98f';ctx.lineWidth=5;ctx.strokeRect(2,2,124,124);pips(ctx,value,128);
    }),roughness:.48}));
    const die=mesh(geometry(new THREE.BoxGeometry(.29,.29,.29)),diePaints,world);die.visible=false;
    const dieBadge=sprite(labelTexture('DIE ON THE RIVER',''),1.15,.37,world);dieBadge.visible=false;
    const dieRotation=new THREE.Quaternion();
    function dieOrientation(value:number){
      const angles:Record<number,[number,number,number]>={1:[0,0,0],2:[-Math.PI/2,0,0],3:[0,0,Math.PI/2],4:[0,0,-Math.PI/2],5:[Math.PI/2,0,0],6:[Math.PI,0,0]};
      return new THREE.Quaternion().setFromEuler(new THREE.Euler(...angles[value]));
    }
    const wave=new THREE.Group();world.add(wave);wave.visible=false;
    const water=material(new THREE.MeshBasicMaterial({color:'#61c8ee',transparent:true,opacity:.4,side:THREE.DoubleSide,depthWrite:false}));
    const foam=material(new THREE.MeshBasicMaterial({color:'#ebfbff',transparent:true,opacity:.8,depthWrite:false}));
    const waterSheet=mesh(geometry(new THREE.PlaneGeometry(4.8,.72,24,6)),water,wave);waterSheet.rotation.x=-Math.PI/2;waterSheet.castShadow=false;
    for(let i=0;i<30;i++)ball(wave,foam,[-2.3+i*.16,.02,.27+Math.sin(i*.9)*.055],[.085,.016,.037]);
    function updateSideEffects(room:RoomView,time:number){
      if(room.dieRiverRoll!=null&&dieValue!==room.dieRiverRoll){dieValue=room.dieRiverRoll;dieStarted=time-DIE_ROLL_MS;}
      die.visible=!!dieValue&&room.isDieRiver;
      if(die.visible){
        const t=Math.min(1,Math.max(0,(time-dieStarted)/DIE_ROLL_MS));
        const end=new THREE.Vector3(-1.65,FELT_Y+.15,-.35);
        die.position.set(-.6-(1.05*t),end.y+Math.abs(Math.sin(t*Math.PI*4))*(1-t)*.72,1.35-1.7*t);
        dieRotation.copy(dieOrientation(dieValue));
        if(t<.78)die.quaternion.setFromEuler(new THREE.Euler(t*Math.PI*9,t*Math.PI*7,t*Math.PI*5));
        else die.quaternion.slerp(dieRotation,Math.min(1,(t-.78)/.16));
        if(t===1){die.position.copy(end);die.quaternion.copy(dieRotation);}
        dieBadge.visible=t===1;dieBadge.position.set(-1.65,1.85,-.35);
        if(dieBadge.userData.value!==dieValue){dieBadge.userData.value=dieValue;setSpriteTexture(dieBadge,labelTexture(`ROLLED ${dieValue}`,dieValue===6?'Board intact':`Replace card ${dieValue}`));}
      }else dieBadge.visible=false;
      const waveT=(time-oceanStarted)/OCEAN_WAVE_MS;
      wave.visible=!reducedMotion&&waveT>=0&&waveT<1;
      if(wave.visible){wave.position.set(0,FELT_Y+.025,-2.2+4.2*waveT);wave.scale.y=1+Math.sin(waveT*Math.PI)*2;water.opacity=Math.sin(waveT*Math.PI)*.42;foam.opacity=Math.sin(waveT*Math.PI)*.86;}
    }

    let posterVideo:HTMLVideoElement|null=null,posterStream:MediaStream|null=null;
    const posterFrame=new THREE.Group();posterFrame.position.set(1.6,2.8,-7.87);world.add(posterFrame);posterFrame.visible=false;
    block(posterFrame,wood,[0,0,-.04],[2.75,3.2,.09]);
    const posterPaint=material(new THREE.MeshBasicMaterial({color:'#ffffff',toneMapped:false}));
    mesh(geometry(new THREE.PlaneGeometry(2.55,3.0)),posterPaint,posterFrame,[0,0,.015]);
    let lastPosterUpdate=0;
    function updateBountyPoster(room:RoomView,time:number){
      const queued=room.vote?.kind==='bounty'?room.vote:null,bounty=room.bounty,outcome=room.bountyOutcome;
      posterFrame.visible=!!(queued||bounty||outcome);
      const stream=posterFrame.visible?live.current.localStream:null;
      if(stream!==posterStream){
        if(posterVideo){posterVideo.pause();posterVideo.srcObject=null;posterVideo.remove();posterVideo=null;}
        posterStream=stream;if(stream){posterVideo=document.createElement('video');posterVideo.muted=true;posterVideo.playsInline=true;posterVideo.srcObject=stream;void posterVideo.play().catch(()=>{});}
      }
      if(!posterFrame.visible)return;
      const video=outcome?.loserId===room.me?posterVideo:actors.get(outcome?.loserId||'')?.video;
      const photoReady=!!video&&video.readyState>=2;
      const signature=queued?`vote/${queued.id}`:bounty?`active/${bounty.amount}/${bounty.players.join()}/${bounty.won.join()}`:`lost/${outcome?.loserId}/${outcome?.completedAt}/${photoReady}`;
      const faces=(bounty?.players||queued?.voters||(outcome?[outcome.loserId]:[])).map(id=>{
        const player=room.players.find(p=>p.id===id),pose=id===room.me?live.current.pose:live.current.poses[id];
        return pose?.face?FACE_FIELDS.map(field=>Math.round(pose.face![field]*5)).join(','):player?characterExpression(player,room,live.current.now):'';
      }).join('|');
      const hasCamera=!!posterVideo||[...actors.values()].some(actor=>!!actor.video);
      const completeSignature=`${signature}/${faces}/${hasCamera?Math.floor(time/700):''}`;
      if(completeSignature===posterSignature||time-lastPosterUpdate<500)return;
      posterSignature=completeSignature;lastPosterUpdate=time;
      if(!posterPaint.map){posterPaint.map=drawTexture(640,900,()=>{});posterPaint.needsUpdate=true;}
      const next=posterPaint.map as THREE.CanvasTexture,ctx=(next.image as HTMLCanvasElement).getContext('2d');if(!ctx)return;
      {
        ctx.fillStyle='#e8d5a8';ctx.fillRect(0,0,640,900);
        for(let i=0;i<250;i++){ctx.fillStyle=i%2?'#684a1b0b':'#fff7da20';ctx.fillRect((i*97)%640,(i*211)%900,3,3);}
        ctx.strokeStyle='#765132';ctx.lineWidth=8;ctx.strokeRect(20,20,600,860);ctx.fillStyle='#41291f';ctx.textAlign='center';ctx.font='900 88px Georgia';ctx.fillText('WANTED',320,117);
        ctx.font='700 27px Georgia';ctx.fillText(queued?'BOUNTY PROPOSED':bounty?'LAST WITHOUT A WIN':'BOUNTY COMPLETE',320,168);
        if(!queued&&!bounty&&outcome){
          ctx.fillStyle=`hsl(${(outcome.loserSeat*47+27)%360},35%,43%)`;ctx.beginPath();ctx.moveTo(143,570);ctx.quadraticCurveTo(150,409,320,431);ctx.quadraticCurveTo(485,409,499,570);ctx.fill();
          ctx.fillStyle='#eac49c';ctx.beginPath();ctx.ellipse(320,350,125,155,0,0,Math.PI*2);ctx.fill();
          if(photoReady&&video){ctx.save();ctx.beginPath();ctx.ellipse(320,350,120,150,0,0,Math.PI*2);ctx.clip();ctx.drawImage(video,195,200,250,300);ctx.restore();}
          else {ctx.fillStyle='#292124';ctx.beginPath();ctx.ellipse(320,213,126,34,0,Math.PI,Math.PI*2);ctx.fill();const face=(outcome.loserId===room.me?live.current.pose:live.current.poses[outcome.loserId])?.face;ctx.drawImage((face?trackedFaceTexture(outcome.loserId,face):faceTexture('fold')).image as HTMLCanvasElement,205,230,230,245);}
          ctx.font='800 49px Georgia';ctx.fillStyle='#41291f';ctx.fillText(outcome.loserName,320,655,530);
          ctx.font='600 30px Georgia';ctx.fillText('Last without a win',320,720);ctx.fillText(`${outcome.amount.toLocaleString()} chips to each friend`,320,770,530);
        }else{
          const ids=bounty?.players||queued!.voters,won=bounty?.won||[];
          ids.forEach((id,index)=>{const y=240+index*53,name=room.players.find(p=>p.id===id)?.name||'Friend';
            playerPortrait(ctx,room,id,87,y-34,44);ctx.textAlign='left';ctx.font='700 34px Georgia';ctx.fillStyle=won.includes(id)?'#8e8069':'#41291f';ctx.fillText(name,154,y,375);
            if(won.includes(id)){ctx.strokeStyle='#a43b33';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(149,y-15);ctx.lineTo(540,y-7);ctx.stroke();}
          });ctx.textAlign='center';
          ctx.fillStyle='#41291f';ctx.font='700 31px Georgia';ctx.fillText(`${(bounty?.amount||queued?.amount||0).toLocaleString()} CHIPS EACH`,320,820);ctx.font='25px Georgia';ctx.fillText('Win a hand. Cross your name off.',320,860);
        }
      }
      next.needsUpdate=true;
    }

    function processEvents(room:RoomView,time:number){
      if(eventHand!==room.handNo){eventHand=room.handNo;clear(muck);for(const ring of knockRings){materials.delete(ring.object.material as THREE.Material);(ring.object.material as THREE.Material).dispose();}clear(flyingChips);knockRings.length=0;gestures.clear();dealerCue=null;dieValue=0;boardBeforeDie=null;dieStarted=oceanStarted=-Infinity;}
      const events=room.tableEvents||[];
      if(!eventsInitialized){events.forEach(event=>seenEvents.add(event.id));eventsInitialized=true;return;}
      const present=new Set(events.map(event=>event.id));for(const id of seenEvents)if(!present.has(id))seenEvents.delete(id);
      for(const event of events){
        if(seenEvents.has(event.id))continue;seenEvents.add(event.id);
        if(event.handNo!==room.handNo||live.current.now-event.at>12000)continue;
        if(event.type==='deal'){dealerCue={handNo:room.handNo,start:time,players:event.players,rounds:event.rounds,dealerId:event.dealerId};}
        if(event.type==='ocean')oceanStarted=time;
        if(event.type==='die'){boardBeforeDie=[...lastShownBoard];dieValue=event.roll;dieStarted=reducedMotion?time-DIE_ROLL_MS:time;}
        if(event.type==='bet'){throwChips(room,event.playerId,event.amount,time);gestures.set(event.playerId,{kind:'bet',start:time});}
        if(event.type==='check'){gestures.set(event.playerId,{kind:'check',start:time});knock(room,event.playerId,time);}
        if(event.type==='fold'){
          gestures.set(event.playerId,{kind:'fold',start:time});
          const count=room.players.find(p=>p.id===event.playerId)?.hole.length||2;
          for(let i=0;i<count;i++){
            const target=new THREE.Vector3((narrow?-2.08:-2.45)+(i%3)*.045,FELT_Y+.013+(muck.children.length)*.006,.85+(i%2)*.05);
            const card=makeCard('?',muck,target,new THREE.Euler(-Math.PI/2,0,(i-1)*.08));card.scale.setScalar(1.15);
            moveObject(card,playerPoint(room,event.playerId,(i-(count-1)/2)*.25,.95,FELT_Y+.045),target,time+i*40,780,.34,Math.PI*3);
          }
        }
      }
    }
    function animateMotions(time:number){
      for(let i=motions.length-1;i>=0;i--){
        const motion=motions[i],t=Math.max(0,Math.min(1,(time-motion.start)/motion.duration));
        motion.object.visible=time>=motion.start;if(time<motion.start)continue;
        motion.object.position.lerpVectors(motion.from,motion.target,1-Math.pow(1-t,2));motion.object.position.y+=Math.sin(t*Math.PI)*motion.arc;
        motion.object.quaternion.copy(motion.rotation).multiply(new THREE.Quaternion().setFromAxisAngle(worldUp,motion.spin*(1-t)));
        if(t===1){motion.object.position.copy(motion.target);motion.object.quaternion.copy(motion.rotation);if(motion.remove)motion.object.removeFromParent();motions.splice(i,1);}
      }
      for(let i=knockRings.length-1;i>=0;i--){const ring=knockRings[i],t=(time-ring.start)/750;ring.object.scale.setScalar(1+t*2);(ring.object.material as THREE.MeshBasicMaterial).opacity=Math.max(0,.45*(1-t));if(t>=1){ring.object.removeFromParent();materials.delete(ring.object.material as THREE.Material);(ring.object.material as THREE.Material).dispose();knockRings.splice(i,1);}}
    }
    function animateArms(arms:{leftArm:THREE.Group;rightArm:THREE.Group},id:string,time:number,rest=0){
      let x=rest,y=0,z=0;
      const gesture=gestures.get(id),t=gesture?(time-gesture.start)/1000:2;
      if(gesture&&t<1&&!reducedMotion){
        if(gesture.kind==='check')x=-Math.abs(Math.sin(t*Math.PI*4))*.3;
        else{x=-Math.sin(t*Math.PI)*.35;y=-Math.sin(t*Math.PI)*.3;z=Math.sin(t*Math.PI)*.12;}
      }else if(gesture)gestures.delete(id);
      if(dealerCue?.dealerId===id&&!reducedMotion){const dealT=time-dealerCue.start;if(dealT<dealerCue.players.length*dealerCue.rounds*105+600){const sweep=Math.max(0,Math.sin(dealT/105*Math.PI));x=-.12-sweep*.3;y=sweep*.4;z=sweep*.12;}}
      arms.rightArm.rotation.set(x,y,z);arms.leftArm.rotation.x=rest;
    }

    function resize() {
      const width = element!.clientWidth || 900, height = element!.clientHeight || 700;
      narrow = width < 700;
      renderer.setSize(width, height, false); camera.aspect = width / height;
      // The same physical room stays visible in portrait; the spectator sits slightly back.
      camera.fov = narrow ? 88 : 69;
      camera.position.set(0,narrow?3.15:2.72,narrow?(live.current.room.settings.maxPlayers>6?5.1:4.75):3.55);
      table.scale.x = narrow ? .7 : 1;
      tableBook.position.set(narrow?1.22:1.5,FELT_Y+.012,narrow?1.28:1.22);
      tableBook.scale.setScalar(narrow?1.08:1);
      camera.updateProjectionMatrix(); renderer.shadowMap.enabled = !narrow;
      layoutSignature = '';
      boardSignature = '';
      handSignature = '';
    }
    const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(element); resize();

    function updateLayout(room: RoomView) {
      const mySeat = room.players.find(player => player.id === room.me)?.seat || 0;
      const signature = `${room.settings.maxPlayers}/${mySeat}/${narrow}/${room.players.map(player => `${player.id}:${player.seat}`).join(',')}`;
      if (signature === layoutSignature) return;
      layoutSignature = signature; clear(emptySeats);
      const ids = new Set(room.players.filter(player => player.id !== room.me).map(player => player.id));
      for (const [id, actor] of actors) if (!ids.has(id)) { removeActor(actor); actors.delete(id); }
      const count = room.settings.maxPlayers;
      for (let seat = 0; seat < count; seat++) {
        const offset = (seat - mySeat + count) % count; if (offset === 0) continue;
        // A horseshoe keeps the full group in the seated view, even for a ten-seat table.
        const span = Math.min(1, (count - 1) / 5);
        const progress = count === 2 ? .5 : (1 - span) / 2 + (offset - 1) / (count - 2) * span;
        const angle = progress * Math.PI;
        const x = -(narrow ? 2.38 : 3.86) * Math.cos(angle), z = (narrow ? -1.1 : -.6) - (narrow ? 1.8 : 2.2) * Math.sin(angle);
        const facing = Math.atan2(-x, -z);
        const player = room.players.find(candidate => candidate.seat === seat);
        if (player) {
          const actor = actors.get(player.id) || makeActor(player);
          actor.root.position.set(x, 0, z); actor.root.rotation.y = facing;
          actor.nameplate.position.set(x * (narrow ? .86 : .96), 2.78, z + .05); actor.nameplate.scale.set(narrow ? .23 : .24, narrow ? .067 : .07, 1);
          actor.reaction.position.set(x + .44, 2.95, z); actor.reaction.scale.setScalar(narrow ? .58 : .46);
        } else {
          const empty = new THREE.Group(); empty.position.set(x, 0, z); empty.rotation.y = facing; chair(empty); emptySeats.add(empty);
        }
      }
    }
    function updateCards(room:RoomView,time:number) {
      const firstBoard=boardBeforeDie?.length===5&&time-dieStarted<DIE_ROLL_MS?boardBeforeDie:room.board;
      const signature=`${room.handNo}/${firstBoard.join(',')}/${room.boardTwo.join(',')}/${room.phase==='waiting'}`;
      if(signature!==boardSignature){
        const previous=boardSignature;boardSignature=signature;clear(boards);
        const rows=room.isDoubleBarrel?[firstBoard,room.boardTwo]:[firstBoard];
        const lineCounts=rows.map(row=>Math.max(1,Math.ceil(row.length/(row.length>9?8:Math.max(5,row.length)))));
        const totalLines=lineCounts.reduce((sum,count)=>sum+count,0),boardScale=totalLines>4?.85:totalLines>2?1:narrow?1.3:1.5;
        const boardStart=totalLines>2?-1.55:totalLines>1?-.55:0;
        const lineSpacing=totalLines>2?Math.min(.8,2.2/(totalLines-1)):.94;
        let firstLine=0;
        rows.forEach((row,rowIndex)=>{
          const rowGroup=new THREE.Group();boards.add(rowGroup);
          if(room.isDoubleBarrel){const label=boardLabels[rowIndex];boards.add(label);label.position.set(narrow?0:-2.15,1.31,boardStart+firstLine*lineSpacing-(narrow?.47:0));}
          for(let i=0;i<row.length;i++){
            const perRow=row.length>9?8:Math.max(5,row.length),line=Math.floor(i/perRow),inLine=Math.min(perRow,row.length-line*perRow);
            const spacing=row.length>7?.32:.445,scale=boardScale*(row.length>7?.84:1);
            const target=new THREE.Vector3((i%perRow-(inLine-1)/2)*spacing*boardScale,FELT_Y+.008+i*.0002,boardStart+(firstLine+line)*lineSpacing);
            const existing=previous.split('/')[0]===String(room.handNo)&&previous.split('/')[rowIndex+1]?.split(',')[i]===row[i];
            const ocean=room.isOcean&&i===5&&!existing&&time-oceanStarted<OCEAN_WAVE_MS;
            const card=makeCard(row[i],rowGroup,target,new THREE.Euler(-Math.PI/2,0,0),i*75,!existing&&!ocean&&previous?dealerOrigin(room):undefined);
            card.scale.setScalar(scale);
            if(ocean)moveObject(card,new THREE.Vector3(target.x,FELT_Y+.018,-2.05),target,oceanStarted+200,1100,.025,0);
          }
          firstLine+=lineCounts[rowIndex];
        });
        lastShownBoard=[...firstBoard];
      }
      const own=room.players.find(player=>player.id===room.me);
      const shown=!!room.result?.revealed.includes(room.me);
      const ownSignature=`${room.handNo}/${own?.hole.join(',')}/${own?.folded}/${shown}`;
      if(ownSignature!==handSignature){
        const newHand=handSignature.split('/')[0]!==String(room.handNo);handSignature=ownSignature;clear(heldCards);
        if(!own?.folded||shown){
          const cards=own?.hole||[];
          cards.forEach((card,i)=>{
            const offset=i-(cards.length-1)/2,spacing=cards.length>3?.33:.47;
            const target=new THREE.Vector3(-.62+offset*spacing,FELT_Y+.013+i*.001,1.3+Math.abs(offset)*.018);
            const delay=newHand?cardDealDelay(room,room.me,i):undefined;
            const object=makeCard(card,heldCards,target,new THREE.Euler(-Math.PI/2,0,offset*-.05),delay||0,delay!==undefined?dealerOrigin(room):undefined);
            object.scale.setScalar(cards.length>3?1.3:1.5);
          });
        }
      }
    }
    function updateActors(room: RoomView, now: number, time: number) {
      let cameraFaces = 0;
      for (const player of room.players) {
        const actor = actors.get(player.id); if (!actor) continue;
        const expression = characterExpression(player, room, now);
        const remotePose = live.current.poses[player.id] || { yaw: 0, pitch: 0 };
        const breathing = reducedMotion ? 0 : Math.sin((time - born) / 900 + actor.idlePhase) * .009;
        actor.head.position.y = 2.04 + breathing;
        // Apply the sender's view-relative yaw in avatar space. The character
        // face is oriented toward the table, so reversing this value makes a
        // leftward camera turn appear as a rightward head turn to other seats.
        actor.head.rotation.y += (remotePose.yaw * .62 - actor.head.rotation.y) * .16;
        actor.head.rotation.x += (remotePose.pitch * .3 - actor.head.rotation.x) * .16;
        const tilt = remotePose.face?0:expression === 'thinking' ? -.12 : expression === 'fold' ? .11 : 0;
        actor.head.rotation.z += (tilt - actor.head.rotation.z) * .09;
        const armAngle = expression === 'winner' || expression === 'fire' ? -.8 : expression === 'thinking' ? -.25 : 0;
        animateArms(actor,player.id,time,armAngle);
        attachVideo(actor, live.current.streams[player.id]);
        const useVideo = actor.videoTexture && actor.video && actor.video.readyState >= 2;
        if (useVideo) cameraFaces++;
        const face = useVideo ? actor.videoTexture! : remotePose.face?trackedFaceTexture(player.id,remotePose.face):faceTexture(expression);
        if (actor.face.material.map !== face) { actor.face.material.map = face; actor.face.material.needsUpdate = true; }
        const action = room.turnId === player.id ? 'Thinking…' : room.phase === 'showdown' && room.result?.winners.includes(player.id) ? 'WINNER' : player.sittingOut ? 'Sitting out' : player.lastAction || 'Ready';
        const title = player.name;
        const label = `${title}/${player.stack}/${action}`;
        if (actor.label !== label) { actor.label = label; setSpriteTexture(actor.nameplate, labelTexture(title, `${player.stack.toLocaleString()} chips`, action, room.turnId === player.id)); }
        const shown=!!room.result?.revealed.includes(player.id);
        const hole=`${room.handNo}/${player.hole.join(',')}/${player.folded}/${shown}`;
        if(actor.hole!==hole){
          const newHand=actor.hole?.split('/')[0]!==String(room.handNo);actor.hole=hole;clear(actor.cards);
          if(!player.folded||shown)player.hole.forEach((card,i)=>{
            const offset=i-(player.hole.length-1)/2,delay=newHand?cardDealDelay(room,player.id,i):undefined;
            const object=makeCard(card,actor.cards,new THREE.Vector3(.24+offset*.25,FELT_Y+.008+i*.001,1.08),new THREE.Euler(-Math.PI/2,0,offset*-.04),delay||0,delay!==undefined?dealerOrigin(room):undefined);
            object.scale.setScalar(room.settings.maxPlayers>7?.9:1.1);
          });
        }
        const reaction = player.reaction?.expiresAt && player.reaction.expiresAt > now ? player.reaction.emoji : '';
        const reactionKey = `${reaction}/${expression}`;
        if (actor.expression !== expression || actor.reaction.userData.key !== reactionKey) {
          actor.expression = expression; actor.reaction.userData.key = reactionKey;
          if (reaction) setSpriteTexture(actor.reaction, drawTexture(128, 128, ctx => { ctx.font = '95px system-ui'; ctx.textAlign = 'center'; ctx.fillText(reaction, 64, 101); }));
        }
        actor.reaction.visible = !!reaction;
      }
      if (element!.dataset.cameraFaces !== String(cameraFaces)) element!.dataset.cameraFaces = String(cameraFaces);
    }
    const walkBlocked=()=>live.current.bookOpen||!!document.querySelector('dialog[open]');
    const walkKeyDown=(event:KeyboardEvent)=>{
      if(event.ctrlKey||event.metaKey||event.altKey||walkBlocked()||live.current.topDown||(event.target as HTMLElement)?.closest('input,select,textarea,[contenteditable=true]'))return;
      const key=event.key.toLowerCase();if(!['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key))return;
      event.preventDefault();walkKeys.add(key);
    };
    const walkKeyUp=(event:KeyboardEvent)=>walkKeys.delete(event.key.toLowerCase());
    const stopWalkingInput=()=>{walkKeys.clear();walkPointer=null;};
    window.addEventListener('keydown',walkKeyDown);window.addEventListener('keyup',walkKeyUp);window.addEventListener('blur',stopWalkingInput);document.addEventListener('visibilitychange',stopWalkingInput);
    function animate(time: number) {
      if (disposed) return;
      // Bound GPU work when video encoding/decoding shares the device.
      const videoActive=!!live.current.localStream||Object.keys(live.current.streams).length>0;
      const interval=narrow||videoActive?1000/30:1000/45;
      if(time-lastRendered<interval){animationFrame=requestAnimationFrame(animate);return;}
      lastRendered=time;
      renderer.shadowMap.enabled=!narrow&&!videoActive;
      const { room, now, pose } = live.current;
      currentYaw += (pose.yaw - currentYaw) * .12; currentPitch += (pose.pitch - currentPitch) * .12;
      const dt=previousFrame?Math.min(100,time-previousFrame):22;previousFrame=time;
      const bookTarget=live.current.bookOpen?1:0;
      bookBlend=reducedMotion?bookTarget:THREE.MathUtils.damp(bookBlend,bookTarget,6,dt/1000);
      coverHinge.rotation.z=bookBlend*2.75;
      bookGold.emissiveIntensity=THREE.MathUtils.damp(bookGold.emissiveIntensity,bookHovered?.75:.08,8,dt/1000);
      const loungeTarget=room.isStripClub?1:0;
      loungeBlend=reducedMotion?loungeTarget:THREE.MathUtils.damp(loungeBlend,loungeTarget,1.8,dt/1000);
      (scene.background as THREE.Color).copy(normalWall).lerp(roseWall,loungeBlend);
      (scene.fog as THREE.Fog).color.copy(scene.background as THREE.Color);
      wall.color.copy(normalWall).lerp(roseWall,loungeBlend);
      ambient.color.copy(normalAmbient).lerp(roseAmbient,loungeBlend);ambient.intensity=1.8-.28*loungeBlend;
      tableLight.color.copy(normalKey).lerp(roseKey,loungeBlend);
      fill.color.copy(normalFill).lerp(roseFill,loungeBlend);
      felt.color.copy(whiteFelt).lerp(roseFelt,loungeBlend);
      roseLight.intensity=33*loungeBlend;amberLight.intensity=27*loungeBlend;loungeDecor.visible=loungeBlend>.01;
      const loungeTheme=room.isStripClub?'velvet':'standard';if(element!.dataset.loungeTheme!==loungeTheme)element!.dataset.loungeTheme=loungeTheme;
      const blendTarget=live.current.topDown?1:0;
      topDownBlend=reducedMotion?blendTarget:THREE.MathUtils.damp(topDownBlend,blendTarget,4.5,dt/1000);
      const seatedY=narrow?3.15:2.72,seatedZ=narrow?(room.settings.maxPlayers>6?5.1:4.75):3.55;
      seatedPosition.set(0,seatedY,seatedZ);
      // Stand at the near rail and lean forward, keeping the room's vertical upright.
      overheadPosition.set(0,narrow?3.9:3.5,narrow?2.65:2.35);
      if(walkBlocked()||document.hidden){walkKeys.clear();walkPointer=null;}
      if(live.current.walkReset!==walkReset||live.current.topDown){walkReset=live.current.walkReset;if(walking){walking=false;live.current.onWalkingChange?.(false);}walkKeys.clear();}
      const forward=(walkKeys.has('w')||walkKeys.has('arrowup')?1:0)-(walkKeys.has('s')||walkKeys.has('arrowdown')?1:0)+(walkBlocked()?0:live.current.walkInput?.forward||0);
      const right=(walkKeys.has('d')?1:0)-(walkKeys.has('a')?1:0)+(walkBlocked()?0:live.current.walkInput?.right||0);
      if((forward||right)&&!live.current.topDown){
        if(!walking){walking=true;walkPosition={x:camera.position.x,z:camera.position.z};walkYaw=-currentYaw*.52;live.current.onWalkingChange?.(true);}
        const distance=2.4*dt/1000/Math.max(1,Math.hypot(forward,right));
        const chairs=[...actors.values()].map(actor=>({minX:actor.root.position.x-.32,maxX:actor.root.position.x+.32,minZ:actor.root.position.z-.32,maxZ:actor.root.position.z+.32}));
        walkPosition=resolveTableWalk(walkPosition,{x:(-Math.sin(walkYaw)*forward+Math.cos(walkYaw)*right)*distance,z:(-Math.cos(walkYaw)*forward-Math.sin(walkYaw)*right)*distance},narrow?.7:1,chairs);
      }
      if(walking){if(walkKeys.has('arrowleft'))walkYaw+=dt*.0015;if(walkKeys.has('arrowright'))walkYaw-=dt*.0015;}
      camera.position.lerpVectors(seatedPosition,overheadPosition,topDownBlend);camera.up.copy(worldUp);

      const yaw=currentYaw*(narrow?.44:.52)*(1-topDownBlend);
      const baselinePitch=Math.atan2(FELT_Y-seatedY,seatedZ-.5);
      const lookPitch=baselinePitch-currentPitch*.14*(1-topDownBlend);
      seatedTarget.set(Math.sin(yaw)*10,seatedY+Math.tan(lookPitch)*10,seatedZ-10*Math.cos(yaw));
      overheadTarget.set(0,FELT_Y,1.3);viewTarget.lerpVectors(seatedTarget,overheadTarget,topDownBlend);
      if(walking){camera.position.set(walkPosition.x,3.0,walkPosition.z);viewTarget.set(walkPosition.x-Math.sin(walkYaw)*10,3+Math.tan(walkPitch)*10,walkPosition.z-Math.cos(walkYaw)*10);}
      hands.visible=!walking;
      element!.dataset.walking=String(walking);
      camera.lookAt(viewTarget);
      const fov=(narrow?88:69)+6*topDownBlend;if(Math.abs(camera.fov-fov)>.02){camera.fov=fov;camera.updateProjectionMatrix();}
      updateLayout(room);processEvents(room,time);updateCards(room,time);updateActors(room,now,time);
      const dealer=room.players.find(player=>player.seat===room.dealerSeat);dealerButton.visible=!!dealer&&room.handNo>0;
      if(dealer)dealerButton.position.copy(playerPoint(room,dealer.id,dealer.id===room.me?-.25:-.65,dealer.id===room.me?.85:1.2,FELT_Y+.026));
      updateChipStacks(room);updateSideEffects(room,time);updateBountyPoster(room,time);animateMotions(time);
      animateArms(ownArms,room.me,time);
      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(animate);
    }
    const contextLost = (event: Event) => { event.preventDefault(); live.current.onReady?.(false); };
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    try { animate(performance.now()); live.current.onReady?.(true); }
    catch { live.current.onReady?.(false); }

    return () => {
      disposed = true; cancelAnimationFrame(animationFrame); resizeObserver.disconnect();
      window.removeEventListener('keydown',walkKeyDown);window.removeEventListener('keyup',walkKeyUp);window.removeEventListener('blur',stopWalkingInput);document.removeEventListener('visibilitychange',stopWalkingInput);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      renderer.domElement.removeEventListener('pointermove',bookMove);
      renderer.domElement.removeEventListener('pointerdown',bookDown);
      renderer.domElement.removeEventListener('pointerup',bookUp);
      renderer.domElement.removeEventListener('pointercancel',bookLeave);
      renderer.domElement.removeEventListener('pointerleave',bookLeave);
      for (const actor of actors.values()) stopVideo(actor);
      if(posterVideo){posterVideo.pause();posterVideo.srcObject=null;posterVideo.remove();}
      for(const group of stackGroups.values())clear(group);clear(potChips);
      geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); textures.forEach(value => value.dispose());
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    };
  }, [props.room.code, props.room.settings.theme]);

  return <div ref={host} className="three-poker-canvas" data-camera-faces="0" role="img" aria-label="First-person 3D poker table with seated human characters. Move your pointer to look around. WASD to walk around the live table.">
    <span className="sr-only">{props.room.players.filter(player => player.id !== props.room.me).map(player => `${player.name}: ${props.poses[player.id]?.face?'mirroring facial movements':EXPRESSION_LABELS[characterExpression(player, props.room, props.now)]}, ${player.lastAction || 'ready'}, ${player.stack.toLocaleString()} chips.`).join(' ')}</span>
  </div>;
}
