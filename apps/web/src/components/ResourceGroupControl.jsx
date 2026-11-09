import React, {useState} from 'react';
import {Alert, Button, Modal} from 'antd';
import GroupPicker, {useKnowledgeGroup} from './KnowledgeGroupContext';
import {useLibraryMutation} from '../useLibraryMutation';

export default function ResourceGroupControl({kind, row, client, refresh, toast}) {
  const scope = useKnowledgeGroup();
  const [ids, setIds] = useState(null);
  const [error, setError] = useState('');
  const {busy, run} = useLibraryMutation(refresh, toast);
  if (!scope) return null;
  function save() {
    try {
      const next = scope.validate(ids, scope.groups(kind, row));
      run(() => client.assignGroups(kind, row, next), () => {
        setIds(null);
        toast('分组已保存');
      }, error => setError(error.message));
    } catch (error) { setError(error.message); }
  }
  return <>
    <Button size="small" onClick={() => { setIds(scope.groups(kind, row)); setError(''); }}>调整分组</Button>
    <Modal title="调整知识分组" open={ids !== null} onCancel={() => { if (!busy) setIds(null); }}
      confirmLoading={busy} onOk={save} okText="保存" cancelText="取消">
      <GroupPicker value={ids || []} onChange={setIds} disabled={busy}/>
      {error && <Alert type="error" showIcon message={error}/>}
    </Modal>
  </>;
}
