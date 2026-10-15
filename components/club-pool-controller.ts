import * as THREE from 'three';
import {createPoolWorld,type PoolStatus} from './pool-world';
import {cuePullFromDrag} from '@/lib/pool-controls';
import type {RoomView} from '@/lib/types';
import type {RoomWorld} from './useRoomWorld';
/** Input and physics share the same canvas/camera as the poker table. */
export function createClubPool(options:{scene:THREE.Scene;element:HTMLElement;getRoom:()=>RoomView;getWorld:()=>RoomWorld;blocked:()=>boolean;onActive:(active:boolean)=>void;onStatus:(status:PoolStatus)=>void;onPower:(power:number)=>void}){
  let active=false,power=0,pullStarted:number|null=null,pointer:{id:number;y:number;x:number;downY:number}|null=null,lastX:number|null=null;
  const pool=createPoolWorld({scene:options.scene,onStatus:options.onStatus,
    shared:()=>{const world=options.getWorld(),room=options.getRoom();return{match:world.pool.match,me:room.me,now:world.pool.serverNow(),online:world.pool.online,busy:world.pool.busy};},
    onShot:(dx,dz,value)=>options.getWorld().pool.shoot(dx,dz,value),
    onPlayingChange:value=>{active=value;cancelPull();options.onActive(value);const {pool:shared}=options.getWorld(),room=options.getRoom(),match=shared.match;
      if(value&&!match?.players.some(p=>p.id===room.me)&&(!match||match.players.length<2))void shared.send({type:'join'});
      // Stepping away from the cue keeps your pool seat; Leave match is an explicit forfeit.
    },
  });
  function setPower(value:number){pool.setDraw(value);if(Math.abs(power-value)>.005||value===0&&power!==0){power=value;options.onPower(value);}}
  function cancelPull(){pullStarted=null;pointer=null;setPower(0);}
  function beginPull(){if(active&&!options.blocked()&&pool.canShoot()&&!pool.getState().moving){pullStarted=performance.now();setPower(0);}}
  function releasePull(){pullStarted=null;if(active&&power>=.04&&!options.blocked())pool.shoot(power);setPower(0);}
  function enter(){if(!options.blocked()){lastX=null;pool.setActive(true);}}
  function leavePool(){cancelPull();pool.setActive(false);}
  function pointerDown(event:PointerEvent){if(!active)return false;if(options.blocked()||!pool.canShoot()||pool.getState().moving)return true;pointer={id:event.pointerId,x:event.clientX,y:event.clientY,downY:event.clientY};lastX=event.clientX;pullStarted=null;setPower(0);options.element.setPointerCapture(event.pointerId);return true;}
  function pointerMove(event:PointerEvent){if(!active)return false;if(options.blocked()){cancelPull();return true;}
    if(pointer&&pointer.id===event.pointerId){if(Math.abs(event.clientY-pointer.downY)<12&&lastX!==null)pool.rotateAim((event.clientX-lastX)*.004);setPower(cuePullFromDrag(pointer.downY,event.clientY,options.element.clientHeight));}
    else if(lastX!==null)pool.rotateAim((event.clientX-lastX)*.004);lastX=event.clientX;return true;
  }
  function pointerUp(event:PointerEvent){if(!active)return false;const held=pointer?.id===event.pointerId;pointer=null;if(options.element.hasPointerCapture(event.pointerId))options.element.releasePointerCapture(event.pointerId);if(held)releasePull();return true;}
  function keyDown(event:KeyboardEvent){if(!active)return false;const key=event.key.toLowerCase();if(options.blocked())return true;
    if(key==='escape'||key==='e'){leavePool();event.preventDefault();return true;}
    if(key==='arrowleft'||key==='arrowright'){pool.rotateAim(key==='arrowleft'?-.035:.035);event.preventDefault();return true;}
    if(event.code==='Space'){const target=event.target as HTMLElement|null;if(target?.closest('button,a,[role=button]')&&!target.closest('.hub-pool-shoot'))return true;if(!event.repeat)beginPull();event.preventDefault();}
    return true;
  }
  function keyUp(event:KeyboardEvent){if(active&&event.code==='Space'&&pullStarted!==null){releasePull();event.preventDefault();}}
  return{pool,enter,leavePool,beginPull,releasePull,cancelPull,resetPool:()=>{void options.getWorld().pool.send({type:'rematch'});},pointerDown,pointerMove,pointerUp,keyDown,keyUp,
    update:(dt:number)=>{if(options.blocked())cancelPull();if(pullStarted!==null)setPower(Math.min(1,(performance.now()-pullStarted)/1100));pool.update(dt);},
    isActive:()=>active,dispose:()=>{cancelPull();pool.dispose();},
  };
}
