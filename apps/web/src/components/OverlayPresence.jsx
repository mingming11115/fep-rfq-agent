import React,{useState} from 'react';

// Retain the last element until the native Modal/Drawer finishes closing.
// Keep each independent overlay in its own boundary.
export default function OverlayPresence({children,kind='modal'}){
  const child=React.isValidElement(children)?children:null;
  const [retained,setRetained]=useState(child);
  if(child&&child!==retained)setRetained(child);
  const element=child||retained;
  if(!element)return null;
  const release=()=>setRetained(current=>current===element?null:current);
  const afterClose=(...args)=>{element.props.afterClose?.(...args);release();};
  const afterOpenChange=open=>{element.props.afterOpenChange?.(open);if(!open)release();};
  if(kind==='drawer-form')return React.cloneElement(element,{open:!!child,drawerProps:{...element.props.drawerProps,afterOpenChange:open=>{element.props.drawerProps?.afterOpenChange?.(open);if(!open)release();}}});
  return React.cloneElement(element,{open:!!child,afterClose,afterOpenChange});
}
