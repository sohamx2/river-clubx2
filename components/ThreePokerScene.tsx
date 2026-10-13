'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { characterExpression, EXPRESSION_LABELS, type CharacterExpression } from '@/lib/table-characters';
import type { HeadPose } from '@/lib/presence-types';
import type { PublicPlayer, RoomView, Theme } from '@/lib/types';

interface SceneProps {
  room: RoomView;
  now: number;
  pose: HeadPose;
  poses: Record<string, HeadPose>;
  streams: Record<string, MediaStream>;
  localStream: MediaStream | null;
  onReady?: (ready: boolean) => void;
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
    scene.add(world, boards, emptySeats);
    camera.add(hands, heldCards);
    let disposed = false;
    let animationFrame = 0;
    let narrow = false;
    let layoutSignature = '';
    let boardSignature = '';
    let handSignature = '';
    let potLabel = '';
    let lastRendered = 0;
    let currentYaw = 0;
    let currentPitch = 0;
    const born = performance.now();
    const dealAnimations: { object: THREE.Object3D; target: THREE.Vector3; start: number; held: boolean }[] = [];
    const geometry = <T extends THREE.BufferGeometry>(value: T): T => { geometries.add(value); return value; };
    const material = <T extends THREE.Material>(value: T): T => { materials.add(value); return value; };
    const texture = <T extends THREE.Texture>(value: T): T => { textures.add(value); value.colorSpace = THREE.SRGBColorSpace; return value; };
    const standard = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => material(new THREE.MeshStandardMaterial({ color, roughness: .78, ...extra }));
    const mesh = <G extends THREE.BufferGeometry, M extends THREE.Material>(shape: G, paint: M, parent: THREE.Object3D, position?: [number, number, number]) => {
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
    const heldCardMaterials = new Map<string, THREE.MeshBasicMaterial>();
    const faceTextures = new Map<CharacterExpression, THREE.CanvasTexture>();

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
      return drawTexture(640, 190, ctx => {
        ctx.fillStyle = active ? '#31463bee' : '#131a20ee';
        ctx.beginPath(); ctx.roundRect(4, 4, 632, 182, 28); ctx.fill();
        ctx.strokeStyle = active ? palette.accent : '#d6d8c84d'; ctx.lineWidth = active ? 6 : 3; ctx.stroke();
        ctx.textAlign = 'center'; ctx.fillStyle = '#fff8e8'; ctx.font = '700 48px system-ui';
        ctx.fillText(title.slice(0, 20), 320, 67, 570);
        ctx.fillStyle = palette.accent; ctx.font = '700 44px system-ui'; ctx.fillText(detail, 320, 120, 570);
        if (action) { ctx.fillStyle = '#dce6e2'; ctx.font = '500 28px system-ui'; ctx.fillText(action, 320, 164, 570); }
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
          } else if (expression === 'fold') { path([[58, 75], [99, 88]]); path([[156, 88], [198, 75]]); path([[97, 181], [129, 165], [160, 181]]); }
          else if (expression === 'fire' || expression === 'all-in') { path([[55, 69], [100, 87]]); path([[154, 87], [199, 69]]); path([[92, 166], [166, 166], [156, 184], [102, 184], [92, 166]], '#302224', 6); path([[105, 174], [153, 174]], '#fff9ed', 8); }
          else if (expression === 'raise') { path([[54, 73], [100, 85]]); path([[154, 85], [200, 73]]); path([[93, 175], [126, 183], [168, 161]]); }
          else if (expression === 'call') { path([[57, 72], [101, 72]]); path([[155, 72], [199, 72]]); path([[107, 174], [149, 174]]); }
          else smile();
        }
        path([[129, 125], [121, 145], [135, 145]], '#a66c51', 4);
      });
      faceTextures.set(expression, value); return value;
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
    function makeCard(card: string, parent: THREE.Group, target: THREE.Vector3, rotation: THREE.Euler, delay = 0, held = false) {
      const group = new THREE.Group(); group.position.copy(target); group.rotation.copy(rotation); parent.add(group);
      const body = mesh(cardThickness, ivory, group); body.castShadow = !held;
      let paint = cardMaterial(card);
      if (held) {
        const cached = heldCardMaterials.get(card);
        if (cached) paint = cached;
        else {
          paint = material(paint.clone()); paint.depthTest = false; paint.depthWrite = false;
          heldCardMaterials.set(card, paint);
        }
      }
      const front = mesh(cardPlane, paint, group, [0, 0, .0055]); front.castShadow = false;
      if (held) front.renderOrder = 100 + delay;
      if (!reducedMotion) {
        group.position.add(held ? new THREE.Vector3(-.35, -.52, -.3) : new THREE.Vector3(0, .32, -.8));
        dealAnimations.push({ object: group, target: target.clone(), start: performance.now() + delay, held });
      }
      return group;
    }
    function clear(parent: THREE.Group) { for (const child of [...parent.children]) parent.remove(child); }
    function makeActor(player: PublicPlayer) {
      const root = new THREE.Group(); world.add(root); chair(root);
      const shirt = standard(`hsl(${(player.seat * 47 + 27) % 360}, 35%, 43%)`);
      const trouser = standard('#24252a');
      segment(root, new THREE.Vector3(0, .82, 0), new THREE.Vector3(0, 1.51, 0), .12, shirt);
      ball(root, shirt, [0, 1.49, 0], [.28, .1, .13]);
      segment(root, new THREE.Vector3(0, 1.49, 0), new THREE.Vector3(0, 1.74, 0), .061, skin);
      for (const x of [-.14, .14]) {
        segment(root, new THREE.Vector3(x, .83, .02), new THREE.Vector3(x, .49, .38), .075, trouser);
        segment(root, new THREE.Vector3(x, .49, .38), new THREE.Vector3(x, .1, .35), .065, trouser);
        ball(root, hair, [x, .08, .42], [.09, .07, .17]);
      }
      const leftArm = new THREE.Group(), rightArm = new THREE.Group(); root.add(leftArm, rightArm);
      for (const [side, arm] of [[-1, leftArm], [1, rightArm]] as const) {
        arm.position.set(side * .27, 1.48, 0);
        segment(arm, new THREE.Vector3(), new THREE.Vector3(side * .12, -.29, .23), .057, shirt);
        segment(arm, new THREE.Vector3(side * .12, -.29, .23), new THREE.Vector3(side * .11, -.27, .55), .051, skin);
        ball(arm, skin, [side * .11, -.27, .55], [.074, .035, .09]);
      }
      const head = new THREE.Group(); head.position.set(0, 1.84, 0); root.add(head);
      ball(head, skin, [0, .12, 0], [.27, .31, .255]);
      for (const x of [-.267, .267]) ball(head, skin, [x, .115, 0], [.049, .073, .05]);
      ball(head, hair, [0, .335, -.05], [.275, .095, .229]);
      if (player.seat % 3 === 0) ball(head, hair, [-.07, .355, .08], [.24, .055, .19]);
      const face = mesh(headPlane, material(new THREE.MeshBasicMaterial({ map: faceTexture('neutral'), alphaMap: faceMask, alphaTest: .015, transparent: true, depthWrite: false, toneMapped: false })), head, [0, .12, .257]);
      face.castShadow = false;
      const nameplate = sprite(labelTexture(player.name, player.stack.toLocaleString()), 1.25, .37, world);
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
    const pot = sprite(labelTexture('POT', '0'), 1.05, .31, boards); pot.position.set(1.8, 1.38, .25);
    const boardLabels = ['BOARD I', 'BOARD II'].map(label => sprite(drawTexture(256, 64, ctx => {
      ctx.fillStyle = '#111925da'; ctx.beginPath(); ctx.roundRect(0, 0, 256, 64, 14); ctx.fill();
      ctx.fillStyle = palette.accent; ctx.font = '700 34px system-ui'; ctx.textAlign = 'center'; ctx.fillText(label, 128, 44);
    }), .88, .22, boards));
    const handSkin = standard('#e3b58e', { roughness: .6 });
    const sleeve = standard('#242b37', { roughness: .88 });
    for (const side of [-1, 1]) {
      segment(hands, new THREE.Vector3(side * .74, -.92, -.55), new THREE.Vector3(side * .41, -.64, -1.25), .084, sleeve);
      segment(hands, new THREE.Vector3(side * .41, -.64, -1.25), new THREE.Vector3(side * .28, -.56, -1.37), .058, handSkin);
      ball(hands, handSkin, [side * .25, -.545, -1.37], [.1, .066, .14]);
      for (let i = 0; i < 4; i++) {
        segment(hands, new THREE.Vector3(side * (.17 + i * .032), -.54, -1.39), new THREE.Vector3(side * (.16 + i * .032), -.43, -1.43), .013, handSkin);
      }
    }

    function resize() {
      const width = element!.clientWidth || 900, height = element!.clientHeight || 700;
      narrow = width < 700;
      renderer.setSize(width, height, false); camera.aspect = width / height;
      // The same physical room stays visible in portrait; the spectator sits slightly back.
      camera.fov = narrow ? 80 : 61;
      camera.position.set(0, narrow ? 2.48 : 2.27, narrow ? 5.5 : 4.55);
      table.scale.x = narrow ? .7 : 1;
      pot.position.set(narrow ? 1.65 : 2.2, 1.38, narrow ? -1.2 : .4);
      hands.position.y = heldCards.position.y = narrow ? .16 : -.12;
      // Scaling a camera-attached group scales its distance too, leaving cards
      // the same apparent size. Scale the card meshes independently instead.
      hands.scale.setScalar(1); heldCards.scale.setScalar(1);
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
        const x = -3.86 * Math.cos(angle) * (narrow ? .7 : 1), z = -.6 - 2.2 * Math.sin(angle);
        const facing = Math.atan2(-x, -z);
        const player = room.players.find(candidate => candidate.seat === seat);
        if (player) {
          const actor = actors.get(player.id) || makeActor(player);
          actor.root.position.set(x, 0, z); actor.root.rotation.y = facing;
          actor.nameplate.position.set(x * (narrow ? .86 : .96), 2.48, z + .05); actor.nameplate.scale.set(narrow ? 1.13 : 1.25, narrow ? .34 : .37, 1);
          actor.reaction.position.set(x + .44, 2.65, z); actor.reaction.scale.setScalar(narrow ? .58 : .46);
        } else {
          const empty = new THREE.Group(); empty.position.set(x, 0, z); empty.rotation.y = facing; chair(empty); emptySeats.add(empty);
        }
      }
    }
    function updateCards(room: RoomView, time: number) {
      const signature = `${room.handNo}/${room.board.join(',')}/${room.boardTwo.join(',')}/${room.phase === 'waiting'}`;
      if (signature !== boardSignature) {
        const previous = boardSignature; boardSignature = signature;
        for (const child of [...boards.children]) if (child !== pot) boards.remove(child);
        const rows = room.isDoubleBarrel ? [room.board, room.boardTwo] : [room.board];
        const lineCounts = rows.map(row => Math.max(1, Math.ceil(row.length / (row.length > 9 ? 8 : Math.max(5, row.length)))));
        const totalLines = lineCounts.reduce((sum, count) => sum + count, 0);
        const boardScale = totalLines > 4 ? 1 : 1.5;
        const boardStart = totalLines > 2 ? -1.6 : narrow ? (room.isDoubleBarrel ? -1.9 : -1.4) : room.isDoubleBarrel ? -.45 : .5;
        const lineSpacing = totalLines > 2 ? Math.min(.93, 3.2 / (totalLines - 1)) : narrow ? .8 : .93;
        let firstLine = 0;
        rows.forEach((row, rowIndex) => {
          const total = row.length;
          const rowGroup = new THREE.Group(); boards.add(rowGroup);
          if (room.isDoubleBarrel) {
            const label = boardLabels[rowIndex]; boards.add(label); label.position.set(narrow ? -1.8 : -2.23, 1.45, boardStart + firstLine * lineSpacing);
          }
          // Long Red River boards wrap on the felt instead of disappearing off the table.
          for (let i = 0; i < total; i++) {
            const perRow = total > 9 ? 8 : Math.max(5, total); const line = Math.floor(i / perRow); const inLine = Math.min(perRow, total - line * perRow);
            const spacing = total > 7 ? .32 : .445;
            const scale = boardScale * (total > 7 ? .84 : 1);
            const boardTilt = -Math.PI / 2 + .4;
            const target = new THREE.Vector3((i % perRow - (inLine - 1) / 2) * spacing * boardScale, 1.18 + .2825 * Math.cos(boardTilt) * scale + i * .0002, boardStart + (firstLine + line) * lineSpacing);
            const card = makeCard(row[i], rowGroup, target, new THREE.Euler(boardTilt, 0, 0), i * 75);
            card.scale.setScalar(scale);
            if (previous && previous.split('/')[0] === String(room.handNo)) {
              const existing = previous.split('/')[rowIndex + 1]?.split(',') || [];
              if (existing[i] === row[i]) {
                const animationIndex = dealAnimations.findIndex(animation => animation.object === card);
                if (animationIndex >= 0) dealAnimations.splice(animationIndex, 1);
                card.position.copy(target);
              }
            }
          }
          firstLine += lineCounts[rowIndex];
        });
      }
      const own = room.players.find(player => player.id === room.me);
      hands.position.x = heldCards.position.x = narrow ? 0 : -.72;
      const ownSignature = `${room.handNo}/${own?.hole.join(',')}/${own?.folded}`;
      if (ownSignature !== handSignature) {
        handSignature = ownSignature; clear(heldCards);
        const cards = own?.hole || [];
        cards.forEach((card, i) => {
          const offset = i - (cards.length - 1) / 2;
          const spacing=narrow?(cards.length>3?.13:.22):(cards.length>3?.17:.3);
          const target = new THREE.Vector3(offset * spacing, -.25 - Math.abs(offset) * (narrow ? .008 : .025), -1.52 + i * (narrow ? .025 : .045));
          const object = makeCard(card, heldCards, target, new THREE.Euler(-.045, offset * (narrow ? -.025 : -.045), offset * (narrow ? -.055 : -.13)), i * 95, true);
          object.scale.setScalar((narrow ? .55 : .72) * (own?.folded ? .9 : 1));
        });
      }
      const amount = room.phase === 'showdown' ? room.result?.payouts.reduce((sum, payout) => sum + payout.amount, 0) || 0 : room.pot;
      const nextPot = `${amount}`;
      if (nextPot !== potLabel) { potLabel = nextPot; setSpriteTexture(pot, labelTexture(room.phase === 'showdown' ? 'LAST POT' : 'POT', amount.toLocaleString())); }
      pot.visible = room.phase !== 'waiting';
      for (let i = dealAnimations.length - 1; i >= 0; i--) {
        const animation = dealAnimations[i], elapsed = (time - animation.start) / 650;
        if (elapsed < 0) continue;
        if (elapsed >= 1) { animation.object.position.copy(animation.target); dealAnimations.splice(i, 1); continue; }
        const remaining = Math.pow(1 - elapsed, 3);
        animation.object.position.copy(animation.target).add(animation.held ? new THREE.Vector3(-.35 * remaining, -.52 * remaining, -.3 * remaining) : new THREE.Vector3(0, .32 * remaining, -.8 * remaining));
      }
    }
    function updateActors(room: RoomView, now: number, time: number) {
      let cameraFaces = 0;
      for (const player of room.players) {
        const actor = actors.get(player.id); if (!actor) continue;
        const expression = characterExpression(player, room, now);
        const remotePose = live.current.poses[player.id] || { yaw: 0, pitch: 0 };
        const breathing = reducedMotion ? 0 : Math.sin((time - born) / 900 + actor.idlePhase) * .009;
        actor.head.position.y = 1.84 + breathing;
        actor.head.rotation.y += (remotePose.yaw * .62 - actor.head.rotation.y) * .16;
        actor.head.rotation.x += (remotePose.pitch * .3 - actor.head.rotation.x) * .16;
        const tilt = expression === 'thinking' ? -.12 : expression === 'fold' ? .11 : 0;
        actor.head.rotation.z += (tilt - actor.head.rotation.z) * .09;
        const armAngle = expression === 'winner' || expression === 'fire' ? -.8 : expression === 'thinking' ? -.25 : 0;
        actor.rightArm.rotation.x += (armAngle - actor.rightArm.rotation.x) * .08;
        actor.leftArm.rotation.x += ((expression === 'winner' ? -.8 : 0) - actor.leftArm.rotation.x) * .08;
        attachVideo(actor, live.current.streams[player.id]);
        const useVideo = actor.videoTexture && actor.video && actor.video.readyState >= 2;
        if (useVideo) cameraFaces++;
        const face = useVideo ? actor.videoTexture! : faceTexture(expression);
        if (actor.face.material.map !== face) { actor.face.material.map = face; actor.face.material.needsUpdate = true; }
        const action = room.turnId === player.id ? 'Thinking…' : room.phase === 'showdown' && room.result?.winners.includes(player.id) ? 'WINNER' : player.sittingOut ? 'Sitting out' : player.lastAction || 'Ready';
        const title = `${player.name}${player.seat === room.dealerSeat ? ' · D' : ''}`;
        const label = `${title}/${player.stack}/${action}`;
        if (actor.label !== label) { actor.label = label; setSpriteTexture(actor.nameplate, labelTexture(title, player.stack.toLocaleString(), action, room.turnId === player.id)); }
        const hole = `${room.handNo}/${player.hole.join(',')}/${player.folded}`;
        if (actor.hole !== hole) {
          actor.hole = hole; clear(actor.cards);
          player.hole.forEach((card, i) => {
            const offset = i - (player.hole.length - 1) / 2;
            const object = makeCard(card, actor.cards, new THREE.Vector3(offset * .14, 1.39 + Math.abs(offset) * -.012, .6), new THREE.Euler(-.72, offset * -.08, offset * -.1), i * 65);
            object.scale.setScalar(.75); if (player.folded) actor.cards.visible = false;
          });
          actor.cards.visible = !player.folded;
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
      const yaw = currentYaw * (narrow ? .44 : .52);
      const baselinePitch = Math.atan2((narrow ? .45 : 1.47) - camera.position.y, camera.position.z + .8);
      const lookPitch = baselinePitch - currentPitch * .18;
      viewTarget.set(Math.sin(yaw) * 10, camera.position.y + Math.tan(lookPitch) * 10, camera.position.z - 10 * Math.cos(yaw));
      camera.lookAt(viewTarget);
      updateLayout(room); updateCards(room, time); updateActors(room, now, time);
      if (!reducedMotion) hands.rotation.z = Math.sin((time - born) / 2100) * .003;
      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(animate);
    }
    const contextLost = (event: Event) => { event.preventDefault(); live.current.onReady?.(false); };
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    try { animate(performance.now()); live.current.onReady?.(true); }
    catch { live.current.onReady?.(false); }

    return () => {
      disposed = true; cancelAnimationFrame(animationFrame); resizeObserver.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      for (const actor of actors.values()) stopVideo(actor);
      geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); textures.forEach(value => value.dispose());
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    };
  }, [props.room.code, props.room.settings.theme]);

  return <div ref={host} className="three-poker-canvas" data-camera-faces="0" role="img" aria-label="First-person 3D poker table with seated human characters. Move your pointer to look around.">
    <span className="sr-only">{props.room.players.filter(player => player.id !== props.room.me).map(player => `${player.name}: ${EXPRESSION_LABELS[characterExpression(player, props.room, props.now)]}, ${player.lastAction || 'ready'}, ${player.stack.toLocaleString()} chips.`).join(' ')}</span>
  </div>;
}
