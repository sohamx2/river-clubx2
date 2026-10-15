import assert from 'node:assert/strict';
import test from 'node:test';
import {cuePullFromDrag,poolFirstPersonView} from '../lib/pool-controls';
import {resolveTableWalk} from '../lib/table-walk';
import {bodySchema} from '../lib/validation';

test('pool shots require pulling down; taps and upward drags have no power',()=>{
  assert.equal(cuePullFromDrag(200,200,800),0);
  assert.equal(cuePullFromDrag(200,100,800),0);
  assert.equal(cuePullFromDrag(200,300,800),.5);
  assert.equal(cuePullFromDrag(200,900,800),1);
});
test('the pool camera stays behind the cue along every shot direction at eye level',()=>{
  for(const aim of [{x:1,z:0},{x:0,z:1},{x:-1,z:0},{x:0,z:-1}]){
    const ball={x:-6,z:-3},view=poolFirstPersonView(ball,aim);
    assert.equal(view.eye.y,1.65);assert.ok(view.eye.y>1.05&&view.eye.y<2);
    assert.ok((view.eye.x-ball.x)*aim.x+(view.eye.z-ball.z)*aim.z<0);
    assert.ok((view.target.x-ball.x)*aim.x+(view.target.z-ball.z)*aim.z>0);
  }
});
test('walking cannot cut through the oval, including after a long frame',()=>{
  const position=resolveTableWalk({x:0,z:3.55},{x:0,z:-8});
  assert.ok(position.z>=2.85);
  const side=resolveTableWalk({x:5,z:0},{x:-10,z:0});
  assert.ok(side.x>=4.07);
});
test('the table can be circled during play and chairs remain solid',()=>{
  let p={x:0,z:3.55};p=resolveTableWalk(p,{x:5,z:0});p=resolveTableWalk(p,{x:0,z:-7});p=resolveTableWalk(p,{x:-5,z:0});
  assert.ok(Math.abs(p.x)<.001&&p.z< -3.4);
  const blocked=resolveTableWalk({x:5,z:0},{x:0,z:-4},1,[{minX:4.5,maxX:5.5,minZ:-2,maxZ:-1}]);
  assert.ok(blocked.z>=-.75);
});
test('the sad-face reaction is accepted by the server action schema',()=>{
  assert.ok(bodySchema.safeParse({op:'action',requestId:'00000000-0000-4000-8000-000000000001',code:'RIVER2',action:{type:'react',emoji:'😢'}}).success);
});
