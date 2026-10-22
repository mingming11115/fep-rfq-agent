import React, { useEffect, useRef, useState } from 'react';
import { Modal } from './ui';

export default function WordCommentsPrototype({ projectId, onClose }) {
  const frame = useRef(null);
  const [height, setHeight] = useState(940);

  useEffect(() => {
    const resize = (event) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type !== 'rfq-word-comments:resize' || event.data.projectId !== projectId) return;
      const value = event.data.height;
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        setHeight(Math.max(400, Math.min(12000, Math.ceil(value))));
      }
    };
    window.addEventListener('message', resize);
    return () => window.removeEventListener('message', resize);
  }, [projectId]);

  return <Modal title="Word批注" width={1360} onClose={onClose}>
    <p className="muted" style={{ fontSize: 12, lineHeight: 1.8 }}>
      示例文档 · 按项目保存在当前浏览器 · 选中文字后新建批注，页边输入自动保存 · 导出为预览
    </p>
    <iframe
      ref={frame}
      title="Word批注文档"
      src={`${import.meta.env.BASE_URL}word-comments.html?project=${encodeURIComponent(projectId)}`}
      style={{ display: 'block', width: '100%', height, border: '1px solid #d4d4d4', background: '#fff' }}
    />
  </Modal>;
}
