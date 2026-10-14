/** Facial movements, not emotion labels or identifying face landmarks. */
export const FACE_FIELDS=['smileLeft','smileRight','frownLeft','frownRight','blinkLeft','blinkRight','browRaise','browFurrow','jawOpen','pucker'] as const;
export type FacePose=Record<typeof FACE_FIELDS[number],number>;
export const NEUTRAL_FACE:FacePose={smileLeft:0,smileRight:0,frownLeft:0,frownRight:0,blinkLeft:0,blinkRight:0,browRaise:0,browFurrow:0,jawOpen:0,pucker:0};
const weight=(value:number)=>Math.round(Math.max(0,Math.min(1,Number.isFinite(value)?value:0))*100)/100;
export function faceFromBlendshapes(categories:{categoryName:string;score:number}[]):FacePose {
  const scores=Object.fromEntries(categories.map(category=>[category.categoryName,weight(category.score)]));
  const get=(name:string)=>scores[name]||0;
  return {
    smileLeft:get('mouthSmileLeft'),smileRight:get('mouthSmileRight'),frownLeft:get('mouthFrownLeft'),frownRight:get('mouthFrownRight'),
    blinkLeft:get('eyeBlinkLeft'),blinkRight:get('eyeBlinkRight'),jawOpen:get('jawOpen'),pucker:get('mouthPucker'),
    browRaise:Math.max(get('browInnerUp'),(get('browOuterUpLeft')+get('browOuterUpRight'))/2),browFurrow:(get('browDownLeft')+get('browDownRight'))/2,
  };
}
export function parseFacePose(value:unknown):FacePose|null {
  if(!value||typeof value!=='object')return null;
  const input=value as Record<string,unknown>;
  if(!FACE_FIELDS.every(key=>typeof input[key]==='number'&&Number.isFinite(input[key])&&(input[key] as number)>=0&&(input[key] as number)<=1))return null;
  return Object.fromEntries(FACE_FIELDS.map(key=>[key,weight(input[key] as number)])) as FacePose;
}
export function smoothFace(previous:FacePose,next:FacePose):FacePose {
  return Object.fromEntries(FACE_FIELDS.map(key=>[key,weight(previous[key]+(next[key]-previous[key])*(key.startsWith('blink')?.8:.55))])) as FacePose;
}
export function faceChanged(a:FacePose|null|undefined,b:FacePose|null|undefined):boolean {
  return !!a!==!!b||!!a&&!!b&&FACE_FIELDS.some(key=>Math.abs(a[key]-b[key])>.025);
}
/** Inputs are unmirrored: the subject's left eye appears on the viewer's right. */
export function faceDrawingValues(face:FacePose){
  return {eyeLeft:face.blinkRight,eyeRight:face.blinkLeft,mouthLeft:face.smileRight-face.frownRight,mouthRight:face.smileLeft-face.frownLeft};
}
