'use client';
import { motion } from 'motion/react';
export const themes = [
 { id: 'classic', name: 'Classic', description: 'The original green room', symbol: '♠' },
 { id: 'dark', name: 'Dark Mode', description: 'After hours, all in', symbol: '♣' },
 { id: 'astral', name: 'Astral', description: 'A stargazer’s table', symbol: '✦' },
 { id: 'metalluxe', name: 'Black & Gold Metalluxe', description: 'A seat at the gold table', symbol: '♦' },
] as const;
export type Theme = typeof themes[number]['id'];
export function Card({card,back=false,index=0,small=false}: {card?:string;back?:boolean;index?:number;small?:boolean}) {
 const suit = card ? {s:'♠',h:'♥',d:'♦',c:'♣'}[card.slice(-1)] : '♠';
 const rank = card?.slice(0,-1).replace('T','10');
 return <motion.div initial={{opacity:0,y:-22,rotateY:back?0:80,scale:.9}} animate={{opacity:1,y:0,rotateY:0,scale:1}} transition={{duration:.45,delay:index*.065}} className={`playing-card ${back?'card-back':''} ${small?'small-card':''} ${card && /[hd]$/.test(card)?'red-card':''}`} aria-label={back?'Hidden card':`${rank} of ${{s:'spades',h:'hearts',d:'diamonds',c:'clubs'}[card?.slice(-1)||'s']}`}>
 {back ? <div className="back-inner"><span className="back-ornament">✧</span><span className="back-symbol">♠</span><span className="back-ornament">✧</span></div> : <><span className="card-corner">{rank}<i>{suit}</i></span><span className="card-suit">{suit}</span><span className="card-corner bottom">{rank}<i>{suit}</i></span></>}
 </motion.div>;
}
export function DeckPicker({value,onChange,disabled=false}:{value:Theme;onChange:(t:Theme)=>void;disabled?:boolean}) { return <div className="deck-picker" role="group" aria-label="Deck and room theme">{themes.map(t=><button key={t.id} type="button" data-theme={t.id} className={`deck-choice ${value===t.id?'selected':''}`} aria-pressed={value===t.id} disabled={disabled} onClick={()=>onChange(t.id)}><div className="deck-mini"><span>{t.symbol}</span></div><div><strong>{t.name}</strong><small>{t.description}</small></div><span className="selection-dot" /></button>)}</div>; }
