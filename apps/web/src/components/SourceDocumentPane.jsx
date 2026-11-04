import React from 'react';
import CraftSourcePane from './CraftSourcePane';
import { officeSourceKey } from '../officeClient';
import DocumentWorkbench from './DocumentWorkbench';
import {craftDemoAsset} from '../craftClient';
import {makeSourceAnchor} from '../documentAnchors';

function hasSavedSource(source) {
  try {
    return ['craft', 'office'].some(kind => Boolean(JSON.parse(localStorage.getItem(`fep-rfq-${kind}-source:${officeSourceKey(source)}`) || 'null')));
  } catch { return false; }
}

export default function SourceDocumentPane(props) {
  const source={projectId:props.selectedAnchor.projectId,fileId:props.selectedAnchor.fileId,sourceVersion:props.selectedAnchor.sourceVersion};
  if(props.file?.sample && !props.file.craft && !props.file.office && !hasSavedSource(source) && !craftDemoAsset(source)) {
    const select=row=>props.onSelectAnchor?.(makeSourceAnchor({...row,projectId:source.projectId}));
    return <div className="mock-source-preview">{props.toolbar}{props.directory}<p role="note">模拟客户要求摘录 · 用于评审演示</p><DocumentWorkbench readOnly imported={new Set(props.rows.map(row=>row.id))} files={[props.file]} rows={props.rows} responseRows={props.showResponses?props.rows:[]} selectedId={props.selectedAnchor.requirementId} onSelect={id=>{const row=props.rows.find(row=>row.id===id);if(row)select(row);}} onContinue={id=>{const row=props.rows.find(row=>row.id===id);if(row)select(row);}} /></div>;
  }
  return <CraftSourcePane toolbar={props.toolbar} directory={props.directory} onDocumentOutlineChange={props.onDocumentOutlineChange} showResponses={props.showResponses} responsePreview={props.responsePreview} onQuote={props.onQuote} key={officeSourceKey(source,`${props.officeUser?.id}:${props.canManageOffice}`)} file={props.file} source={source} canManage={Boolean(props.canManageOffice)} user={props.officeUser} rows={props.rows} selectedAnchor={props.selectedAnchor} onSelectAnchor={props.onSelectAnchor} allComments={props.allComments||props.comments} people={props.people} canEditRow={props.canEditRow} onProjectCommentsChange={props.onProjectCommentsChange} activeCommentId={props.activeCommentId} onSelectComment={props.onSelectComment} onUnlinkedComment={props.onUnlinkedComment}/>;
}


