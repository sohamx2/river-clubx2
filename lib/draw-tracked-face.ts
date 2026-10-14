import {faceDrawingValues,type FacePose} from './face-pose';

/** One live canvas per character, updated in place rather than allocating textures per frame. */
export function drawTrackedFace(ctx:CanvasRenderingContext2D,face:FacePose){
  const mapped=faceDrawingValues(face);
  ctx.clearRect(0,0,256,256);ctx.strokeStyle='#302224';ctx.fillStyle='#302224';ctx.lineCap='round';ctx.lineWidth=7;
  for(const [x,blink] of [[82,mapped.eyeLeft],[174,mapped.eyeRight]]){
    if(blink>.85){ctx.beginPath();ctx.moveTo(x-12,104);ctx.lineTo(x+12,104);ctx.stroke();}
    else{ctx.beginPath();ctx.ellipse(x,103,10,Math.max(1,12*(1-blink)),0,0,Math.PI*2);ctx.fill();}
    const raised=face.browRaise*18,furrow=face.browFurrow*12,sign=x<128?1:-1;
    ctx.beginPath();ctx.moveTo(x-22,74-raised-sign*furrow);ctx.lineTo(x+22,74-raised+sign*furrow);ctx.stroke();
  }
  const width=43-face.pucker*24,leftY=174-mapped.mouthLeft*24,rightY=174-mapped.mouthRight*24;
  const opened=face.jawOpen*49;
  ctx.beginPath();ctx.moveTo(128-width,leftY);
  if(opened>5){ctx.quadraticCurveTo(128,163,128+width,rightY);ctx.quadraticCurveTo(128,183+opened,128-width,leftY);ctx.fill();
    ctx.strokeStyle='#f8ead7';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(128-width+9,leftY+3);ctx.quadraticCurveTo(128,169,128+width-9,rightY+3);ctx.stroke();
  }else{ctx.quadraticCurveTo(128,178+(mapped.mouthLeft+mapped.mouthRight)*8,128+width,rightY);ctx.stroke();}
  ctx.strokeStyle='#a66c51';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(129,125);ctx.lineTo(121,145);ctx.lineTo(135,145);ctx.stroke();
}
