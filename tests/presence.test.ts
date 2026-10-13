import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { presence } from '../lib/presence-store';

test('presence preserves the active camera across stale tab writes and keeps signals private',async()=>{
  const folder=await mkdtemp(path.join(tmpdir(),'river-presence-test-'));
  const cwd=process.cwd(),databaseUrl=process.env.DATABASE_URL,localStore=process.env.ALLOW_LOCAL_STORE;
  delete process.env.DATABASE_URL;process.env.ALLOW_LOCAL_STORE='true';
  try {
    process.chdir(folder);
    const first=randomUUID(),second=randomUUID(),ids=[first,second];
    const oldSession=randomUUID(),activeSession=randomUUID(),cameraSession=randomUUID();
    await presence('ABC234',ids,first,{type:'pose',sessionId:oldSession,yaw:.1,pitch:.2});
    await presence('ABC234',ids,first,{type:'camera',sessionId:oldSession,cameraSession:randomUUID()});
    await presence('ABC234',ids,first,{type:'pose',sessionId:activeSession,yaw:.6,pitch:-.4});
    await presence('ABC234',ids,first,{type:'camera',sessionId:activeSession,cameraSession});
    for(const camera of [null,randomUUID()])await presence('ABC234',ids,first,{type:'camera',sessionId:oldSession,cameraSession:camera});
    const reloaded=(await presence('ABC234',ids,second)).players.find(p=>p.id===first);
    assert.equal(reloaded?.sessionId,activeSession);
    assert.equal(reloaded?.cameraSession,cameraSession);
    assert.equal(reloaded?.yaw,.6);

    await presence('ABC234',ids,first,{type:'pose',sessionId:activeSession,yaw:-.3,pitch:.1});
    assert.equal((await presence('ABC234',ids,first)).players.find(p=>p.id===first)?.cameraSession,cameraSession);
    const signal={type:'signal' as const,id:randomUUID(),to:second,data:{callId:'test',description:{type:'offer' as const,sdp:'mock SDP'}}};
    await presence('ABC234',ids,first,signal);await presence('ABC234',ids,first,signal);
    assert.equal((await presence('ABC234',ids,second)).signals.length,1);
    assert.equal((await presence('ABC234',ids,first)).signals.length,0);
    await presence('ABC234',ids,first,{type:'camera',sessionId:activeSession,cameraSession:null});
    assert.equal((await presence('ABC234',ids,second)).players.find(p=>p.id===first)?.cameraSession,null);
  } finally {
    process.chdir(cwd);
    if(databaseUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=databaseUrl;
    if(localStore===undefined)delete process.env.ALLOW_LOCAL_STORE;else process.env.ALLOW_LOCAL_STORE=localStore;
    await rm(folder,{recursive:true,force:true});
  }
});
