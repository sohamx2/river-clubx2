'use client';
import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Trophy, X } from 'lucide-react';
import { Card } from './Cards';
import type { RoomView } from '@/lib/types';
export function ShowdownOverlay({room,onClose}:{room:RoomView;onClose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null);const reduced=useReducedMotion();const[revealed,setRevealed]=useState(0);const[complete,setComplete]=useState(false);
 const players=room.players.filter(player=>player.inHand&&!player.folded);
 const count=Math.max(...players.map(player=>player.hole.length));
 useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>dialog?.close();},[]);
 useEffect(()=>{
  if(reduced){setRevealed(count);setComplete(true);return;}
  const timers=Array.from({length:count},(_,index)=>setTimeout(()=>setRevealed(index+1),450+index*2000));
  timers.push(setTimeout(()=>setComplete(true),900+(count-1)*2000));
  return()=>timers.forEach(clearTimeout);
 },[count,reduced]);
 return <dialog ref={ref} className="showdown-overlay" aria-labelledby="showdown-title" onCancel={onClose}>
  <motion.div className="showdown-scene" initial={{opacity:0,scale:.95}} animate={{opacity:1,scale:1}} transition={{duration:reduced?0:.4}}>
   <button className="icon-button showdown-close" onClick={onClose} aria-label="Close showdown"><X size={20}/></button>
   <span className="showdown-kicker">THE MOMENT OF TRUTH</span><h2 id="showdown-title">Showdown</h2>
   {room.isDoubleBarrel&&<span className="board-label">BOARD I</span>}<div className="showdown-board" aria-label={room.isDoubleBarrel?'Board I community cards':'Community cards'}>{room.board.map((card,index)=><Card card={card} key={card} index={index}/>)}</div>
   {room.isDoubleBarrel&&<><span className="board-label">BOARD II</span><div className="showdown-board">{room.boardTwo.map((card,index)=><Card card={card} key={card} index={index}/>)}</div></>}
   <div className="showdown-contenders">{players.map(player=>{
    const won=room.result!.winners.includes(player.id);const payout=room.result!.payouts.find(payout=>payout.id===player.id);
    return <section key={player.id} className={`showdown-player ${complete&&won?'showdown-winner':''}`}>
     <strong>{player.name}{player.id===room.me&&<small> · you</small>}</strong>
     <div className="showdown-hole">{player.hole.map((card,index)=><Card key={index} card={card} back={index>=revealed}/>)}</div>
     <div className="showdown-outcome" aria-live="polite">{complete?(won?<><Trophy size={16}/> {payout?.amount.toLocaleString()} chips<span>{payout?.hand}</span></>:<span>Hand revealed</span>):<span>{revealed===count?'Reading the hands…':revealed?'One more card…':'Cards on the table'}</span>}</div>
    </section>;
   })}</div>
   <p className="showdown-result" aria-live="polite">{complete?room.result!.text:'Who takes the pot?'}</p>
   <button className="primary" onClick={onClose}>{complete?'Back to the table':'Skip reveal'}</button>
  </motion.div>
 </dialog>;
}
