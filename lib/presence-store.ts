import { mkdir,readFile,writeFile,rename } from 'node:fs/promises';
import path from 'node:path';
import { database,ensureSchema,lock } from './store';
import { PRESENCE_TTL,SIGNAL_TTL,type PresenceSnapshot,type PresenceWrite,type TablePresence,type TableSignal } from './presence-types';

type RecordState={players:TablePresence[];signals:TableSignal[]};
function updatePlayer(previous:TablePresence|undefined,id:string,write:Exclude<PresenceWrite,{type:'signal'}>,now:number):TablePresence {
  const sameSession=previous?.sessionId===write.sessionId;
  const base=sameSession?previous!:{id,sessionId:write.sessionId,yaw:0,pitch:0,cameraSession:null,updatedAt:now};
  return {...base,...(write.type==='pose'?{yaw:write.yaw,pitch:write.pitch,face:write.face??null}:{cameraSession:write.cameraSession,...(write.face===null?{face:null}:{})}),updatedAt:now};
}
function snapshot(state:RecordState,ids:string[],me:string,now:number):PresenceSnapshot {
  return {players:state.players.filter(p=>ids.includes(p.id)&&now-p.updatedAt<PRESENCE_TTL),signals:state.signals.filter(s=>s.to===me&&ids.includes(s.from)&&now-s.createdAt<SIGNAL_TTL).slice(-150),serverNow:now};
}

/** Signalling is private to its intended recipient; no camera frames touch storage. */
export async function presence(code:string,ids:string[],me:string,write?:PresenceWrite):Promise<PresenceSnapshot> {
  await ensureSchema();const sql=database();const now=Date.now();
  if(sql) {
    if(write?.type==='signal') {
      await sql`INSERT INTO river_signals (id,code,sender,recipient,data) VALUES (${write.id},${code},${me},${write.to},${JSON.stringify(write.data)}::jsonb) ON CONFLICT DO NOTHING`;
    } else if(write?.type==='camera') {
      // An old tab's delayed pagehide must never turn off a newer tab's camera.
      await sql`UPDATE river_presence SET state=state || ${JSON.stringify({cameraSession:write.cameraSession,...(write.face===null?{face:null}:{}),updatedAt:now})}::jsonb, updated_at=NOW() WHERE code=${code} AND player_id=${me} AND state->>'sessionId'=${write.sessionId}`;
    } else if(write) {
      // One atomic merge per player; updates cannot overwrite another player's pose.
      const patch={yaw:write.yaw,pitch:write.pitch,face:write.face??null};
      const initial=updatePlayer(undefined,me,write,now);
      await sql`INSERT INTO river_presence (code,player_id,state) VALUES (${code},${me},${JSON.stringify(initial)}::jsonb) ON CONFLICT (code,player_id) DO UPDATE SET state=(CASE WHEN river_presence.state->>'sessionId'=${write.sessionId} THEN river_presence.state ELSE ${JSON.stringify(initial)}::jsonb END) || ${JSON.stringify({...patch,sessionId:write.sessionId,updatedAt:now})}::jsonb, updated_at=NOW()`;
    }
    const [players,signals]=await Promise.all([
      sql`SELECT state FROM river_presence WHERE code=${code} AND updated_at>NOW()-INTERVAL '30 seconds'`,
      sql`SELECT id,sender,recipient,data,EXTRACT(EPOCH FROM created_at)*1000 AS sent_at FROM river_signals WHERE code=${code} AND recipient=${me} AND created_at>NOW()-INTERVAL '90 seconds' ORDER BY created_at DESC LIMIT 150`,
    ]);
    return snapshot({players:players.map(p=>p.state as TablePresence),signals:signals.reverse().map(s=>({id:s.id as string,from:s.sender as string,to:s.recipient as string,data:s.data as TableSignal['data'],createdAt:Number(s.sent_at)}))},ids,me,now);
  }
  return lock(`presence:${code}`,async()=>{
    const folder=path.join(process.cwd(),'.local-data','presence'),file=path.join(folder,`${code}.json`);
    let state:RecordState={players:[],signals:[]};
    try{state=JSON.parse(await readFile(file,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
    state.players=state.players.filter(p=>ids.includes(p.id)&&now-p.updatedAt<PRESENCE_TTL);
    state.signals=state.signals.filter(s=>ids.includes(s.from)&&ids.includes(s.to)&&now-s.createdAt<SIGNAL_TTL);
    if(write?.type==='signal') {
      if(!state.signals.some(s=>s.id===write.id))state.signals.push({id:write.id,from:me,to:write.to,data:write.data,createdAt:now});
    } else if(write) {
      const previous=state.players.find(p=>p.id===me);
      if(write.type==='pose'||previous?.sessionId===write.sessionId) {
        state.players=state.players.filter(p=>p.id!==me);
        state.players.push(updatePlayer(previous,me,write,now));
      }
    }
    if(write){await mkdir(folder,{recursive:true});await writeFile(`${file}.tmp`,JSON.stringify(state),{mode:0o600});await rename(`${file}.tmp`,file);}
    return snapshot(state,ids,me,now);
  });
}
