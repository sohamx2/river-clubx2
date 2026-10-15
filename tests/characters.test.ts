import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRoom,view } from '../lib/engine';
import { characterExpression } from '../lib/table-characters';

const now=Date.now();
const room=()=>view(createRoom('FACE23','Expressions','Alex','hash',{theme:'classic',maxPlayers:6,startingStack:2000,smallBlind:10,bigBlind:20,turnSeconds:60},now),'hash',true);
test('public actions choose expressions; active reactions override thinking and expire',()=>{
  const r=room(),p=r.players[0];r.phase='flop';r.turnId=p.id;
  assert.equal(characterExpression(p,r,now),'thinking');
  for(const [emoji,expression] of [['👍','approve'],['🔥','fire'],['😂','laugh'],['😮','surprised'],['💀','skull'],['❤️','love'],['😢','sad']] as const){p.reaction={id:'reaction',emoji,sentAt:now,expiresAt:now+6000};assert.equal(characterExpression(p,r,now),expression);}
  assert.equal(characterExpression(p,r,now+6000),'thinking');
  p.reaction=undefined;r.turnId=null;r.stripDiscard={street:'flop',pending:[p.id]};assert.equal(characterExpression(p,r,now),'thinking');r.stripDiscard=null;
  for(const [action,expression] of [['Raise to 100','raise'],['Call 20','call'],['Check','check']] as const){p.lastAction=action;assert.equal(characterExpression(p,r,now),expression);}
  p.allIn=true;assert.equal(characterExpression(p,r,now),'all-in');
  p.folded=true;assert.equal(characterExpression(p,r,now),'fold');
  p.sittingOut=true;assert.equal(characterExpression(p,r,now),'away');
});
test('camera characters never infer an expression from private cards',()=>{
  const r=room(),p=r.players[0];p.lastAction='Ready';
  for(const hole of [['As','Ah'],['7s','2h'],['?','?']]){p.hole=hole;assert.equal(characterExpression(p,r,now),'neutral');}
  r.phase='showdown';r.result={text:'Alex wins',winners:[p.id],payouts:[],board:[],revealed:[p.id]};
  assert.equal(characterExpression(p,r,now),'winner');
});
