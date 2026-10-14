import {parseFacePose} from './face-pose';
import type {HeadPose} from './presence-types';

/** Validate direct peer packets as strictly as the server presence endpoint. */
export function parseAvatarPose(value:unknown):HeadPose|null {
  if(!value||typeof value!=='object')return null;
  const input=value as Record<string,unknown>;
  if(typeof input.yaw!=='number'||typeof input.pitch!=='number'||!Number.isFinite(input.yaw)||!Number.isFinite(input.pitch)||Math.abs(input.yaw)>1||Math.abs(input.pitch)>1)return null;
  const face=input.face==null?null:parseFacePose(input.face);
  if(input.face!=null&&!face)return null;
  return {yaw:input.yaw,pitch:input.pitch,face};
}
