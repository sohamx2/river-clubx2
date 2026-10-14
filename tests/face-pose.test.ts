import test from 'node:test';
import assert from 'node:assert/strict';
import {NEUTRAL_FACE,faceFromBlendshapes,faceDrawingValues,parseFacePose,smoothFace,faceChanged} from '../lib/face-pose';
import {parseAvatarPose} from '../lib/avatar-pose';
import config from '../next.config.mjs';

test('face mapping preserves asymmetric movements and the subject’s left/right orientation',()=>{
  const pose=faceFromBlendshapes([{categoryName:'eyeBlinkLeft',score:1},{categoryName:'mouthSmileRight',score:.8},{categoryName:'jawOpen',score:.4}]);
  assert.equal(pose.blinkLeft,1);assert.equal(pose.blinkRight,0);assert.equal(pose.jawOpen,.4);
  const drawing=faceDrawingValues(pose);assert.equal(drawing.eyeRight,1);assert.equal(drawing.eyeLeft,0);assert.equal(drawing.mouthLeft,.8);assert.equal(drawing.mouthRight,0);
  assert.deepEqual(faceFromBlendshapes([]),NEUTRAL_FACE);
});
test('peer messages reject unbounded or malformed faces and remain compatible with old head packets',()=>{
  assert.deepEqual(parseAvatarPose({yaw:.5,pitch:-.4}),{yaw:.5,pitch:-.4,face:null});
  assert.equal(parseAvatarPose({yaw:2,pitch:0}),null);assert.equal(parseAvatarPose({yaw:0,pitch:NaN}),null);
  for(const face of [{},'face',{...NEUTRAL_FACE,jawOpen:4},{...NEUTRAL_FACE,blinkLeft:NaN}])assert.equal(parseAvatarPose({yaw:0,pitch:0,face}),null);
  assert.deepEqual(parseFacePose({...NEUTRAL_FACE,smileLeft:.333,privateImage:'never forwarded'}),{...NEUTRAL_FACE,smileLeft:.33});
  const parsed=parseAvatarPose({yaw:0,pitch:0,face:NEUTRAL_FACE,frame:'discarded',identity:'discarded'});assert.deepEqual(Object.keys(parsed!).sort(),['face','pitch','yaw']);
  assert.ok(JSON.stringify({...parsed,sequence:100}).length<768);
});
test('blink smoothing responds quickly; enabling and stopping tracking count as changes',()=>{
  const next=smoothFace(NEUTRAL_FACE,{...NEUTRAL_FACE,blinkLeft:1,smileRight:1});
  assert.ok(next.blinkLeft>=.8);assert.ok(next.smileRight>0&&next.smileRight<1);
  assert.equal(faceChanged(null,NEUTRAL_FACE),true);assert.equal(faceChanged(NEUTRAL_FACE,null),true);
  assert.equal(faceChanged(NEUTRAL_FACE,{...NEUTRAL_FACE}),false);assert.equal(faceChanged(NEUTRAL_FACE,next),true);
});
test('camera is available only to the site while microphone access stays disabled',async()=>{
  const headers=await config.headers();const policy=headers[0].headers.find(h=>h.key==='Permissions-Policy')!.value;
  assert.ok(policy.includes('camera=(self)'));assert.ok(policy.includes('microphone=()'));
});
