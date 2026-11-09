import {useRef,useState} from 'react';

export function useLibraryMutation(refresh, toast) {
  const active = useRef(false);
  const [busy,setBusy] = useState(false);
  async function run(write, onSuccess, onError) {
    if (active.current) { return; }
    active.current = true;
    setBusy(true);
    try {
      const saved = await write();
      try {
        await refresh?.();
      } catch (error2) {
        console.error('保存后刷新知识库列表失败', error2);
        toast?.('已保存，列表刷新失败，请重新刷新页面。','error');
      }
      onSuccess?.(saved);
    } catch (error) {
      console.error('保存知识库变更失败', error);
      onError(error);
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  return {busy,run};
}
