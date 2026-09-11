import { NextRequest,NextResponse } from 'next/server';
import { createHash,randomBytes } from 'node:crypto';
import { act,authenticate,createRoom,GameError,joinRoom,tick,view } from '@/lib/engine';
import { cleanup,insertRoom,localMode,rateLimit,updateRoom } from '@/lib/store';
import { bodySchema } from '@/lib/validation';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=30;
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const headers={'Cache-Control':'private, no-store, max-age=0','Vary':'Cookie'};
function session(req:NextRequest){const old=req.cookies.get('river_session')?.value;return old&&/^[a-f0-9]{64}$/.test(old)?old:randomBytes(32).toString('hex');}
function response(req:NextRequest,data:unknown,token?:string,status=200){const res=NextResponse.json(data,{status,headers});if(token)res.cookies.set('river_session',token,{httpOnly:true,secure:req.nextUrl.protocol==='https:',sameSite:'lax',path:'/',maxAge:2592000});return res;}
function error(req:NextRequest,e:unknown){if(e instanceof GameError)return response(req,{error:e.message},undefined,e.status);console.error('Table request failed:',e instanceof Error?e.name:'Unknown');return response(req,{error:'The table server is unavailable. Check your connection and try again.'},undefined,503);}
export async function GET(req:NextRequest){try{
 const code=req.nextUrl.searchParams.get('code')||'';const token=req.cookies.get('river_session')?.value;
 if(!token)throw new GameError('Enter your name to join this room.',401);
 const identity=hash(token);const room=await updateRoom(code,r=>{const p=authenticate(r,identity);let changed=false;const now=Date.now();if(now-p.lastSeen>15000){p.lastSeen=now;changed=true;}return tick(r,now)||changed;});
 return response(req,{room:view(room,identity,localMode()),serverNow:Date.now()});
 }catch(e){return error(req,e);}}
export async function POST(req:NextRequest){try{
 const origin=req.headers.get('origin');
 // NextURL normalizes loopback addresses; use the actual request Host for CSRF.
 const sameOrigin=!origin||(URL.canParse(origin)&&['http:','https:'].includes(new URL(origin).protocol)&&new URL(origin).host===req.headers.get('host'));
 if(req.headers.get('x-river-client')!=='1'||!sameOrigin)throw new GameError('This request must come from the poker table.',403);
 if(Number(req.headers.get('content-length')||0)>8192)throw new GameError('Request too large.',413);
 const raw=await req.text();if(raw.length>8192)throw new GameError('Request too large.',413);
 let data:unknown;try{data=JSON.parse(raw);}catch{throw new GameError('Invalid request.');}
 const parsed=bodySchema.safeParse(data);if(!parsed.success)throw new GameError(parsed.error.issues[0]?.message||'Invalid request.');
 const body=parsed.data;const token=session(req);const identity=hash(token);
 const ip=hash(req.headers.get('x-vercel-forwarded-for')||req.headers.get('x-forwarded-for')?.split(',')[0]||'local');
 if(body.op==='create'){
  await rateLimit(`create:${ip}`,15,3600000);
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';const bytes=createHash('sha256').update(identity+body.requestId).digest();const code=Array.from(bytes.subarray(0,6),b=>alphabet[b%alphabet.length]).join('');
  let room=createRoom(code,body.roomName,body.name,identity,body.settings);
  if(!await insertRoom(room))room=await updateRoom(code,r=>{authenticate(r,identity);return false;});
  await cleanup();return response(req,{room:view(room,identity,localMode()),serverNow:Date.now()},token);
 }
 if(body.op==='join'){
  await rateLimit(`join:${ip}`,60,600000);
  const room=await updateRoom(body.code,r=>{if(r.receipts.includes(body.requestId)){authenticate(r,identity);return false;}tick(r);joinRoom(r,body.name,identity);r.receipts.push(body.requestId);r.receipts=r.receipts.slice(-100);return true;});
  return response(req,{room:view(room,identity,localMode()),serverNow:Date.now()},token);
 }
 // Valid sessions are authenticated before writes. CSRF headers, schema validation,
 // action counters and request receipts protect every state-changing action.
 const room=await updateRoom(body.code,r=>{
  authenticate(r,identity);if(r.receipts.includes(body.requestId))return false;
  tick(r);act(r,identity,body.action);r.receipts.push(body.requestId);r.receipts=r.receipts.slice(-100);return true;
 });
 if(body.action.type==='leave')return response(req,{left:true},token);
 return response(req,{room:view(room,identity,localMode()),serverNow:Date.now()},token);
 }catch(e){return error(req,e);}}
