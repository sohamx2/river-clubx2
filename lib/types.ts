export type Theme = 'classic' | 'dark' | 'astral' | 'metalluxe';
export type Phase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'ocean' | 'showdown';
export interface Settings { theme:Theme; maxPlayers:number; startingStack:number; smallBlind:number; bigBlind:number; turnSeconds:0|30|60|90 }
export interface Player { id:string; tokenHash:string; name:string; seat:number; stack:number; bet:number; contributed:number; hole:string[]; inHand:boolean; folded:boolean; allIn:boolean; sittingOut:boolean; actedBet:number|null; lastAction:string; lastSeen:number }
export interface Vote { id:string; kind:'bomb'|'bounty'|'sevenDeuce'|'ocean'; amount:number; voters:string[]; yes:string[]; expiresAt:number }
export interface Bounty { amount:number; players:string[]; won:string[]; reserve:number }
export interface SevenDeuce { amount:number; players:string[]; reserve:number; reserves:Record<string,number> }
export interface Result { text:string; winners:string[]; payouts:{id:string;amount:number;hand:string}[]; board:string[]; revealed:string[] }
export interface Room { code:string; name:string; hostId:string; settings:Settings; players:Player[]; version:number; handNo:number; actionNo:number; dealerSeat:number; phase:Phase; deck:string[]; board:string[]; currentBet:number; minRaise:number; turnId:string|null; deadline:number|null; vote:Vote|null; bombNext:{amount:number;players:string[]}|null; oceanNext:{players:string[]}|null; isBomb:boolean; isOcean:boolean; bounty:Bounty|null; sevenDeuce:SevenDeuce|null; result:Result|null; logs:{id:string;text:string}[]; receipts:string[]; createdAt:number }
export type PublicPlayer = Omit<Player,'tokenHash'|'actedBet'>;
export interface RoomView extends Omit<Room,'players'|'deck'|'receipts'> { players:PublicPlayer[]; me:string; pot:number; legal:{call:number;minRaiseTo:number;maxRaiseTo:number;canRaise:boolean}|null; localMode:boolean }
export type Action = {type:'start'} | {type:'act';move:'fold'|'check'|'call'|'raise';amount?:number;expectedAction:number} | {type:'propose';kind:'bomb'|'bounty'|'sevenDeuce'|'ocean';amount:number} | {type:'vote';voteId:string;yes:boolean} | {type:'theme';theme:Theme} | {type:'sit';out:boolean} | {type:'rebuy'} | {type:'leave'} | {type:'cancelBounty'};
