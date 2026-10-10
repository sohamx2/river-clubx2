const ranks='23456789TJQKA';
const names=['High card','One pair','Two pair','Three of a kind','Straight','Flush','Full house','Four of a kind','Straight flush'];
export function compare(a:number[],b:number[]):number {for(let i=0;i<Math.max(a.length,b.length);i++){const d=(a[i]||0)-(b[i]||0);if(d)return d;}return 0;}
function straight(values:number[]):number {
 const present=new Set(values);if(present.has(14))present.add(1);
 for(let high=14;high>=5;high--)if([0,1,2,3,4].every(offset=>present.has(high-offset)))return high;
 return 0;
}
/** Rank the best five directly, including arbitrarily long Red River boards. */
export function evaluate(cards:string[]):{rank:number[];name:string} {
 if(cards.length<5||cards.length>52||new Set(cards).size!==cards.length||cards.some(c=>! /^[2-9TJQKA][shdc]$/.test(c)))throw new Error('Expected 5–52 distinct poker cards.');
 const counts=new Map<number,number>(),suits=new Map<string,number[]>();
 for(const card of cards){const value=ranks.indexOf(card[0])+2;counts.set(value,(counts.get(value)||0)+1);const suited=suits.get(card[1])||[];suited.push(value);suits.set(card[1],suited);}
 const values=[...counts.keys()].sort((a,b)=>b-a);
 const groups=(minimum:number)=>values.filter(value=>counts.get(value)!>=minimum);
 const flushes=[...suits.values()].filter(values=>values.length>=5).map(values=>values.sort((a,b)=>b-a));
 const straightFlush=Math.max(0,...flushes.map(straight));
 const quads=groups(4),trips=groups(3),pairs=groups(2);
 let rank:number[];
 if(straightFlush)rank=[8,straightFlush];
 else if(quads.length)rank=[7,quads[0],values.find(value=>value!==quads[0])!];
 else if(trips.length&&pairs.some(value=>value!==trips[0]))rank=[6,trips[0],pairs.find(value=>value!==trips[0])!];
 else if(flushes.length)rank=[5,...flushes.map(values=>values.slice(0,5)).sort((a,b)=>compare(b,a))[0]];
 else if(straight(values))rank=[4,straight(values)];
 else if(trips.length)rank=[3,trips[0],...values.filter(value=>value!==trips[0]).slice(0,2)];
 else if(pairs.length>=2)rank=[2,...pairs.slice(0,2),values.find(value=>!pairs.slice(0,2).includes(value))!];
 else if(pairs.length)rank=[1,pairs[0],...values.filter(value=>value!==pairs[0]).slice(0,3)];
 else rank=[0,...values.slice(0,5)];
 return{rank,name:rank[0]===8&&rank[1]===14?'Royal flush':names[rank[0]]};
}
