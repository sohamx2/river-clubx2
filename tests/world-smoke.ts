/** Opt-in local multi-client regression. Never runs against a deployed table by default. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {PoolMatch} from '../lib/pool-match';
import type {PresenceSnapshot} from '../lib/presence-types';
const base=process.argv[2]||'http://127.0.0.1:3014';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw new Error('Use a local test server.');
const clients=Array.from({length:3},()=>({cookie:'',id:'',sessionId:randomUUID()}));
async function call(client:typeof clients[number],path:string,body?:object,origin=base){
 const response=await fetch(`${base}${path}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-river-client':'1',Origin:origin,Cookie:client.cookie},body:body?JSON.stringify(body):undefined});
 const cookie=response.headers.get('set-cookie');if(cookie)client.cookie=cookie.split(';')[0];return{status:response.status,data:await response.json()};
}
async function game(client:typeof clients[number],body?:object,code?:string){const r=await call(client,`/api/table${body?'':`?code=${code}`}`,body?{requestId:randomUUID(),...body}:undefined);assert.equal(r.status,200,JSON.stringify(r.data));client.id=r.data.room.me;return r.data.room;}
const room=await game(clients[0],{op:'create',name:'Pool host',roomName:'Shared world test',settings:{theme:'classic',maxPlayers:3,startingStack:2000,smallBlind:10,bigBlind:20,turnSeconds:0}});
for(const [index,c]of clients.slice(1).entries())await game(c,{op:'join',code:room.code,name:`Friend ${index+1}`});
const before=await game(clients[0],undefined,room.code);
for(const [index,c]of clients.entries()){
 const body={area:index===0?'table':'bar',x:-4+index,z:3-index,yaw:index*.4,seated:false,moving:true};
 const r=await call(c,'/api/presence',{code:room.code,write:{type:'pose',sessionId:c.sessionId,yaw:.1,pitch:0,body}});assert.equal(r.status,200);
}
const world=(await call(clients[1],`/api/presence?code=${room.code}`)).data as PresenceSnapshot;
assert.equal(world.players.length,3);assert.equal(world.players.find(p=>p.id===clients[0].id)?.body?.x,-4);assert.equal(world.players.find(p=>p.id===clients[2].id)?.body?.area,'bar');
const pool=(c:typeof clients[number],command?:object)=>call(c,command?'/api/pool':`/api/pool?code=${room.code}`,command?{code:room.code,command}:undefined);
for(const c of clients.slice(0,2))assert.equal((await pool(c,{type:'join'})).status,200);
assert.equal((await pool(clients[2],{type:'join'})).status,409);
let match=(await pool(clients[0])).data.match as PoolMatch;
assert.equal(match.players.length,2);assert.equal(match.turnId,clients[0].id);
assert.equal((await pool(clients[1],{type:'shoot',id:randomUUID(),version:match.version,dx:1,dz:0,power:.5})).status,409);
assert.equal((await pool({...clients[0],cookie:''})).status,401);
assert.equal((await call(clients[0],'/api/pool',{code:room.code,command:{type:'leave'}},'https://unrelated.example')).status,403);
assert.equal((await pool(clients[0],{type:'shoot',id:randomUUID(),version:match.version,dx:1,dz:0,power:NaN})).status,400);
const command={type:'shoot',id:randomUUID(),version:match.version,dx:1,dz:0,power:.55};
const shots=await Promise.all([pool(clients[0],command),pool(clients[0],{...command,id:randomUUID()})]);
assert.deepEqual(shots.map(r=>r.status).sort(),[200,409]);
match=(await pool(clients[1])).data.match;
assert.equal(match.game.shots,1);assert.equal(match.shot?.by,clients[0].id);
assert.deepEqual((await pool(clients[2])).data.match,match);
const accepted=shots.find(r=>r.status===200)!.data.match as PoolMatch;
assert.equal((await pool(clients[0],{...command,id:accepted.shot!.id})).status,200);
assert.equal((await pool(clients[0],{type:'rematch'})).status,409);
assert.equal((await pool(clients[0],{type:'heartbeat'})).status,200);
assert.equal((await pool(clients[0])).data.match.version,match.version);
await pool(clients[1],{type:'leave'});match=(await pool(clients[0])).data.match;assert.equal(match.winnerId,clients[0].id);
assert.equal((await pool(clients[2],{type:'join'})).status,200);match=(await pool(clients[2])).data.match;assert.equal(match.game.shots,0);assert.equal(match.winnerId,null);
const after=await game(clients[0],undefined,room.code);assert.equal(after.version,before.version);assert.deepEqual(after.players.map((p:{stack:number})=>p.stack),before.players.map((p:{stack:number})=>p.stack));
assert.ok(!JSON.stringify(match).includes('tokenHash'));
console.log('PASS: three independent sessions share body poses, pool seats, authoritative shots, turns and scores; concurrent shots/CSRF/unauthorized access rejected; poker chips and version unchanged.');
