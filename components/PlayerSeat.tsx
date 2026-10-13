'use client';
import type { CSSProperties } from 'react';
import { AnimatePresence,motion,useReducedMotion } from 'motion/react';
import { Plus } from 'lucide-react';
import { Card } from './Cards';
import { REACTION_LABELS } from '@/lib/reactions';
import type { RoomView,PublicPlayer } from '@/lib/types';

export function PlayerSeat({p,room,seconds,now,style,onInvite}:{p?:PublicPlayer;room:RoomView;seconds:number;now:number;style:CSSProperties;onInvite:()=>void}) {
  const reduced=useReducedMotion();
  if(!p)return <button className="seat empty-seat" style={style} onClick={onInvite} aria-label="Invite a friend to this empty seat"><Plus size={20}/><span>Open seat</span></button>;
  const mine=p.id===room.me,playing=room.turnId===p.id;
  const idle=room.phase==='waiting'||room.phase==='showdown';
  const won=room.phase==='showdown'&&room.result?.winners.includes(p.id);
  const shown=room.phase==='showdown'&&room.result?.revealed.includes(p.id);
  const offline=now-p.lastSeen>30000;
  const reaction=p.reaction&&p.reaction.expiresAt>now?p.reaction:null;
  return <div className={`seat occupied-seat ${mine?'my-seat':''} ${playing?'acting':''} ${p.folded?'folded':''} ${shown?'shown':''} ${won?'winner':''}`} style={style}>
    <AnimatePresence>{reaction&&<motion.div className="seat-reaction" key={reaction.id} initial={{opacity:0,y:reduced?0:12,scale:reduced?1:.6}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:reduced?0:-18,scale:reduced?1:.8}} role="status" aria-label={`${p.name} reacts with ${REACTION_LABELS[reaction.emoji]}`}>{reaction.emoji}</motion.div>}</AnimatePresence>
    <div className="seat-cards">{p.hole.map((card,i)=><Card card={card==='?'?undefined:card} back={card==='?'} small key={`${room.handNo}-${i}`} index={i*room.players.filter(p=>p.inHand).length+(p.seat-room.dealerSeat+room.settings.maxPlayers)%room.settings.maxPlayers} deal/>)}</div>
    <div className="seat-persona"><span className="chair-back" aria-hidden="true"/>
      <div className="seat-info">
        <div className="seat-avatar" style={{'--avatar-hue':String((p.seat*49+25)%360)} as CSSProperties}>{p.name.slice(0,2).toUpperCase()}{offline&&<span className="offline-dot" title="Away"/>}</div>
        <div className="seat-text"><strong>{p.name}{mine&&<small> you</small>}</strong><span>{p.stack.toLocaleString()}</span></div>
        {p.seat===room.dealerSeat&&room.handNo>0&&<span className="dealer-button" title="Dealer">D</span>}
        {playing&&room.settings.turnSeconds>0&&<div className="turn-meter" style={{width:`${seconds/room.settings.turnSeconds*100}%`}}/>}
      </div>
      <div className="seat-caption">{won?'WINNER':playing?(room.settings.turnSeconds>0?`${seconds}s to act`:'Thinking…'):p.sittingOut?(p.sitNext===false?'In next hand':'Sitting out'):idle&&p.sitNext===true?'Out next hand':p.lastAction||(p.inHand?'In hand':'Next hand')}</div>
    </div>
    {p.bet>0&&!idle&&<div className="seat-bet"><span/> {p.bet.toLocaleString()}</div>}
  </div>;
}
