const ranks='23456789TJQKA';
const names=['High card','One pair','Two pair','Three of a kind','Straight','Flush','Full house','Four of a kind','Straight flush'];
function five(cards:string[]):number[] {
 const values=cards.map(c=>ranks.indexOf(c[0])+2).sort((a,b)=>b-a);
 const counts=new Map<number,number>(); values.forEach(v=>counts.set(v,(counts.get(v)||0)+1));
 const groups=[...counts].sort((a,b)=>b[1]-a[1]||b[0]-a[0]);
 const flush=cards.every(c=>c[1]===cards[0][1]);
 const unique=[...new Set(values)];
 const straight=unique.length===5?(unique[0]-unique[4]===4?unique[0]:unique.join(',')==='14,5,4,3,2'?5:0):0;
 if(flush&&straight)return[8,straight];
 if(groups[0][1]===4)return[7,groups[0][0],groups[1][0]];
 if(groups[0][1]===3&&groups[1][1]===2)return[6,groups[0][0],groups[1][0]];
 if(flush)return[5,...values];
 if(straight)return[4,straight];
 if(groups[0][1]===3)return[3,groups[0][0],...groups.slice(1).map(g=>g[0])];
 if(groups[0][1]===2&&groups[1][1]===2)return[2,...groups.map(g=>g[0])];
 if(groups[0][1]===2)return[1,...groups.map(g=>g[0])];
 return[0,...values];
}
export function compare(a:number[],b:number[]):number {for(let i=0;i<Math.max(a.length,b.length);i++){const d=(a[i]||0)-(b[i]||0);if(d)return d;}return 0;}
export function evaluate(cards:string[]):{rank:number[];name:string} {
 // Pocket Trips + Ocean gives each player nine available cards.  Evaluate all
 // five-card choices rather than treating that valid format as a bad request.
 if(cards.length<5||cards.length>9||new Set(cards).size!==cards.length||cards.some(c=>! /^[2-9TJQKA][shdc]$/.test(c)))throw new Error('Expected 5–9 distinct poker cards.');
 let best:number[]=[];
 for(let a=0;a<cards.length-4;a++)for(let b=a+1;b<cards.length-3;b++)for(let c=b+1;c<cards.length-2;c++)for(let d=c+1;d<cards.length-1;d++)for(let e=d+1;e<cards.length;e++){const hand=five([cards[a],cards[b],cards[c],cards[d],cards[e]]);if(!best.length||compare(hand,best)>0)best=hand;}
 return{rank:best,name:best[0]===8&&best[1]===14?'Royal flush':names[best[0]]};
}
