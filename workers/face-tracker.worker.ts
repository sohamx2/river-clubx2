import {FaceLandmarker,FilesetResolver} from '@mediapipe/tasks-vision';
import {faceFromBlendshapes,type FacePose} from '../lib/face-pose';

type Input={type:'init'}|{type:'frame';bitmap:ImageBitmap;timestamp:number};
type Output={type:'ready'}|{type:'face';face:FacePose|null}|{type:'error';message:string};
const scope=globalThis as unknown as {onmessage:((event:MessageEvent<Input>)=>void)|null;postMessage:(message:Output)=>void;location:Location};
let landmarker:FaceLandmarker|null=null;
scope.onmessage=async({data})=>{
  if(data.type==='init'){
    try{
      const base=new URL('/face-tracking/1.1.0',scope.location.origin).href;
      const fileset=await FilesetResolver.forVisionTasks(base);
      landmarker=await FaceLandmarker.createFromOptions(fileset,{baseOptions:{modelAssetPath:`${base}/face_landmarker.task`,delegate:'CPU'},runningMode:'VIDEO',numFaces:1,outputFaceBlendshapes:true});
      scope.postMessage({type:'ready'});
    }catch(error){scope.postMessage({type:'error',message:error instanceof Error?error.message:'Initialization failed'});}
    return;
  }
  try{
    if(!landmarker)throw new Error('Not initialized');
    const result=landmarker.detectForVideo(data.bitmap,data.timestamp);
    const categories=result.faceBlendshapes[0]?.categories;
    scope.postMessage({type:'face',face:categories?faceFromBlendshapes(categories):null});
  }catch(error){scope.postMessage({type:'error',message:error instanceof Error?error.message:'Frame processing failed'});}
  finally{data.bitmap.close();}
};
