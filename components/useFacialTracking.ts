'use client';
import {useEffect,useState} from 'react';
import {NEUTRAL_FACE,smoothFace,type FacePose} from '@/lib/face-pose';

export function useFacialTracking(stream:MediaStream|null,onFace:(face:FacePose)=>void,onFailure:(message:string)=>void){
  const [status,setStatus]=useState<'off'|'loading'|'tracking'|'no-face'>('off');
  useEffect(()=>{
    if(!stream){setStatus('off');return;}
    let stopped=false,worker:Worker|null=null,ready=false,inFlight=false,timer:ReturnType<typeof setTimeout>,timeout:ReturnType<typeof setTimeout>,frameTimeout:ReturnType<typeof setTimeout>;
    let lastFrame=-1,smoothed={...NEUTRAL_FACE};
    const video=document.createElement('video');video.muted=true;video.playsInline=true;video.srcObject=stream;
    const hidden=()=>{if(document.hidden){smoothed={...NEUTRAL_FACE};onFace(smoothed);}};
    const close=()=>{stopped=true;clearTimeout(timer);clearTimeout(timeout);clearTimeout(frameTimeout);document.removeEventListener('visibilitychange',hidden);worker?.terminate();video.pause();video.srcObject=null;video.remove();};
    const fail=()=>{if(stopped)return;close();onFailure('Expression tracking could not start in this browser. You can try Share camera face.');};
    setStatus('loading');
    if(typeof Worker==='undefined'||typeof createImageBitmap==='undefined'){fail();return close;}
    async function capture(){
      if(stopped)return;
      if(ready&&!inFlight&&!document.hidden&&video.readyState>=2&&video.currentTime!==lastFrame){
        inFlight=true;lastFrame=video.currentTime;
        try{
          // Process one unmirrored frame at a time. No camera image leaves this worker pipeline.
          const bitmap=await createImageBitmap(video,{resizeWidth:256,resizeHeight:Math.max(1,Math.round(video.videoHeight/video.videoWidth*256)),resizeQuality:'low'});
          if(stopped){bitmap.close();return;}
          frameTimeout=setTimeout(fail,5000);worker!.postMessage({type:'frame',bitmap,timestamp:performance.now()},[bitmap]);
        }catch{fail();return;}
      }
      timer=setTimeout(capture,80);
    }
    try{
      worker=new Worker(new URL('../workers/face-tracker.worker.ts',import.meta.url),{name:'river-face-tracker'});
      worker.onerror=(event)=>{console.warn('Expression tracking worker:',event.message);fail();};
      worker.onmessage=({data}:{data:{type:string;face?:FacePose|null;message?:string}})=>{
        if(stopped)return;
        if(data.type==='ready'){ready=true;clearTimeout(timeout);setStatus('no-face');}
        else if(data.type==='face'){clearTimeout(frameTimeout);inFlight=false;setStatus(data.face?'tracking':'no-face');smoothed=smoothFace(smoothed,data.face||NEUTRAL_FACE);onFace(document.hidden?NEUTRAL_FACE:smoothed);}
        else if(data.type==='error'){console.warn('Expression tracking unavailable:',data.message);fail();}
      };
      document.addEventListener('visibilitychange',hidden);timeout=setTimeout(fail,20000);worker.postMessage({type:'init'});void video.play().catch(fail);void capture();
    }catch{fail();}
    return close;
  },[stream,onFace,onFailure]);
  return status;
}
