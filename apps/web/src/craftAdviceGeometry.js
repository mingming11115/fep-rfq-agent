export function adviceGeometry({geometry,activeId,frame,stage,card}){
  const empty={rects:[],path:''};
  if(geometry?.status!=='matched'||geometry.selectedId!==activeId||!geometry.clip||!frame||!stage)return empty;
  const clip=geometry.clip,dx=frame.left-stage.left,dy=frame.top-stage.top;
  const rects=(geometry.ranges||[]).filter(r=>[r.x,r.y,r.w,r.h].every(Number.isFinite)).map(r=>{
    const x=Math.max(r.x,clip.x),y=Math.max(r.y,clip.y),right=Math.min(r.x+r.w,clip.x+clip.w),bottom=Math.min(r.y+r.h,clip.y+clip.h);
    return {x:x+dx,y:y+dy,w:right-x,h:bottom-y};
  }).filter(r=>r.w>0&&r.h>0);
  const last=rects.at(-1);
  if(!last||!card)return {rects,path:''};
  const x=last.x+last.w,y=last.y,tx=card.left-stage.left,ty=card.top-stage.top+Math.min(22,card.height/2);
  return {rects,path:`M ${x} ${y} H ${Math.max(x,tx-26)} L ${tx} ${ty}`};
}
