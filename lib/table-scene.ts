import type { RoomView } from './types';

export const DIE_ROLL_MS = 1900;
export const OCEAN_WAVE_MS = 1550;
export const CHIP_VALUES = [
  { value:10000, color:'#ed814f' }, { value:5000, color:'#579ace' },
  { value:1000, color:'#dcb75d' }, { value:500, color:'#9867c6' },
  { value:100, color:'#343c49' }, { value:25, color:'#48a37c' },
  { value:5, color:'#d35b65' }, { value:1, color:'#e6dfcd' },
] as const;

/** A fixed denomination palette; smaller bankrolls use more chips for readable towers. */
export function chipBreakdown(amount:number) {
  let remaining=Math.max(0,Math.floor(amount));
  const ceiling=Math.max(100,remaining/20);
  return CHIP_VALUES.filter(chip=>chip.value<=ceiling).map(chip=>{
    const count=Math.floor(remaining/chip.value);remaining-=count*chip.value;
    return {...chip,count};
  }).filter(chip=>chip.count>0);
}

/** Let table effects finish before a native showdown dialog covers the scene. */
export function tableCinematicEndsAt(room:Pick<RoomView,'handNo'|'tableEvents'>):number {
  return Math.max(0,...(room.tableEvents||[]).filter(event=>event.handNo===room.handNo).map(event=>
    event.type==='die'?event.at+DIE_ROLL_MS+2500:event.type==='ocean'?event.at+OCEAN_WAVE_MS+1400:0));
}
