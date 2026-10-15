import assert from 'node:assert/strict';
import test from 'node:test';
import {resolveHubMovement} from '../lib/hub-controls';

test('the lounge player stays inside the walls, including a large delta',()=>{
  const result=resolveHubMovement({x:8.7,z:8.7},{x:20,z:20},[]);
  assert.ok(result.x<=8.860001&&result.z<=8.860001);
});
test('the player cannot tunnel through the bar counter',()=>{
  const bar={minX:-2,maxX:2,minZ:-.75,maxZ:.75};
  const result=resolveHubMovement({x:0,z:2},{x:0,z:-5},[bar]);
  assert.equal(result.x,0);assert.ok(result.z>=1.04);
});
test('movement slides along furniture rather than stopping both axes',()=>{
  const counter={minX:0,maxX:5,minZ:0,maxZ:5};
  const result=resolveHubMovement({x:-.32,z:1},{x:1,z:2},[counter]);
  assert.ok(result.x<-.28);assert.ok(result.z>2.9);
});
test('walking around a furniture corner remains possible',()=>{
  const obstacle={minX:0,maxX:1,minZ:0,maxZ:1};
  const result=resolveHubMovement({x:-1,z:-1},{x:0,z:3},[obstacle]);
  assert.equal(result.x,-1);assert.ok(Math.abs(result.z-2)<.000001);
});
