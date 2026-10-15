import {NextRequest,NextResponse} from 'next/server';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {authenticate,GameError} from '@/lib/engine';
import {updateRoom,rateLimit} from '@/lib/store';
import {poolMatch} from '@/lib/pool-store';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store, max-age=0','Vary':'Cookie'};
const codeSchema=z.string().regex(/^[A-Z2-9]{6}$/);
const commandSchema=z.discriminatedUnion('type',[
  z.object({type:z.enum(['join','leave','heartbeat','rematch'])}),
  z.object({type:z.literal('shoot'),id:z.uuid(),version:z.number().int().min(0),dx:z.number().min(-1).max(1),dz:z.number().min(-1).max(1),power:z.number().min(.04).max(1)}),
]);
async function identity(req:NextRequest,code:string){
  const token=req.cookies.get('river_session')?.value;if(!token)throw new GameError('Join this room first.',401);
  const hash=createHash('sha256').update(token).digest('hex');
  const room=await updateRoom(code,r=>{authenticate(r,hash);return false;});
  return {ids:room.players.map(p=>p.id),me:authenticate(room,hash).id};
}
function failure(e:unknown){if(e instanceof GameError)return NextResponse.json({error:e.message},{status:e.status,headers});console.error('Pool request failed:',e instanceof Error?e.name:'Unknown');return NextResponse.json({error:'The shared pool table is reconnecting. Poker is still available.'},{status:503,headers});}
export async function GET(req:NextRequest){try{const parsed=codeSchema.safeParse(req.nextUrl.searchParams.get('code'));if(!parsed.success)throw new GameError('Invalid room code.');const {ids,me}=await identity(req,parsed.data);return NextResponse.json({match:await poolMatch(parsed.data,ids,me),serverNow:Date.now()},{headers});}catch(e){return failure(e);}}
export async function POST(req:NextRequest){try{
  const origin=req.headers.get('origin');
  if(req.headers.get('x-river-client')!=='1'||origin&&(!URL.canParse(origin)||new URL(origin).host!==req.headers.get('host')||!['http:','https:'].includes(new URL(origin).protocol)))throw new GameError('This request must come from the table.',403);
  if(Number(req.headers.get('content-length')||0)>2048)throw new GameError('Request too large.',413);
  const raw=await req.text();if(raw.length>2048)throw new GameError('Request too large.',413);
  let body:unknown;try{body=JSON.parse(raw);}catch{throw new GameError('Invalid pool request.');}
  const parsed=z.object({code:codeSchema,command:commandSchema}).safeParse(body);if(!parsed.success)throw new GameError('Invalid pool action.');
  const {code,command}=parsed.data,{ids,me}=await identity(req,code);await rateLimit(`pool:${me}`,60,60000);
  return NextResponse.json({match:await poolMatch(code,ids,me,command),serverNow:Date.now()},{headers});
}catch(e){return failure(e);}}
