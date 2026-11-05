import {useEffect,useState} from 'react';
import {panePreferenceKey,readPaneShare,savePaneShare} from '../panePreferences';
const storage=()=>{try{return globalThis.localStorage;}catch{return null;}};
export default function usePanePreference(actorId,projectId,layout,fallback){
  const key=panePreferenceKey(actorId,projectId,layout);
  const [saved,setSaved]=useState(()=>({key,value:readPaneShare(storage(),key,fallback)}));
  if(saved.key!==key)setSaved({key,value:readPaneShare(storage(),key,fallback)});
  useEffect(()=>{if(saved.key===key)savePaneShare(storage(),key,saved.value);},[key,saved]);
  return [saved.value,update=>setSaved(current=>({key,value:typeof update==='function'?update(current.value):update}))];
}
