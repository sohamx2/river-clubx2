import { NextRequest,NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { authenticate,GameError } from '@/lib/engine';
import { updateRoom,rateLimit } from '@/lib/store';
import { presence } from '@/lib/presence-store';
import {FACE_FIELDS} from '@/lib/face-pose';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const description=z.object({type:z.enum(['offer','answer']),sdp:z.string().min(1).max(16000)});
const candidate=z.object({candidate:z.string().max(2000).optional(),sdpMid:z.string().max(80).nullable().optional(),sdpMLineIndex:z.number().int().min(0).max(20).nullable().optional(),usernameFragment:z.string().max(256).nullable().optional()});
const faceSchema=z.object(Object.fromEntries(FACE_FIELDS.map(key=>[key,z.number().min(0).max(1)])) as Record<typeof FACE_FIELDS[number],z.ZodNumber>);
const bodyPose=z.object({area:z.enum(['table','bar']),x:z.number().min(-15).max(15),z:z.number().min(-15).max(15),yaw:z.number().min(-Math.PI*4).max(Math.PI*4),seated:z.boolean(),moving:z.boolean()});
const writeSchema=z.discriminatedUnion('type',[
  z.object({type:z.literal('pose'),sessionId:z.uuid(),yaw:z.number().min(-1).max(1),pitch:z.number().min(-1).max(1),face:faceSchema.nullable().optional(),body:bodyPose.optional()}),
  z.object({type:z.literal('camera'),sessionId:z.uuid(),cameraSession:z.uuid().nullable(),face:z.null().optional()}),
  z.object({type:z.literal('signal'),id:z.uuid(),to:z.uuid(),data:z.object({callId:z.string().min(1).max(240),description:description.optional(),candidates:z.array(candidate).max(30).optional()}).refine(d=>!!d.description||!!d.candidates?.length)}),
]);
const bodySchema=z.object({code:z.string().regex(/^[A-Z2-9]{6}$/),write:writeSchema});
const headers={'Cache-Control':'private, no-store, max-age=0','Vary':'Cookie'};
function failure(error:unknown) {
  if(error instanceof GameError)return NextResponse.json({error:error.message},{status:error.status,headers});
  console.error('Presence request failed:',error instanceof Error?error.name:'Unknown');
  return NextResponse.json({error:'Head movement and camera sharing are reconnecting. Poker is still available.'},{status:503,headers});
}
async function identity(req:NextRequest,code:string) {
  const token=req.cookies.get('river_session')?.value;if(!token)throw new GameError('Join this room first.',401);
  const hash=createHash('sha256').update(token).digest('hex');
  const room=await updateRoom(code,r=>{authenticate(r,hash);return false;});
  return {room,me:authenticate(room,hash).id};
}
export async function GET(req:NextRequest) {
  try{const code=req.nextUrl.searchParams.get('code')||'';const {room,me}=await identity(req,code);return NextResponse.json(await presence(code,room.players.map(p=>p.id),me),{headers});}catch(e){return failure(e);}
}
export async function POST(req:NextRequest) {
  try {
    const origin=req.headers.get('origin');
    if(req.headers.get('x-river-client')!=='1'||origin&&(!URL.canParse(origin)||new URL(origin).host!==req.headers.get('host')||!['http:','https:'].includes(new URL(origin).protocol)))throw new GameError('This request must come from the poker table.',403);
    if(Number(req.headers.get('content-length')||0)>24000)throw new GameError('Request too large.',413);
    const raw=await req.text();if(raw.length>24000)throw new GameError('Request too large.',413);
    let input:unknown;try{input=JSON.parse(raw);}catch{throw new GameError('Invalid presence request.');}
    const parsed=bodySchema.safeParse(input);if(!parsed.success)throw new GameError('Invalid head movement or camera signal.');
    const {code,write}=parsed.data;const {room,me}=await identity(req,code);
    if(write.type==='signal'&&(write.to===me||!room.players.some(p=>p.id===write.to)))throw new GameError('That player is not at this table.');
    // Separate limits and storage keep mouse traffic away from poker action locks.
    await rateLimit(`presence:${me}`,180,60000);
    return NextResponse.json(await presence(code,room.players.map(p=>p.id),me,write),{headers});
  }catch(e){return failure(e);}
}
