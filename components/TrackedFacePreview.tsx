'use client';
import {useEffect,useRef} from 'react';
import {drawTrackedFace} from '@/lib/draw-tracked-face';
import type {FacePose} from '@/lib/face-pose';
export function TrackedFacePreview({face}:{face:FacePose}){
  const canvas=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{const ctx=canvas.current?.getContext('2d');if(!ctx)return;drawTrackedFace(ctx,face);},[face]);
  return <canvas ref={canvas} width={256} height={256} className="tracked-face-preview local-camera" aria-label="Your character's mirrored facial movements"/>;
}
