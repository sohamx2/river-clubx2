import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {database,ensureSchema,lock} from './store';
import {GameError} from './engine';
import {createPoolMatch,expirePoolPlayers,applyPoolCommand,type PoolMatch,type PoolCommand} from './pool-match';

/** Separate CAS row: billiards never blocks or overwrites a poker transition. */
export async function poolMatch(code:string,ids:string[],me:string,command?:PoolCommand):Promise<PoolMatch>{
  await ensureSchema();const sql=database(),now=Date.now();
  const change=(match:PoolMatch)=>{
    const expired=expirePoolPlayers(match,ids,now),changed=command?applyPoolCommand(match,me,command,now):false;
    if(expired||changed&&command?.type!=='heartbeat')match.version++;
    return expired||changed;
  };
  if(sql){
    await sql`INSERT INTO river_pool (code,state) VALUES (${code},${JSON.stringify(createPoolMatch())}::jsonb) ON CONFLICT DO NOTHING`;
    for(let attempt=0;attempt<12;attempt++){
      const rows=await sql`SELECT state,revision FROM river_pool WHERE code=${code}`;
      const match=rows[0].state as PoolMatch,revision=Number(rows[0].revision);
      if(!change(match))return match;
      const written=await sql`UPDATE river_pool SET state=${JSON.stringify(match)}::jsonb,revision=${revision+1},updated_at=NOW() WHERE code=${code} AND revision=${revision} RETURNING code`;
      if(written.length)return match;
    }
    throw new GameError('The pool table is busy. Try again.',409);
  }
  return lock(`pool:${code}`,async()=>{
    const folder=path.join(process.cwd(),'.local-data','pool'),file=path.join(folder,`${code}.json`);
    let match=createPoolMatch();try{match=JSON.parse(await readFile(file,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
    if(change(match)){await mkdir(folder,{recursive:true});await writeFile(`${file}.tmp`,JSON.stringify(match),{mode:0o600});await rename(`${file}.tmp`,file);}
    return match;
  });
}
