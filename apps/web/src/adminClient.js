import { api } from './authClient';

function qs(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') { search.set(key, String(value)); }
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

/** 平台管理接口。授权在服务端完成：系统管理员管全部，BU 管理员限本人事业部。 */
export const adminApi = {
  listBusinessUnits: (params) => api.get(`/admin/business-units${qs(params)}`),
  createBusinessUnit: (body) => api.post('/admin/business-units', body),
  renameBusinessUnit: (id, name) => api.patch(`/admin/business-units/${id}`, { name }),

  listUsers: (params) => api.get(`/admin/users${qs(params)}`),
  createUser: (body) => api.post('/admin/users', body),
  updateUser: (id, body) => api.patch(`/admin/users/${id}`, body),
  updateUserStatus: (id, status) => api.patch(`/admin/users/${id}/status`, { status }),
  resetPassword: (id, password) => api.post(`/admin/users/${id}/password`, { password }),
  assignRole: (id, buId, role) => api.post(`/admin/users/${id}/roles`, { buId, role }),
  revokeRole: (id, buId, role) => api.delete(`/admin/users/${id}/roles${qs({ buId, role })}`),
};

export const buIdsOf = (account) => [...new Set((account?.roles || []).map((role) => role.buId))];

export const managedBuIdsOf = (account) =>
  (account?.roles || []).filter((role) => role.role === 'BU_ADMIN').map((role) => role.buId);
