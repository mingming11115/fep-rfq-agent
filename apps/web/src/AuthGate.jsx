import { useEffect, useState } from 'react';
import { readSession, subscribeSession, persistLoginIdentity } from './authClient';
import LoginPage from './pages/LoginPage';
import { resolveLoginIdentity } from './sessionPersonnel';

export { resolveLoginIdentity } from './sessionPersonnel';

export default function AuthGate({ children, loginAccounts }) {
  const [session, setSession] = useState(() => readSession());

  useEffect(() => subscribeSession(setSession), []);

  function handleLogin(next) {
    const identity = resolveLoginIdentity(next?.user);
    if (identity) persistLoginIdentity(identity);
    window.history.replaceState(null, '', identity?.actorRole === '后台管理' ? '#/admin' : '#/dashboard');
    setSession(next);
  }

  if (!session) return <LoginPage onLogin={handleLogin} accounts={loginAccounts} />;
  return children;
}
