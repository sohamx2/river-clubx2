'use client';
import { useLayoutEffect, useRef } from 'react';
import { motion, useAnimationControls, useReducedMotion } from 'motion/react';
export const themes = [
 { id: 'classic', name: 'Classic', description: 'The original green room', symbol: '♠' },
 { id: 'dark', name: 'Dark Mode', description: 'After hours, all in', symbol: '♣' },
 { id: 'astral', name: 'Astral', description: 'A stargazer’s table', symbol: '✦' },
 { id: 'metalluxe', name: 'Black & Gold Metalluxe', description: 'A seat at the gold table', symbol: '♦' },
 { id: 'cyberpunk', name: 'Cyberpunk', description: 'Neon circuits. Midnight stakes.', symbol: '⚡' },
] as const;
export type Theme = typeof themes[number]['id'];
/** Original mirrored court illustration; colors follow the selected deck. */
function CourtArt({rank}:{rank:string}){
 const portrait=<g stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill="none"><path d="M17 30Q17 14 30 14Q43 14 43 30L40 44L30 50L20 44Z" fill="currentColor" fillOpacity=".08"/><path d="M19 27L22 18L30 23L38 18L42 27M23 31H27M33 31H37M30 32L28 39H32M26 43Q30 46 34 43"/>{rank==='J'?<><path d="M17 19L13 11L37 8L44 17ZM35 9Q46 1 48 5Q47 13 40 13"/><path d="M22 46L15 57H45L38 46M16 56L37 48"/></>:<><path d="M17 18L14 7L24 12L30 3L36 12L46 7L43 18Z" fill="currentColor" fillOpacity=".2"/><path d="M22 48L12 57H48L38 48M25 50L30 56L35 50"/>{rank==='K'?<path d="M24 44L26 50L30 53L34 50L36 44M10 28V54M7 31H13"/>:<path d="M42 31Q51 35 45 48M18 31Q9 35 15 48M49 32V55M46 30L49 24L52 30Z"/>}</>}</g>;
 return <svg className="court-art" viewBox="0 0 60 120" aria-hidden="true"><path d="M6 4H54V116H6Z" fill="currentColor" fillOpacity=".035" stroke="currentColor" strokeOpacity=".25"/><g>{portrait}</g><g transform="translate(60 120) rotate(180)">{portrait}</g><path d="M8 60H52" stroke="currentColor" strokeOpacity=".3"/></svg>;
}
export function Card({card,back=false,index=0,small=false,deal=false}: {card?:string;back?:boolean;index?:number;small?:boolean;deal?:boolean}) {
 const suit = card ? {s:'♠',h:'♥',d:'♦',c:'♣'}[card.slice(-1)] : '♠';
 const rank = card?.slice(0,-1).replace('T','10');
 const controls=useAnimationControls();const ref=useRef<HTMLDivElement>(null);const reduced=useReducedMotion();
 useLayoutEffect(()=>{
  const node=ref.current;const scene=deal?node?.closest('.game-surface'):null;
  const cardRect=node?.getBoundingClientRect(),sceneRect=scene?.getBoundingClientRect();
  const dock=scene?parseFloat(getComputedStyle(scene).getPropertyValue('--pov-dock'))||0:0;
  const x=sceneRect&&cardRect?sceneRect.left+(sceneRect.width-dock)*.5-cardRect.left-cardRect.width/2:0;
  const y=sceneRect&&cardRect?sceneRect.top+sceneRect.height*.35-cardRect.top-cardRect.height/2:-24;
  controls.set(reduced?{opacity:1,x:0,y:0,scale:1,rotate:0}:{opacity:0,x,y,scale:.65,rotate:deal?-18:0});
  void controls.start({opacity:1,x:0,y:0,scale:1,rotate:0,transition:{duration:reduced?0:.55,delay:reduced?0:index*.085,ease:[.16,1,.3,1]}});
 },[controls,deal,index,reduced]);
 return <motion.div ref={ref} initial={{opacity:0}} animate={controls} className={`playing-card ${back?'card-back':''} ${small?'small-card':''} ${card && /[hd]$/.test(card)?'red-card':''} ${rank&&/[JQK]/.test(rank)?'face-card':''}`} aria-label={back?'Hidden card':`${rank} of ${{s:'spades',h:'hearts',d:'diamonds',c:'clubs'}[card?.slice(-1)||'s']}`}>
 <motion.div className="card-content" initial={{rotateY:back?180:0}} animate={{rotateY:back?180:0}} transition={{duration:reduced?0:.45,ease:'easeInOut'}}>
 <div className="card-front" aria-hidden={back}><span className="card-corner">{rank}<i>{suit}</i></span>{rank&&/^[JQK]$/.test(rank)?<CourtArt rank={rank}/>:<span className="card-suit">{suit}</span>}<span className="card-corner bottom">{rank}<i>{suit}</i></span></div>
 <div className="card-reverse" aria-hidden={!back}><div className="back-inner"><span className="back-ornament">✧</span><span className="back-symbol">♠</span><span className="back-ornament">✧</span></div></div>
 </motion.div></motion.div>;
}
export function DeckPicker({value,onChange,disabled=false}:{value:Theme;onChange:(t:Theme)=>void;disabled?:boolean}) { return <div className="deck-picker" role="group" aria-label="Deck and room theme">{themes.map(t=><button key={t.id} type="button" data-theme={t.id} className={`deck-choice ${value===t.id?'selected':''}`} aria-pressed={value===t.id} disabled={disabled} onClick={()=>onChange(t.id)}><div className="deck-mini"><span>{t.symbol}</span></div><div><strong>{t.name}</strong><small>{t.description}</small></div><span className="selection-dot" /></button>)}</div>; }
