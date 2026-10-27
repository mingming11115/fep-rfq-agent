import React, { useEffect, useId, useRef, useState } from 'react';
import { Building2, Box, ChevronRight, FileText, FolderClock, Workflow } from 'lucide-react';
import './capability-tree.css';

const icons = { bu: Building2, model: Box, process: Workflow, unassigned: FolderClock, capability: FileText };
function findPath(node, key) {
  if (node.key === key) return [node.key];
  for (const child of node.children) {
    const path = findPath(child, key);
    if (path) return [node.key, ...path];
  }
  return null;
}

export default function CapabilityTree({ root, selectedKey, onSelect, terminalKinds = ['capability'], ariaLabel = '机型与工艺目录', emptyLabels = {}, revealSelection = false }) {
  const prefix = useId();
  const ref = useRef(null);
  const revealedKey = useRef('');
  const [expanded, setExpanded] = useState(() => new Set([root.key, root.children[0]?.key, ...(root.children[0]?.children.filter(node => node.children.length).map(node => node.key) || [])]));
  useEffect(() => {
    const ancestors = (findPath(root, selectedKey) || []).slice(0, -1);
    setExpanded(previous => ancestors.every(key => previous.has(key)) ? previous : new Set([...previous, ...ancestors]));
  }, [root, selectedKey]);
  useEffect(() => {
    if (!selectedKey) { revealedKey.current = ''; return; }
    if (!revealSelection || revealedKey.current === selectedKey) return;
    const ancestors = (findPath(root, selectedKey) || []).slice(0, -1);
    if (ancestors.some(key => !expanded.has(key))) return;
    const frame = requestAnimationFrame(() => {
      const selected = ref.current?.querySelector('.cap-tree-node[aria-current="true"]');
      if (!selected) return;
      selected.scrollIntoView({ block: 'nearest' });
      revealedKey.current = selectedKey;
    });
    return () => cancelAnimationFrame(frame);
  }, [root, selectedKey, expanded, revealSelection]);
  const toggle = key => setExpanded(previous => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  function renderNode(node) {
    const Icon = icons[node.kind];
    const canExpand = !terminalKinds.includes(node.kind);
    const open = expanded.has(node.key);
    const selected = node.key === selectedKey;
    const childId = `${prefix}-${node.key}`;
    const description = node.kind === 'capability'
      ? `${node.record.value || '待补充'} · v${node.record.version} · ${node.record.status}${node.record.validity === '被替代' ? ' · 历史版本' : ''}`
      : node.kind === 'model' ? `${node.record.code} · ${node.record.lifecycle}` : node.kind === 'process' && node.record.enabled === false ? '已停用' : '';
    return <li key={node.key}>
      <div className={`cap-tree-row ${selected ? 'selected' : ''} ${node.kind === 'unassigned' ? 'pending' : ''}`} data-node-key={node.key}>
        {canExpand && <button className="cap-tree-toggle" aria-label={`${open ? '收起' : '展开'}${node.label}`} aria-expanded={open} aria-controls={childId} onClick={() => toggle(node.key)}><ChevronRight size={13}/></button>}
        <button className={`cap-tree-node ${canExpand ? '' : 'leaf'}`} aria-current={selected ? 'true' : undefined} onClick={() => onSelect(node)}>
          <Icon size={15}/><span><strong>{node.label}{node.kind === 'unassigned' ? ` · ${node.children.length}` : ''}</strong>{description && <small>{description}</small>}</span>
        </button>
      </div>
      {canExpand && <ul id={childId} className="cap-tree-children" hidden={!open}>{node.children.length ? node.children.map(renderNode) : <li className="cap-tree-empty">{emptyLabels[node.kind] || (node.kind === 'bu' ? '暂无符合条件的机型或能力' : node.kind === 'model' ? '暂无工艺' : '暂无能力条目')}</li>}</ul>}
    </li>;
  }
  return <nav ref={ref} aria-label={ariaLabel} className="cap-tree"><ul className="cap-tree-root">{renderNode(root)}</ul></nav>;
}
