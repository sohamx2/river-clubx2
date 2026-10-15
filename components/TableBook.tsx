'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { BookOpen, X } from 'lucide-react';

export type BookChapter = 'play'|'games'|'players'|'room'|'presence';
const chapters:{id:BookChapter;name:string;number:string}[]=[
  {id:'play',name:'The hand',number:'01'},
  {id:'games',name:'Side games',number:'02'},
  {id:'players',name:'The regulars',number:'03'},
  {id:'room',name:'Your room',number:'04'},
  {id:'presence',name:'Your character',number:'05'},
];

/** Native controls live on the pages of the in-world book, including keyboard focus. */
export function TableBook({open,chapter,onChapter,onClose,roomName,error,children}:{
  open:boolean;chapter:BookChapter;onChapter:(chapter:BookChapter)=>void;onClose:()=>void;
  roomName:string;error?:string;children:Record<BookChapter,ReactNode>;
}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const dialog=ref.current;if(!dialog)return;
    if(open&&!dialog.open)dialog.showModal();else if(!open&&dialog.open)dialog.close();
  },[open]);
  return <dialog ref={ref} className="table-book-dialog" aria-label="Table book" onCancel={event=>{event.preventDefault();onClose();}} onClick={event=>{if(event.target===ref.current)onClose();}}>
    <div className="table-book-spread">
      <nav className="book-index" aria-label="Book chapters">
        <div className="book-imprint"><BookOpen size={22}/><span>THE RIVER CLUB</span><h2>A good<br/><em>night in.</em></h2><p>Your table companion</p></div>
        {chapters.map(item=><button key={item.id} aria-label={item.name} onClick={()=>onChapter(item.id)} aria-current={chapter===item.id?'page':undefined}><small aria-hidden="true">{item.number}</small>{item.name}<span aria-hidden="true">↗</span></button>)}
        <div className="book-colophon">{roomName}<br/><span>Good hands. Better company.</span></div>
      </nav>
      <div className="book-binding" aria-hidden="true"/>
      <div className="book-pages">
        <div className="book-page-heading"><span>{chapters.find(item=>item.id===chapter)?.number} / {chapters.find(item=>item.id===chapter)?.name}</span><button className="book-close" onClick={onClose} aria-label="Close table book"><X size={19}/></button></div>
        {error&&<p className="book-error" role="alert">{error}</p>}
        {chapters.map(item=><section className="book-chapter" key={item.id} hidden={item.id!==chapter} aria-label={item.name}>{children[item.id]}</section>)}
        <div className="book-page-footer"><span>♠ &nbsp; RIVER CLUB</span><span>B to close · Esc to return to the table</span></div>
      </div>
    </div>
  </dialog>;
}
