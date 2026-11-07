import React,{useEffect,useRef,useState} from 'react';

function motionPreference() {
  const query = '(prefers-reduced-motion: reduce)';
  return globalThis.matchMedia?.(query) ?? globalThis.window?.matchMedia?.(query);
}

export default function AnimatedNumber({value,duration=260}){
  const [shown,setShown] = useState(() => (
    Number.isFinite(value) && typeof requestAnimationFrame === 'function' && !motionPreference()?.matches ? 0 : value
  ));
  const current = useRef(shown);
  useEffect(()=>{
    const media=motionPreference();
    let frame,stopped=false;
    const finish=()=>{stopped=true;cancelAnimationFrame(frame);current.current=value;setShown(value);};
    if(!Number.isFinite(value)||media?.matches||typeof requestAnimationFrame!=='function'){current.current=value;setShown(value);return;}
    const from=current.current;let start;
    const tick=now=>{if(stopped)return;start??=now;const progress=Math.min(1,(now-start)/duration);const next=Math.round(from+(value-from)*(1-Math.pow(1-progress,3)));current.current=next;setShown(next);if(progress<1)frame=requestAnimationFrame(tick);};
    if(from!==value)frame=requestAnimationFrame(tick);
    media?.addEventListener?.('change',finish);
    return()=>{stopped=true;cancelAnimationFrame(frame);media?.removeEventListener?.('change',finish);};
  },[value,duration]);
  return <span aria-label={String(value)}><span aria-hidden="true">{shown}</span></span>;
}
