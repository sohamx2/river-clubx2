/** Run against the local server: npx tsx tests/api-smoke.ts http://127.0.0.1:3001 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { RoomView } from '../lib/types';
const base=process.argv[2]||'http://127.0.0.1:3001';
type Client={cookie:string;id?:string};
const clients:Client[]=Array.from({length:10},()=>({cookie:''}));
async function request(client:Client,body?:object,code?:string){const res=await fetch(body?base+'/api/table':base+'/api/table?code='+code,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-river-client':'1',Origin:base,...(client.cookie?{Cookie:client.cookie}:{})},body:body?JSON.stringify(body):undefined});const cookie=res.headers.get('set-cookie');if(cookie)client.cookie=cookie.split(';')[0];const data=await res.json();return{res,data};}
async function post(client:Client,body:object){const {res,data}=await request(client,{requestId:randomUUID(),...body});assert.equal(res.status,200,JSON.stringify(data));if(data.room)client.id=data.room.me;return data.room as RoomView;}
const suffix=randomUUID().slice(0,6);
let r=await post(clients[0],{op:'create',name:'Host '+suffix,roomName:'API verification',settings:{theme:'classic',maxPlayers:10,startingStack:2000,smallBlind:10,bigBlind:20,turnSeconds:90}});
const code=r.code;
await Promise.all(clients.slice(1).map((c,i)=>post(c,{op:'join',code,name:`Friend ${i+1}`})));
r=(await request(clients[0],undefined,code)).data.room;
assert.equal(r.players.length,10);assert.equal(new Set(r.players.map(p=>p.seat)).size,10);
assert.equal((await request({cookie:''},undefined,code)).res.status,401);
assert.equal((await request(clients[1],{op:'action',requestId:randomUUID(),code,action:{type:'start'}})).res.status,400);
r=await post(clients[0],{op:'action',code,action:{type:'start'}});
const snapshots=await Promise.all(clients.map(c=>request(c,undefined,code)));
for(const {data} of snapshots){const room=data.room as RoomView;assert.equal(room.players.filter(p=>p.hole[0]!=='?').length,1);assert.ok(!('deck' in room));assert.ok(!JSON.stringify(room).includes('tokenHash'));assert.ok(!JSON.stringify(room).includes('receipts'));}
let client=clients.find(c=>c.id===r.turnId)!;const requestId=randomUUID();
const simultaneous={op:'action',requestId,code,action:{type:'act',move:'call',expectedAction:r.actionNo}};
const dup=await Promise.all([request(client,simultaneous),request(client,simultaneous)]);
assert.ok(dup.every(d=>d.res.status===200));assert.equal(dup[0].data.room.actionNo,dup[1].data.room.actionNo);
r=dup[0].data.room;
let steps=0;while(r.phase!=='showdown'&&steps++<100){client=clients.find(c=>c.id===r.turnId)!;const p=r.players.find(p=>p.id===r.turnId)!;r=await post(client,{op:'action',code,action:{type:'act',move:r.currentBet>p.bet?'call':'check',expectedAction:r.actionNo}});}
assert.equal(r.phase,'showdown');assert.equal(r.players.reduce((s,p)=>s+p.stack,0),20000);
r=await post(clients[0],{op:'action',code,action:{type:'propose',kind:'bomb',amount:50}});
const voteId=r.vote!.id;
await Promise.all(clients.slice(1,-1).map(c=>post(c,{op:'action',code,action:{type:'vote',voteId,yes:true}})));
r=await post(clients[0],{op:'action',code,action:{type:'start'}});
assert.equal(r.phase,'flop');assert.equal(r.board.length,3);assert.equal(r.pot,500);assert.ok(r.players.every(p=>p.contributed===50));
const badOrigin=await fetch(base+'/api/table',{method:'POST',headers:{'Content-Type':'application/json','x-river-client':'1',Origin:'https://untrusted.example'},body:'{}'});assert.equal(badOrigin.status,403);
const noHeader=await fetch(base+'/api/table',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(noHeader.status,403);
const html=await fetch(base+'/');assert.equal(html.status,200);assert.ok((await html.text()).includes('Poker with'));
console.log('PASS: 10 independent sessions; concurrent joins and votes; duplicate-action protection; hidden-card isolation; full hand; chip conservation; bomb pot; CSRF checks; homepage.');
console.log('Test room:',code);
