import {uploadWithProgress} from './uploadTransport.js';
const SESSION_KEY = 'fep-rfq-auth';
const API_BASE = '/api/rfq';

const sessionListeners = new Set();

function broadcastSession() {
  const snapshot = readSession();
  for (const listener of sessionListeners) {
    try { listener(snapshot); } catch { /* 监听方异常不应影响请求链路 */ }
  }
}

export function subscribeSession(listener) {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

const LOGIN_IDENTITY_KEY = 'fep-rfq-login-identity';

export function persistLoginIdentity(identity) {
  try { localStorage.setItem(LOGIN_IDENTITY_KEY, JSON.stringify(identity)); } catch { /* 隐私模式忽略 */ }
}

/**
 * App 初始化时读取一次登录身份并清除标记。
 * 仅在“刚登录”那一刻生效，之后页面内切换演示身份不会被覆盖。
 */
export function consumeLoginIdentity() {
  try {
    const raw = localStorage.getItem(LOGIN_IDENTITY_KEY);
    if (!raw) return null;
    localStorage.removeItem(LOGIN_IDENTITY_KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function readSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (!saved?.token || !saved?.user) return null;
    if (saved.expiresInSeconds && saved.savedAt
      && Date.now() > saved.savedAt + saved.expiresInSeconds * 1000) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return saved;
  } catch {
    return null;
  }
}

export function persistSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

async function request(path, options = {}) {
  const {onUploadProgress,binary,...requestOptions}=options;
  const session = readSession();
  const isFormData = options.body instanceof FormData;
  const headers = { ...(isFormData ? {} : { 'Content-Type': 'application/json' }), ...(options.headers || {}) };
  if (session?.token) headers.Authorization = `Bearer ${session.token}`;
  let response;
  try {
    response = onUploadProgress?await uploadWithProgress(`${API_BASE}${path}`,{...requestOptions,headers},onUploadProgress):await fetch(`${API_BASE}${path}`, { ...requestOptions, headers });
  } catch(error) {
    if(error.name==='AbortError')throw error;
    throw new Error('无法连接后端服务，请确认 48083 端口的服务已启动');
  }
  if (binary && response.ok) {
    const disposition = response.headers.get('Content-Disposition') || '';
    const name = /(?:^|;\s*)filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
    if (!name) throw new Error('后端未返回导出文件，请刷新后重试');
    return { filename: decodeURIComponent(name), blob: await response.blob() };
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.code !== 0) {
    if (response.status === 401 && session && path !== '/auth/login') {
      clearSession();
      broadcastSession();
    }
    const error = new Error(payload.msg || `请求失败（${response.status}）`);
    error.status = response.status;
    throw error;
  }
  return payload.data;
}

export async function login(username, password) {
  const data = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  const session = {
    token: data.token,
    expiresInSeconds: data.expiresInSeconds,
    user: data.user,
    savedAt: Date.now(),
  };
  persistSession(session);
  broadcastSession();
  return session;
}

export async function fetchMe() {
  return request('/auth/me');
}

export function logout() {
  clearSession();
  broadcastSession();
}

export const api = {
  get: (path) => request(path),
  download: (path) => request(path, { binary: true }),
  post: (path, body) => request(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  delete: (path) => request(path, { method: 'DELETE' }),
  upload: (path, formData, options={}) => request(path, { ...options, method: 'POST', body: formData }),
};
