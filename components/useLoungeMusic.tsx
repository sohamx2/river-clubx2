'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {Music2,VolumeX} from 'lucide-react';

type LoungeSession={context:AudioContext;timer:ReturnType<typeof setInterval>};
const note=(midi:number)=>440*Math.pow(2,(midi-69)/12);

/** Original, quiet lounge music. No recordings, remote audio, or automatic playback. */
export function useLoungeMusic(active:boolean) {
  const [playing,setPlaying]=useState(false),[error,setError]=useState('');
  const session=useRef<LoungeSession|null>(null),attempt=useRef(0),alive=useRef(true),activeRef=useRef(active);
  activeRef.current=active;
  const stop=useCallback(()=>{
    attempt.current++;
    const current=session.current;session.current=null;
    if(current){clearInterval(current.timer);void current.context.close().catch(()=>{});}
    if(alive.current)setPlaying(false);
  },[]);
  useEffect(()=>{
    alive.current=true;
    const hide=()=>{if(document.hidden)stop();};
    document.addEventListener('visibilitychange',hide);
    return()=>{alive.current=false;stop();document.removeEventListener('visibilitychange',hide);};
  },[stop]);
  useEffect(()=>{if(!active)stop();},[active,stop]);
  const toggle=useCallback(async()=>{
    if(session.current){stop();return;}
    if(!activeRef.current)return;
    const run=++attempt.current;setError('');
    let context:AudioContext|undefined;
    try{
      if(!window.AudioContext)throw new Error('unsupported');
      context=new AudioContext();
      // Resume is called directly by the music button, within its user gesture.
      await context.resume();
      if(!alive.current||!activeRef.current||run!==attempt.current){await context.close();return;}
      const audio=context;
      const output=audio.createGain();output.gain.value=.16;output.connect(audio.destination);
      const softener=audio.createBiquadFilter();softener.type='lowpass';softener.frequency.value=2800;softener.Q.value=.4;softener.connect(output);
      const delay=audio.createDelay(.8),echo=audio.createGain();delay.delayTime.value=.19;echo.gain.value=.16;delay.connect(echo);echo.connect(softener);
      const voice=(frequency:number,at:number,length:number,volume:number,type:OscillatorType='sine')=>{
        const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.type=type;oscillator.frequency.value=frequency;
        gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(volume,at+.025);gain.gain.exponentialRampToValueAtTime(.0001,at+length);
        oscillator.connect(gain);gain.connect(softener);gain.connect(delay);oscillator.start(at);oscillator.stop(at+length+.03);
        oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
      };
      const noise=audio.createBuffer(1,Math.round(audio.sampleRate*.23),audio.sampleRate),samples=noise.getChannelData(0);
      for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*(1-i/samples.length);
      const brush=(at:number,loud:boolean)=>{
        const source=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain();source.buffer=noise;
        filter.type='highpass';filter.frequency.value=loud?1900:5200;gain.gain.setValueAtTime(loud?.028:.011,at);gain.gain.exponentialRampToValueAtTime(.0001,at+.18);
        source.connect(filter);filter.connect(gain);gain.connect(softener);source.start(at);source.stop(at+.23);
        source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
      };
      // An original 72-BPM minor/major-seventh progression, with a brushed pulse.
      const chords=[[57,60,64,71],[53,57,60,64],[50,57,60,64],[52,55,59,62]];
      const roots=[33,29,26,28],beatLength=60/72;
      let beat=0,next=audio.currentTime+.08;
      const schedule=()=>{
        // A throttled browser must never queue a backlog of old notes.
        if(next<audio.currentTime-.5)next=audio.currentTime+.05;
        while(next<audio.currentTime+.32){
          const chordIndex=Math.floor(beat/8)%chords.length,step=beat%8;
          if(step===0||step===4)chords[chordIndex].forEach((pitch,index)=>{voice(note(pitch),next+index*.018,step===0?2.8:1.8,.082);voice(note(pitch)*2,next+index*.018,.8,.015);});
          if(step%2===0)voice(note(roots[chordIndex]+(step===4?7:0)),next,.62,.22,'triangle');
          brush(next,step===2||step===6);brush(next+beatLength*.66,false);
          if(step===3||step===7)voice(note(chords[chordIndex][step===3?3:2]+12),next+.1,1.15,.068);
          next+=beatLength;beat++;
        }
      };
      schedule();const timer=setInterval(schedule,100);session.current={context:audio,timer};setPlaying(true);
      audio.addEventListener('statechange',()=>{if(session.current?.context===audio&&audio.state==='closed'){clearInterval(timer);session.current=null;if(alive.current)setPlaying(false);}});
    }catch{
      if(context&&context.state!=='closed')void context.close().catch(()=>{});
      if(alive.current&&run===attempt.current)setError('Music could not start in this browser.');
    }
  },[stop]);
  return{playing,toggle,error};
}

export function LoungeMusicControl({active}:{active:boolean}) {
  const {playing,toggle,error}=useLoungeMusic(active);
  return <div className="lounge-music-control"><button type="button" className="secondary" onClick={toggle} disabled={!active} aria-pressed={playing}>{playing?<VolumeX size={16}/>:<Music2 size={16}/>} {playing?'Mute lounge music':'Play lounge music'}</button><p className="muted">{active?'Slow lounge jazz for the Velvet Hour. Sound starts only when you choose.':'Lounge music is available during a Strip Club hand.'}</p>{error&&<p role="alert">{error}</p>}</div>;
}
