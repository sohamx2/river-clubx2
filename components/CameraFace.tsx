'use client';
import { useEffect,useRef } from 'react';
export function CameraFace({stream,name,local=false}:{stream:MediaStream;name:string;local?:boolean}) {
  const ref=useRef<HTMLVideoElement>(null);
  useEffect(()=>{
    const video=ref.current;if(!video)return;video.srcObject=stream;void video.play().catch(()=>{});
    return()=>{video.srcObject=null;};
  },[stream]);
  return <video ref={ref} className={`camera-face-video ${local?'local-camera':''}`} autoPlay playsInline muted aria-label={`${name}’s live camera face`}/>;
}
