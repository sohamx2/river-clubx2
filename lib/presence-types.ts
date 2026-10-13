export interface HeadPose { yaw:number; pitch:number }
export interface TablePresence extends HeadPose { id:string; sessionId:string; cameraSession:string|null; updatedAt:number }
export interface PeerMessage { callId:string; description?:{type:'offer'|'answer';sdp:string}; candidates?:RTCIceCandidateInit[] }
export interface TableSignal { id:string; from:string; to:string; data:PeerMessage; createdAt:number }
export interface PresenceSnapshot { players:TablePresence[]; signals:TableSignal[]; serverNow:number }
export type PresenceWrite = {type:'pose';sessionId:string;yaw:number;pitch:number} | {type:'camera';sessionId:string;cameraSession:string|null} | {type:'signal';id:string;to:string;data:PeerMessage};
export const PRESENCE_TTL=30000;
export const SIGNAL_TTL=90000;
