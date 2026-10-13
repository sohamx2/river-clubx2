/** Run against an explicitly enabled local server; never touches deployed rooms. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { PresenceWrite,PresenceSnapshot } from '../lib/presence-types';
const base=process.argv[2]||'http://127.0.0.1:3005';
const clients=Array.from({length:3},()=>({cookie:'',id:'',sessionId:randomUUID()}));
async function game(client:typeof clients[number],body?:object,code?:string) {
  const response=await fetch(`${base}/api/table${body?'':`?code=${code}`}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-river-client':'1',Origin:base,Cookie:client.cookie},body:body?JSON.stringify({requestId:randomUUID(),...body}):undefined});
  const cookie=response.headers.get('set-cookie');if(cookie)client.cookie=cookie.split(';')[0];
  const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));client.id=data.room.me;return data.room;
}
async function request(client:typeof clients[number],code:string,write?:PresenceWrite,origin=base) {
  const response=await fetch(`${base}/api/presence${write?'':`?code=${code}`}`,{method:write?'POST':'GET',headers:{'Content-Type':'application/json','x-river-client':'1',Origin:origin,Cookie:client.cookie},body:write?JSON.stringify({code,write}):undefined});
  return {status:response.status,data:await response.json() as PresenceSnapshot};
}
const r=await game(clients[0],{op:'create',name:'Presence host',roomName:'Presence verification',settings:{theme:'classic',maxPlayers:3,startingStack:2000,smallBlind:10,bigBlind:20,turnSeconds:0}});
await game(clients[1],{op:'join',code:r.code,name:'Friend one'});await game(clients[2],{op:'join',code:r.code,name:'Friend two'});
const before=await game(clients[0],undefined,r.code);
for(const c of clients)assert.equal((await request(c,r.code,{type:'pose',sessionId:c.sessionId,yaw:.7,pitch:-.4})).status,200);
const cameraSession=randomUUID();
await request(clients[0],r.code,{type:'camera',sessionId:clients[0].sessionId,cameraSession});
const pose=await request(clients[0],r.code,{type:'pose',sessionId:clients[0].sessionId,yaw:-.8,pitch:.2});
assert.equal(pose.data.players.find(p=>p.id===clients[0].id)?.cameraSession,cameraSession);
const seen=await request(clients[1],r.code);assert.equal(seen.data.players.find(p=>p.id===clients[0].id)?.yaw,-.8);
assert.ok(!JSON.stringify(seen.data).includes('tokenHash'));
const signal={type:'signal' as const,id:randomUUID(),to:clients[1].id,data:{callId:'test-call',description:{type:'offer' as const,sdp:'mock SDP'}}};
await request(clients[0],r.code,signal);await request(clients[0],r.code,signal);
assert.equal((await request(clients[1],r.code)).data.signals.length,1);
assert.equal((await request(clients[2],r.code)).data.signals.length,0);
assert.equal((await request(clients[0],r.code)).data.signals.length,0);
assert.equal((await request(clients[0],r.code,{...signal,id:randomUUID(),to:randomUUID()})).status,400);
assert.equal((await request(clients[0],r.code,{type:'pose',sessionId:clients[0].sessionId,yaw:2,pitch:0})).status,400);
assert.equal((await request({...clients[0],cookie:''},r.code)).status,401);
assert.equal((await request(clients[0],r.code,{type:'pose',sessionId:clients[0].sessionId,yaw:0,pitch:0},'https://unrelated.example')).status,403);
await request(clients[0],r.code,{type:'camera',sessionId:clients[0].sessionId,cameraSession:null});
assert.equal((await request(clients[1],r.code)).data.players.find(p=>p.id===clients[0].id)?.cameraSession,null);
// A previous page's unload request may arrive after a reload has enabled its camera.
const previousSession=clients[0].sessionId;clients[0].sessionId=randomUUID();
await request(clients[0],r.code,{type:'pose',sessionId:clients[0].sessionId,yaw:.3,pitch:.1});
const nextCamera=randomUUID();await request(clients[0],r.code,{type:'camera',sessionId:clients[0].sessionId,cameraSession:nextCamera});
await request(clients[0],r.code,{type:'camera',sessionId:previousSession,cameraSession:null});
await request(clients[0],r.code,{type:'camera',sessionId:previousSession,cameraSession:randomUUID()});
const reloaded=(await request(clients[1],r.code)).data.players.find(p=>p.id===clients[0].id);
assert.equal(reloaded?.sessionId,clients[0].sessionId);assert.equal(reloaded?.cameraSession,nextCamera);
assert.equal(reloaded?.yaw,.3);
await request(clients[0],r.code,{type:'camera',sessionId:clients[0].sessionId,cameraSession:null});
const after=await game(clients[0],undefined,r.code);assert.equal(after.version,before.version);assert.equal(after.actionNo,before.actionNo);assert.equal(after.players.reduce((n:number,p:{stack:number})=>n+p.stack,0),6000);
console.log('Presence verified: shared poses, opt-in camera state, stale-session camera protection, private idempotent signals, validation, authentication, CSRF, and unchanged poker state.');
