import type { PublicPlayer, RoomView } from './types';

export type CharacterExpression = 'neutral' | 'thinking' | 'fold' | 'check' | 'call' | 'raise' | 'all-in' | 'winner' | 'away' | 'approve' | 'fire' | 'laugh' | 'surprised' | 'skull' | 'love';

export const EXPRESSION_LABELS:Record<CharacterExpression,string> = {
  neutral:'watching the table', thinking:'looking puzzled', fold:'looking disappointed',
  check:'looking relaxed', call:'looking focused', raise:'looking confident',
  'all-in':'looking determined', winner:'celebrating', away:'resting', approve:'smiling',
  fire:'fired up', laugh:'laughing', surprised:'looking surprised', skull:'making a skull face', love:'showing heart eyes',
};

/** Expressions use public actions only, never a player's hidden cards. */
export function characterExpression(player:PublicPlayer, room:Pick<RoomView,'phase'|'turnId'|'result'>&Partial<Pick<RoomView,'stripDiscard'>>, now:number):CharacterExpression {
  if(player.reaction && player.reaction.expiresAt>now) {
    return ({'👍':'approve','🔥':'fire','😂':'laugh','😮':'surprised','💀':'skull','❤️':'love'} as const)[player.reaction.emoji];
  }
  if(room.phase==='showdown' && room.result?.winners.includes(player.id)) return 'winner';
  if(room.turnId===player.id||room.stripDiscard?.pending.includes(player.id)) return 'thinking';
  if(player.sittingOut || now-player.lastSeen>30000) return 'away';
  if(player.folded) return 'fold';
  if(player.allIn) return 'all-in';
  if(/^Raise/.test(player.lastAction)) return 'raise';
  if(/^Call/.test(player.lastAction)) return 'call';
  if(player.lastAction==='Check') return 'check';
  return 'neutral';
}

