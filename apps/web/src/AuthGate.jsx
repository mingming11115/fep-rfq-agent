import { useEffect, useState } from 'react';
import { readSession, subscribeSession, persistLoginIdentity } from './authClient';
import LoginPage from './pages/LoginPage';

// 后端角色码 → 前端业务身份。最终审批人按技术身份进入，
// 其审批资格由 demo 人员的 canFinalReview 决定（与 normalizeRole 保持一致）。
const ROLE_BY_BACKEND_CODE = { SR: 'SR', TECH: '技术', APPROVER: '技术', BU_ADMIN: 'BU管理员' };

export function resolveLoginIdentity(user) {
  if (!user?.id) return null;
  if (user.systemAdmin) return { actorId: user.id, actorRole: '后台管理' };
  const code = user.roles?.[0]?.role;
  return { actorId: user.id, actorRole: ROLE_BY_BACKEND_CODE[code] || 'SR' };
}

export default function AuthGate({ children }) {
  const [session, setSession] = useState(() => readSession());

  useEffect(() => subscribeSession(setSession), []);

  function handleLogin(next) {
    const identity = resolveLoginIdentity(next?.user);
    if (identity) persistLoginIdentity(identity);
    setSession(next);
  }

  if (!session) return <LoginPage onLogin={handleLogin} />;
  return children;
}
