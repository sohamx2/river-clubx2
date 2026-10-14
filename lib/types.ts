import type { ReactionEmoji } from './reactions';
export type Theme = 'classic' | 'dark' | 'astral' | 'metalluxe' | 'cyberpunk';
export type Phase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'ocean' | 'showdown';
export type VoteKind = 'bomb'|'bounty'|'sevenDeuce'|'ocean'|'dieRiver'|'pocketTrips'|'doubleBarrel'|'stripClub'|'redRiver'|'potOrNot';
export interface Settings { theme:Theme; maxPlayers:number; startingStack:number; smallBlind:number; bigBlind:number; turnSeconds:0|30|60|90 }
export interface Player { id:string; tokenHash:string; name:string; seat:number; stack:number; bet:number; contributed:number; hole:string[]; inHand:boolean; folded:boolean; allIn:boolean; sittingOut:boolean; sitNext?:boolean|null; netChips?:number; netFromUpdate?:boolean; reaction?:{id:string;emoji:ReactionEmoji;sentAt:number;expiresAt:number}; actedBet:number|null; lastAction:string; lastSeen:number }
export interface Vote { id:string; kind:VoteKind; amount:number; voters:string[]; yes:string[]; expiresAt:number }
/** `reserve` is retained only so rooms created by older deployments can be refunded safely. */
export interface Bounty { amount:number; players:string[]; won:string[]; reserve?:number }
/** Legacy escrow fields are optional so old rooms can be refunded during migration. */
export interface SevenDeuce { amount:number; players?:string[]; reserve?:number; reserves?:Record<string,number> }
export interface Result { text:string; winners:string[]; payouts:{id:string;amount:number;hand:string}[]; board:string[]; boardTwo?:string[]; revealed:string[] }
export interface StripDiscard { street:'flop'|'turn'|'river'; pending:string[] }
export type TableEvent = { id:string; handNo:number; at:number } & (
 { type:'deal'; dealerId:string; players:string[]; rounds:number } |
 { type:'fold'|'check'; playerId:string } |
 { type:'bet'; playerId:string; amount:number } |
 { type:'die'; roll:number } |
 { type:'ocean' }
);
export interface BountyOutcome { loserId:string; loserName:string; loserSeat:number; amount:number; completedAt:number }
export interface Room { code:string; name:string; hostId:string; settings:Settings; players:Player[]; version:number; handNo:number; actionNo:number; dealerSeat:number; phase:Phase; deck:string[]; board:string[]; boardTwo:string[]; currentBet:number; minRaise:number; turnId:string|null; deadline:number|null; vote:Vote|null; bombNext:{amount:number;players:string[]}|null; oceanNext:{players:string[]}|null; dieRiverNext:{players:string[]}|null; pocketTripsNext:{players:string[]}|null; doubleBarrelNext:{players:string[]}|null; stripClubNext:{players:string[]}|null; redRiverNext?:{players:string[]}|null; potOrNotNext?:{players:string[]}|null; isBomb:boolean; isOcean:boolean; isDieRiver:boolean; isPocketTrips:boolean; isDoubleBarrel:boolean; isStripClub:boolean; isRedRiver?:boolean; isPotOrNot?:boolean; potOrNotBet?:number; stripDiscard:StripDiscard|null; dieRiverRoll:number|null; bounty:Bounty|null; bountyOutcome?:BountyOutcome|null; tableEvents?:TableEvent[]; sevenDeuce:SevenDeuce|null; result:Result|null; logs:{id:string;text:string}[]; receipts:string[]; createdAt:number }
export type PublicPlayer = Omit<Player,'tokenHash'|'actedBet'>;
export interface RoomView extends Omit<Room,'players'|'deck'|'receipts'> { players:PublicPlayer[]; me:string; pot:number; legal:{call:number;minRaiseTo:number;maxRaiseTo:number;canRaise:boolean}|null; localMode:boolean }
export type Action = {type:'start'} | {type:'show'} | {type:'act';move:'fold'|'check'|'call'|'raise';amount?:number;expectedAction:number} | {type:'discard';card:string;expectedAction:number} | {type:'propose';kind:VoteKind;amount:number} | {type:'vote';voteId:string;yes:boolean} | {type:'theme';theme:Theme} | {type:'seats';maxPlayers:number} | {type:'sit';out:boolean} | {type:'react';emoji:ReactionEmoji} | {type:'rebuy'} | {type:'leave'} | {type:'cancelBounty'};
