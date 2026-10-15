import * as THREE from 'three';
import type {HubObstacle} from '@/lib/hub-controls';
export const CLUB_BAR={x:4.2,z:-6.8};
export const CLUB_START={x:0,y:1.72,z:7.2};
/** The menu and live game share this exact room, including its bartender and lighting. */
export function createClubInterior(parent:THREE.Scene,renderer:THREE.WebGLRenderer,options:{previewTable:boolean}){
  const media=new THREE.Group();parent.add(media);
  // add() is all this builder needs from Scene; lights/targets live in the same owned group.
  const scene=media;
  const BAR=CLUB_BAR;
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
    const ambient=new THREE.HemisphereLight('#e9cfa0','#243328',1.0);scene.add(ambient);scene.add(new THREE.AmbientLight('#ad8a68',.7));
    function pendant(x:number,z:number,y=3.2,green=false){
      tube(black,scene,[x,(y+4.25)/2,z],[.018,4.25-y,.018]);
      const shade=add(geo(new THREE.ConeGeometry(.58,.32,32,1,true)),standard(green?'#1c4a37':'#352a1e',{side:THREE.DoubleSide,metalness:.35,roughness:.45}),scene,[x,y,z],[1,1,1]);shade.rotation.z=Math.PI;
      tube(brass,scene,[x,y+.16,z],[.12,.07,.12]);tube(warmGlow,scene,[x,y-.12,z],[.43,.018,.43]);
      const lamp=new THREE.PointLight('#ffd294',23,8,2);lamp.position.set(x,y-.23,z);lamp.castShadow=false;scene.add(lamp);
    }
    pendant(-6,-3,3.15,true);pendant(0,0,3.55,true);pendant(2,-6.4,3.15);pendant(6.4,-6.4,3.15);
    const keyLight=new THREE.SpotLight('#ffca91',75,14,Math.PI*.32,.6,1.5);keyLight.position.set(2.5,4,-5.6);keyLight.target.position.set(BAR.x,1,-7.3);keyLight.castShadow=renderer.shadowMap.enabled;keyLight.shadow.mapSize.set(1024,1024);keyLight.shadow.bias=-.001;scene.add(keyLight,keyLight.target);
    const pokerLight=new THREE.SpotLight('#ffdfaf',48,10,Math.PI*.28,.7,1.5);pokerLight.position.set(0,3.7,0);pokerLight.target.position.set(0,.9,0);scene.add(pokerLight,pokerLight.target);
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
    const table=new THREE.Group();scene.add(table);table.visible=options.previewTable;
    tube(darkWood,table,[0,.96,0],[3.72,.21,2.48]);tube(black,table,[0,1.08,0],[3.71,.14,2.47]);tube(standard('#215641',{roughness:.97}),table,[0,1.16,0],[3.48,.045,2.24]);
    for(const x of [-1.65,1.65])for(const z of [-.7,.7])box(darkWood,table,[x,.45,z],[.15,.9,.15]);
    const stitchPoints=[];for(let i=0;i<96;i++){const theta=i/96*Math.PI*2;stitchPoints.push(new THREE.Vector3(Math.cos(theta)*3.36,1.188,Math.sin(theta)*2.12));}const stitchGeo=geo(new THREE.BufferGeometry().setFromPoints(stitchPoints));const stitching=new THREE.LineLoop(stitchGeo,mat(new THREE.LineDashedMaterial({color:'#b3c69c',dashSize:.035,gapSize:.055,transparent:true,opacity:.3})));stitching.computeLineDistances();table.add(stitching);
    const cardMaps=new Map<string,THREE.Texture>();
    for(const [index,label]of ['A♠','K♥','Q♠'].entries()){const map=canvasTexture(128,192,ctx=>{ctx.fillStyle='#f6ecd5';ctx.fillRect(0,0,128,192);ctx.fillStyle=index===1?'#9e3135':'#22382e';ctx.font='bold 37px Georgia';ctx.fillText(label[0],12,41);ctx.font='30px Georgia';ctx.fillText(label[1],12,76);ctx.font='67px Georgia';ctx.textAlign='center';ctx.fillText(label[1],65,132);});cardMaps.set(label,map);const card=add(geo(new THREE.PlaneGeometry(.27,.39)),mat(new THREE.MeshBasicMaterial({map})),table,[-.38+index*.38,1.193,0],[1,1,1]);card.rotation.x=-Math.PI/2;}
    for(let i=0;i<12;i++){const chip=tube(standard(i<6?'#a43b3a':'#dbc480'),table,[.75+(i%3)*.15,1.2+Math.floor(i/3)*.027,.1],[.09,.026,.09]);chip.castShadow=false;}
    function chair(x:number,z:number,angle:number){const root=new THREE.Group();root.position.set(x,0,z);root.rotation.y=angle;scene.add(root);box(leather,root,[0,.57,0],[.68,.17,.64]);box(darkWood,root,[0,1.02,.29],[.73,.86,.12]);box(leather,root,[0,1.06,.21],[.59,.57,.07]);for(const side of [-1,1])for(const depth of [-1,1])box(darkWood,root,[side*.25,.26,depth*.23],[.07,.52,.07]);return root;}
    const chairObstacles:HubObstacle[]=[];for(let i=0;i<(options.previewTable?6:0);i++){const angle=i*Math.PI/3;const x=Math.sin(angle)*4.05,z=Math.cos(angle)*2.8;chair(x,z,angle);chairObstacles.push({minX:x-.4,maxX:x+.4,minZ:z-.4,maxZ:z+.4});}
    // Side booth, coat hooks, rugs, and a doorway give the space a home rather than a stage.
    const booth=standard('#3f3128');box(booth,scene,[8.9,.46,3.7],[1.2,.77,4.7]);box(booth,scene,[9.38,1.08,3.7],[.23,1.3,4.9]);box(standard('#4d4531'),scene,[8.24,.52,3.7],[.05,.07,4.3]);
    for(const z of [2.3,5]){tube(brass,scene,[7.3,.35,z],[.055,.7,.055]);tube(darkWood,scene,[7.3,.78,z],[.62,.12,.62]);}
    const rug=standard('#423830');box(rug,scene,[.5,.018,6],[5.6,.016,2.7]);for(const x of [-2.17,3.17])box(standard('#957b51'),scene,[x,.028,6],[.035,.01,2.5]);
    box(darkWood,scene,[0,1.5,9.8],[2.45,3.1,.18]);box(standard('#263d32'),scene,[0,1.5,9.68],[2.12,2.8,.10]);for(const x of [-.53,.53])box(standard('#96a388',{transparent:true,opacity:.17}),scene,[x,2.12,9.61],[.76,.9,.025]);orb(brass,scene,[.78,1.25,9.56],[.04,.04,.04]);
    sign('POOL','PULL UP FOR A GAME',2.35,1.18,[-9.79,2.35,-3],Math.PI/2);
    sign('TAKE YOUR TIME','THE NIGHT IS STILL YOUNG',2.1,1.05,[9.78,2.55,4.1],-Math.PI/2);
    // Low-cost warm wall fixtures, with no full-screen post processing.
    for(const side of [-1,1])for(const z of [-6,2,7]){box(brass,scene,[side*9.7,2.6,z],[.12,.6,.18]);orb(warmGlow,scene,[side*9.56,2.58,z],[.1,.21,.1]);const glow=new THREE.PointLight('#e9a861',6,3.8,2);glow.position.set(side*9.3,2.6,z);scene.add(glow);}

    const stoolObstacles=[-3.4,-1.15,1.15,3.4].map(offset=>({minX:BAR.x+offset-.34,maxX:BAR.x+offset+.34,minZ:BAR.z+1.56,maxZ:BAR.z+2.24}));
    const obstacles:HubObstacle[]=[{minX:-.4,maxX:8.8,minZ:-7.66,maxZ:-5.94},{minX:8.2,maxX:9.7,minZ:1.2,maxZ:6.2},...stoolObstacles];
    return{obstacles,chairObstacles,barInteraction,wall,ambient,tableLight:pokerLight,fill:keyLight,
      update:(time:number,player:{x:number;z:number},reduced=false)=>{if(!reduced){head.rotation.y=THREE.MathUtils.clamp(Math.atan2(player.x-bartender.position.x,player.z-bartender.position.z),-.7,.7);rightArm.rotation.z=Math.sin(time*.0015)*.045;body.position.y=Math.sin(time*.0012)*.008;}},
      dispose:()=>{media.removeFromParent();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());},
    };
}
