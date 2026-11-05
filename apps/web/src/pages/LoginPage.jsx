import { useState } from 'react';
import { Alert, Button, Form, Input } from 'antd';
import { login } from '../authClient';
import './login-page.css';

const DEMO_PASSWORD = 'Rfq@2026';

const DEMO_ACCOUNTS = [
  { username: 'sr01', name: '张明', role: '销售负责人', hint: '建项目 · 传文件 · 提交应答' },
  { username: 'tech01', name: '李工', role: '技术确认人', hint: '核对条款 · 确认技术应答' },
  { username: 'appr01', name: '王强', role: '最终审批人', hint: '审阅偏离 · 批准定稿' },
  { username: 'bu01', name: '陈静', role: 'BU 管理员', hint: '人员授权 · 看板 · 审计' },
  { username: 'admin', name: '系统管理员', role: '平台管理', hint: '目录 · 机型 · 系统配置' },
];

const CAPABILITIES = [
  ['01', '条款自动抽取', '保留客户章节与原始编号，不合并、不杜撰'],
  ['02', '每条要求可回溯', '点条款直接定位原文段落、表格行或图片区域'],
  ['03', '批阅与审批留痕', '原文不可变，应答副本版本化，写操作全审计'],
  ['04', '内网闭环运行', '文件、识别、推理与数据均不出企业网络'],
];

function UserGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 20c0-3.4 3.1-5.4 7-5.4s7 2 7 5.4" />
    </svg>
  );
}

function LockGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <rect x="4.5" y="10" width="15" height="9.5" rx="2.2" />
      <path d="M8 10V7.6a4 4 0 0 1 8 0V10" />
    </svg>
  );
}

export default function LoginPage({ onLogin, accounts=DEMO_ACCOUNTS }) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');

  async function submit(values, preset) {
    const username = preset?.username ?? values.username;
    const password = preset?.password ?? values.password;
    setLoading(true);
    setPending(username);
    setError('');
    try {
      const session = await login(username, password);
      onLogin(session);
    } catch (failure) {
      setError(failure.message);
      setLoading(false);
      setPending('');
    }
  }

  return (
    <div className="login-page">
      <div className="login-shell">
        <aside className="login-brand">
          <div className="login-brand-top">
            <span className="brand-mark">F</span>
            <div>
              <strong>FEP RFQ</strong>
              <small>销售应答提效平台</small>
            </div>
          </div>
          <h1>从客户文件<br />到可审计应答</h1>
          <p className="login-brand-lead">
            上传客户 RFQ，自动抽取条款；每条要求都能回到原文，每份应答都有版本与审批记录。
          </p>
          <ul className="login-capabilities">
            {CAPABILITIES.map(([index, title, detail]) => (
              <li key={index}>
                <b>{index}</b>
                <div><strong>{title}</strong><span>{detail}</span></div>
              </li>
            ))}
          </ul>
          <footer className="login-brand-foot">
            <span>v0.3 · 内网部署</span>
            <span>数据不出企业网络</span>
          </footer>
        </aside>

        <section className="login-panel">
          <div className="login-panel-head">
            <h2>登录工作空间</h2>
            <p>使用已配置的账号登录工作空间。</p>
          </div>

          {error && <Alert className="login-error" type="error" showIcon message={error} />}

          <Form
            form={form}
            className="login-form"
            layout="vertical"
            size="large"
            requiredMark={false}
            onFinish={(values) => submit(values)}
          >
            <Form.Item name="username" label="账号" rules={[{ required: true, message: '请输入账号' }]}>
              <Input prefix={<UserGlyph />} placeholder="如 sr01" autoComplete="username" autoFocus />
            </Form.Item>
            <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password prefix={<LockGlyph />} placeholder="请输入密码" autoComplete="current-password" />
            </Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              block
              className="login-submit"
              loading={loading && !pending}
            >
              登录
            </Button>
          </Form>

          {accounts.length>0&&<div className="login-demo">
            <div className="login-demo-head">
              <span>快捷登录账号</span>
              <small>统一密码 {DEMO_PASSWORD}</small>
            </div>
            <div className="login-demo-grid">
              {accounts.map((account) => (
                <button
                  key={account.username}
                  type="button"
                  className={`login-demo-card${pending === account.username ? ' is-pending' : ''}`}
                  disabled={loading}
                  onClick={() => submit(null, { ...account, password: DEMO_PASSWORD })}
                >
                  <span className="login-demo-avatar">{account.name[0]}</span>
                  <span className="login-demo-text">
                    <strong>{account.name}<em>{account.role}</em></strong>
                    <small>{account.hint}</small>
                  </span>
                  <span className="login-demo-action">{pending === account.username ? '登录中…' : '进入'}</span>
                </button>
              ))}
            </div>
          </div>}

          <p className="login-footnote">项目和条款按账号授权范围从数据库读取。</p>
        </section>
      </div>
    </div>
  );
}
