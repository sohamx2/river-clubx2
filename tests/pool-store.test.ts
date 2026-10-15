import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {poolMatch} from '../lib/pool-store';

test('shared pool storage serializes competing seats and shots without touching poker storage',async()=>{
 const folder=await mkdtemp(path.join(tmpdir(),'river-pool-test-')),cwd=process.cwd(),db=process.env.DATABASE_URL,local=process.env.ALLOW_LOCAL_STORE;
 delete process.env.DATABASE_URL;process.env.ALLOW_LOCAL_STORE='true';
 try{
  process.chdir(folder);const ids=[randomUUID(),randomUUID(),randomUUID()];
  const seats=await Promise.allSettled(ids.map(id=>poolMatch('ABC234',ids,id,{type:'join'})));
  assert.equal(seats.filter(s=>s.status==='fulfilled').length,2);assert.equal(seats.filter(s=>s.status==='rejected').length,1);
  const m=await poolMatch('ABC234',ids,ids[0]),me=m.turnId!;
  const results=await Promise.allSettled(Array.from({length:2},()=>poolMatch('ABC234',ids,me,{type:'shoot',id:randomUUID(),version:m.version,dx:1,dz:0,power:.5})));
  assert.equal(results.filter(s=>s.status==='fulfilled').length,1);
  const seen=await poolMatch('ABC234',ids,ids[2]);assert.equal(seen.game.shots,1);
  assert.deepEqual(seen,(await poolMatch('ABC234',ids,ids[1])));
 }finally{process.chdir(cwd);if(db===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=db;if(local===undefined)delete process.env.ALLOW_LOCAL_STORE;else process.env.ALLOW_LOCAL_STORE=local;await rm(folder,{recursive:true,force:true});}
});
