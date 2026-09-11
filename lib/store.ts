import { neon } from '@neondatabase/serverless';
import { mkdir,readFile,writeFile,rename } from 'node:fs/promises';
import path from 'node:path';
import { GameError } from './engine';
import type { Room } from './types';
export const schema = [
 `CREATE TABLE IF NOT EXISTS river_rooms (code TEXT PRIMARY KEY, state JSONB NOT NULL, revision INTEGER NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
 `CREATE INDEX IF NOT EXISTS river_rooms_updated ON river_rooms(updated_at)`,
 `CREATE TABLE IF NOT EXISTS river_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at TIMESTAMPTZ NOT NULL)`,
 `CREATE INDEX IF NOT EXISTS river_limits_expiry ON river_limits(expires_at)`,
];
type Globals=typeof globalThis & {riverLocks?:Map<string,Promise<unknown>>;riverRates?:Map<string,{count:number;expires:number}>;riverSchema?:Promise<void>};
const g=globalThis as Globals;
export const localMode=()=>!process.env.DATABASE_URL;
function database(){if(process.env.DATABASE_URL)return neon(process.env.DATABASE_URL);if(process.env.VERCEL||process.env.NODE_ENV==='production'&&process.env.ALLOW_LOCAL_STORE!=='true')throw new GameError('The table server needs its database connection. Set DATABASE_URL in Vercel and redeploy.',503);return null;}
export async function ensureSchema(){const sql=database();if(!sql)return;g.riverSchema??=(async()=>{for(const statement of schema)await sql.query(statement);})();try{await g.riverSchema;}catch(e){g.riverSchema=undefined;throw e;}}
const folder=()=>path.join(process.cwd(),'.local-data');
function valid(code:string){if(!/^[A-Z2-9]{6}$/.test(code))throw new GameError('Enter a valid six-character room code.');}
async function lock<T>(key:string,fn:()=>Promise<T>):Promise<T>{g.riverLocks??=new Map();const previous=g.riverLocks.get(key)||Promise.resolve();const current=previous.catch(()=>{}).then(fn);g.riverLocks.set(key,current);try{return await current;}finally{if(g.riverLocks.get(key)===current)g.riverLocks.delete(key);}}
async function localRead(code:string){try{const record=JSON.parse(await readFile(path.join(folder(),code+'.json'),'utf8')) as {room:Room;updated:number};if(Date.now()-record.updated>7*86400000)return null;return record.room;}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}}
async function localWrite(room:Room){await mkdir(folder(),{recursive:true});const file=path.join(folder(),room.code+'.json');await writeFile(file+'.tmp',JSON.stringify({room,updated:Date.now()}),{mode:0o600});await rename(file+'.tmp',file);}
export async function insertRoom(room:Room):Promise<boolean>{
 valid(room.code);await ensureSchema();const sql=database();
 if(sql){const rows=await sql`INSERT INTO river_rooms (code,state) VALUES (${room.code},${JSON.stringify(room)}::jsonb) ON CONFLICT DO NOTHING RETURNING code`;return rows.length>0;}
 return lock(room.code,async()=>{if(await localRead(room.code))return false;await localWrite(room);return true;});
}
/** Optimistic compare-and-swap makes transitions atomic across Vercel instances. Callbacks must have no external side effects. */
export async function updateRoom(code:string,change:(room:Room)=>boolean):Promise<Room>{
 valid(code);await ensureSchema();const sql=database();
 if(!sql)return lock(code,async()=>{const room=await localRead(code);if(!room)throw new GameError('Room not found. Check your invite code.',404);if(change(room)){room.version++;await localWrite(room);}return room;});
 for(let attempt=0;attempt<12;attempt++){
  const rows=await sql`SELECT state,revision FROM river_rooms WHERE code=${code} AND updated_at > NOW() - INTERVAL '7 days'`;
  if(!rows.length)throw new GameError('Room not found or expired. Ask your friend for a new invite.',404);
  const room=rows[0].state as Room;const revision=Number(rows[0].revision);
  if(!change(room))return room;
  room.version=revision+1;
  const written=await sql`UPDATE river_rooms SET state=${JSON.stringify(room)}::jsonb, revision=${revision+1}, updated_at=NOW() WHERE code=${code} AND revision=${revision} RETURNING code`;
  if(written.length)return room;
 }
 throw new GameError('The table is busy. Please try again.',409);
}
export async function rateLimit(key:string,limit:number,windowMs:number){
 await ensureSchema();const sql=database();const bucket=`${key}:${Math.floor(Date.now()/windowMs)}`;
 if(sql){const rows=await sql`INSERT INTO river_limits (key,count,expires_at) VALUES (${bucket},1,${new Date(Date.now()+windowMs).toISOString()}::timestamptz) ON CONFLICT (key) DO UPDATE SET count=river_limits.count+1 RETURNING count`;if(Number(rows[0].count)>limit)throw new GameError('Too many requests. Please wait a moment.',429);}
 else{g.riverRates??=new Map();for(const[k,v]of g.riverRates)if(v.expires<Date.now())g.riverRates.delete(k);const entry=g.riverRates.get(bucket)||{count:0,expires:Date.now()+windowMs};entry.count++;g.riverRates.set(bucket,entry);if(entry.count>limit)throw new GameError('Too many requests. Please wait a moment.',429);}
}
export async function cleanup(){await ensureSchema();const sql=database();if(sql){await sql`DELETE FROM river_rooms WHERE updated_at < NOW() - INTERVAL '7 days'`;await sql`DELETE FROM river_limits WHERE expires_at < NOW()`;}}
