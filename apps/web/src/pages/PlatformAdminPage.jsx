import React, { useEffect, useState } from 'react';
import { UiButton, UiInput, UiSelect, BusinessTable, PageHeading } from '../components/AntContent';
import { Modal } from '../components/ui';
import { Plus } from '../components/icons';
import { adminApi, buIdsOf, managedBuIdsOf } from '../adminClient';
import './management-pages.css';

const Field = ({ label, children }) => <div className="field"><span>{label}</span>{children}</div>;
const ErrorBox = ({ error }) => (error ? <p className="error-notice" role="alert">{error}</p> : null);
const INITIAL_PASSWORD = '12345678';

const ROLE_OPTIONS = [
  ['SR', 'SR（销售负责人）'],
  ['TECH', '技术'],
  ['APPROVER', '最终审批人'],
  ['BU_ADMIN', 'BU 管理员'],
];

/**
 * 系统配置与运维：事业部目录与账号目录。
 * 数据全部来自 /api/rfq/admin，写操作落库并写审计。
 */
export default function PlatformAdminPage({ actorId }) {
  const [bus, setBus] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [edit, setEdit] = useState(null);
  const [kind, setKind] = useState('account');
  const [buId, setBuId] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [buPage, userPage] = await Promise.all([
        adminApi.listBusinessUnits({ size: 100 }),
        adminApi.listUsers({ size: 200 }),
      ]);
      setBus(buPage?.list || []);
      setAccounts(userPage?.list || []);
      setError('');
    } catch (failure) {
      console.error('加载平台管理数据失败', failure);
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const buName = (id) => bus.find((unit) => unit.id === id)?.name || id;
  const rows = accounts.filter((account) => !buId || buIdsOf(account).includes(buId));
  const selectedBu = bus.find((unit) => unit.id === buId);

  const open = (type, record) => {
    setKind(type);
    setError('');
    if (type === 'bu') {
      setEdit(record ? { id: record.id, code: record.code, name: record.name } : { id: '', code: '', name: '' });
    } else {
      setEdit(record
        ? { id: record.id, username: record.username, displayName: record.displayName, email: record.email || '' }
        : { id: '', username: '', password: INITIAL_PASSWORD, displayName: '', email: '', buId: buId || bus[0]?.id || '', role: 'SR' });
    }
  };

  async function save() {
    setBusy(true);
    setError('');
    try {
      if (kind === 'bu') {
        if (!edit.name?.trim()) { throw new Error('请填写事业部名称'); }
        if (edit.id) { await adminApi.renameBusinessUnit(edit.id, edit.name.trim()); }
        else {
          if (!edit.code?.trim()) { throw new Error('请填写事业部编码'); }
          await adminApi.createBusinessUnit({ code: edit.code.trim(), name: edit.name.trim() });
        }
      } else {
        if (!edit.displayName?.trim()) { throw new Error('请填写姓名'); }
        const profile = {
          displayName: edit.displayName.trim(),
          email: edit.email?.trim() || null,
        };
        if (edit.id) {
          await adminApi.updateUser(edit.id, profile);
        } else {
          if (!edit.username?.trim()) { throw new Error('请填写账号'); }
          if (edit.password.length < 8) { throw new Error('密码至少 8 位'); }
          await adminApi.createUser({
            ...profile,
            username: edit.username.trim(),
            password: edit.password,
            buId: edit.buId,
            role: edit.role,
          });
        }
      }
      await load();
      setEdit(null);
    } catch (failure) {
      console.error('保存平台管理设置失败', failure);
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleAccount(account) {
    setError('');
    try {
      await adminApi.updateUserStatus(account.id, account.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE');
      await load();
    } catch (failure) {
      console.error('更新账号启用状态失败', failure);
      setError(failure.message);
    }
  }

  return <div className="management-page platform-directory">
    <PageHeading title={<>系统配置与运维</>} description={<>平台账号与BU目录管理。项目业务权限由BU范围和项目授权共同控制。</>} actions={<></>} />
    {loading && <p className="muted">正在加载目录…</p>}
    <ErrorBox error={!edit && error} />
    <section className="panel">
      <div className="panel-header"><h2>BU组织</h2><UiButton className="btn" onClick={() => open('bu')}><Plus size={15}/>新增BU</UiButton></div>
      <div className="panel-body platform-bu-body">
        <div className="platform-bu-options" role="group" aria-label="按BU筛选账号">
          <UiButton className={`btn ${!buId ? 'is-selected' : ''}`} aria-pressed={!buId} aria-controls="platform-account-list" onClick={() => setBuId('')}>全部账号<span>{accounts.length}</span></UiButton>
          {bus.map((unit) => <UiButton className={`btn ${buId === unit.id ? 'is-selected' : ''}`} aria-pressed={buId === unit.id} aria-controls="platform-account-list" key={unit.id} onClick={() => setBuId(unit.id)}>{unit.name}<span>{accounts.filter((account) => buIdsOf(account).includes(unit.id)).length}</span></UiButton>)}
        </div>
        <div className="platform-bu-summary"><span>{bus.length ? '选择BU，查看下方关联账号。' : '尚无事业部，请先新增。'}</span>{selectedBu && <UiButton className="text-link" onClick={() => open('bu', selectedBu)}>维护当前BU</UiButton>}</div>
      </div>
    </section>
    <section className="panel" id="platform-account-list">
      <div className="panel-header"><div><h2>账号目录</h2><p className="platform-directory-scope" role="status">{selectedBu ? selectedBu.name : '全部BU及平台账号'} · {rows.length} 个账号</p></div><UiButton className="btn btn-primary" onClick={() => open('account')}><Plus size={15}/>新增账号</UiButton></div>
      <div className="table-wrap"><BusinessTable className="data-table mg-table">
        <thead><tr><th>姓名／账号</th><th>所属BU</th><th>管理职责</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>{rows.map((account) => <tr key={account.id}>
          <td>{account.displayName}<small>{account.username}</small></td>
          <td>{buIdsOf(account).map(buName).join('、') || (account.systemAdmin ? '平台级' : '未归属BU')}</td>
          <td>{account.systemAdmin ? '后台管理' : managedBuIdsOf(account).length ? `BU管理员 · ${managedBuIdsOf(account).map(buName).join('、')}` : '业务账号'}</td>
          <td><button type="button" className="platform-account-switch" role="switch" aria-label={`账号状态 ${account.displayName}`} aria-checked={account.status === 'ACTIVE'} disabled={account.id === actorId} title={account.id === actorId ? '当前登录账号不能停用' : `点击${account.status === 'ACTIVE' ? '停用' : '启用'}账号`} onClick={() => toggleAccount(account)}><span className="platform-account-switch-track" aria-hidden="true"/><span>{account.status === 'ACTIVE' ? '启用' : '停用'}</span></button></td>
          <td><UiButton className="text-link" onClick={() => open('account', account)}>编辑</UiButton></td>
        </tr>)}</tbody>
      </BusinessTable></div>
      {!loading && !rows.length && <p className="muted">此BU暂无关联账号。</p>}
    </section>
    {edit && <Modal title={kind === 'bu' ? (edit.id ? '维护BU' : '新增BU') : (edit.id ? '编辑账号' : '新增账号')} onClose={() => setEdit(null)} footer={<><UiButton className="btn" onClick={() => setEdit(null)}>取消</UiButton><UiButton className="btn btn-primary" disabled={busy} onClick={save}>{busy ? '保存中…' : '保存目录配置'}</UiButton></>}>
      {kind === 'bu' && <>
        {!edit.id && <Field label="编码"><UiInput className="input" aria-label="事业部编码" value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} placeholder="如 FEP、BU-QA"/></Field>}
        <Field label="名称"><UiInput className="input" aria-label="目录名称" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })}/></Field>
      </>}
      {kind === 'account' && <>
        <Field label="账号"><UiInput className="input" aria-label="账号" readOnly={!!edit.id} value={edit.username} onChange={(e) => setEdit({ ...edit, username: e.target.value })} placeholder="3-32 位字母数字"/></Field>
        {!edit.id && <Field label="初始密码"><UiInput className="input" aria-label="初始密码" type="password" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} placeholder="至少 8 位"/><small className="muted">默认初始密码：12345678</small></Field>}
        <Field label="姓名"><UiInput className="input" aria-label="姓名" value={edit.displayName} onChange={(e) => setEdit({ ...edit, displayName: e.target.value })}/></Field>
        <Field label="邮箱"><UiInput className="input" aria-label="邮箱" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} placeholder="可留空"/></Field>
        {!edit.id && <>
          <Field label="所属BU"><UiSelect className="select" aria-label="所属BU" value={edit.buId} onChange={(e) => setEdit({ ...edit, buId: e.target.value })}>{bus.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</UiSelect></Field>
          <Field label="业务角色"><UiSelect className="select" aria-label="业务角色" value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>{ROLE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</UiSelect></Field>
        </>}
      </>}
      <ErrorBox error={error}/>
    </Modal>}
  </div>;
}
