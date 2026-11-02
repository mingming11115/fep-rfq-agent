import React from 'react';
import CraftSourcePane from './CraftSourcePane';
import { officeSourceKey } from '../officeClient';

export default function SourceDocumentPane(props) {
  const source={projectId:props.selectedAnchor.projectId,fileId:props.selectedAnchor.fileId,sourceVersion:props.selectedAnchor.sourceVersion};
  return <CraftSourcePane toolbar={props.toolbar} directory={props.directory} onDocumentOutlineChange={props.onDocumentOutlineChange} showResponses={props.showResponses} responsePreview={props.responsePreview} onQuote={props.onQuote} key={officeSourceKey(source,`${props.officeUser?.id}:${props.canManageOffice}`)} file={props.file} source={source} canManage={Boolean(props.canManageOffice)} user={props.officeUser} rows={props.rows} selectedAnchor={props.selectedAnchor} onSelectAnchor={props.onSelectAnchor} allComments={props.allComments||props.comments} people={props.people} canEditRow={props.canEditRow} onProjectCommentsChange={props.onProjectCommentsChange} activeCommentId={props.activeCommentId} onSelectComment={props.onSelectComment} onUnlinkedComment={props.onUnlinkedComment}/>;
}
