const SESSION_KEY = 'fep-rfq-auth';
const API_BASE = '/api/rfq';

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
  const session = readSession();
  const isFormData = options.body instanceof FormData;
  const headers = { ...(isFormData ? {} : { 'Content-Type': 'application/json' }), ...(options.headers || {}) };
  if (session?.token) headers.Authorization = `Bearer ${session.token}`;
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new Error('无法连接后端服务，请确认 48083 端口的服务已启动');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.code !== 0) {
    if (response.status === 401) clearSession();
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
  return session;
}

export async function fetchMe() {
  return request('/auth/me');
}

export function logout() {
  clearSession();
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  upload: (path, formData) => request(path, { method: 'POST', body: formData }),
};
