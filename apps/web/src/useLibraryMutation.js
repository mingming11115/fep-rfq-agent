import {useRef,useState} from 'react';

export function useLibraryMutation(refresh, toast) {
  const active = useRef(false);
  const [busy,setBusy] = useState(false);
  async function run(write, onSuccess, onError) {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    try {
      const saved = await write();
      try {
        await refresh?.();
      } catch {
        toast?.('已保存，列表刷新失败，请重新刷新页面。','error');
      }
      onSuccess?.(saved);
    } catch (error) {
      onError(error);
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  return {busy,run};
}
