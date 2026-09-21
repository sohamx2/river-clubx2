import { z } from 'zod';
const theme=z.enum(['classic','dark','astral','metalluxe']);
const name=z.string().trim().min(1).max(20).regex(/^[^\p{Cc}\p{Cf}<>]+$/u,'Use a simple display name.');
const action=z.discriminatedUnion('type',[
 z.object({type:z.literal('start')}),
 z.object({type:z.literal('show')}),
 z.object({type:z.literal('act'),move:z.enum(['fold','check','call','raise']),amount:z.number().int().min(1).max(100000000).optional(),expectedAction:z.number().int().nonnegative()}),
 z.object({type:z.literal('discard'),card:z.string().regex(/^[2-9TJQKA][shdc]$/),expectedAction:z.number().int().nonnegative()}),
 z.object({type:z.literal('propose'),kind:z.enum(['bomb','bounty','sevenDeuce','ocean','dieRiver','pocketTrips','doubleBarrel','stripClub']),amount:z.number().int().min(0).max(100000)}),
 z.object({type:z.literal('vote'),voteId:z.uuid(),yes:z.boolean()}),
 z.object({type:z.literal('theme'),theme}),z.object({type:z.literal('seats'),maxPlayers:z.number().int().min(2).max(10)}),z.object({type:z.literal('sit'),out:z.boolean()}),
 z.object({type:z.literal('rebuy')}),z.object({type:z.literal('leave')}),z.object({type:z.literal('cancelBounty')})
]);
export const bodySchema=z.discriminatedUnion('op',[
 z.object({op:z.literal('create'),requestId:z.uuid(),name,roomName:z.string().trim().min(1).max(32),settings:z.object({theme,maxPlayers:z.number().int().min(2).max(10),startingStack:z.number().int().min(50).max(1000000),smallBlind:z.number().int().min(1).max(499999),bigBlind:z.number().int().min(2).max(500000),turnSeconds:z.union([z.literal(0),z.literal(30),z.literal(60),z.literal(90)])}).refine(s=>s.bigBlind>s.smallBlind,'The big blind must be larger than the small blind.').refine(s=>s.startingStack>=s.bigBlind*20,'Starting stack must cover at least 20 big blinds.')}),
 z.object({op:z.literal('join'),requestId:z.uuid(),code:z.string().regex(/^[A-Z2-9]{6}$/),name}),
 z.object({op:z.literal('action'),requestId:z.uuid(),code:z.string().regex(/^[A-Z2-9]{6}$/),action})
]);
