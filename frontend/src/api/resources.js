import { apiClient } from './client.js';

export const dashboardApi = {
  summary: () => apiClient.get('/dashboard/summary').then((r) => r.data),
};

export const transmittersApi = {
  list: () => apiClient.get('/transmitters').then((r) => r.data.transmitters),
  create: (payload) => apiClient.post('/transmitters', payload).then((r) => r.data),
  update: (id, payload) => apiClient.put(`/transmitters/${id}`, payload).then((r) => r.data),
  remove: (id) => apiClient.delete(`/transmitters/${id}`).then((r) => r.data),
  test: (id, payload) => apiClient.post(`/transmitters/${id}/test`, payload).then((r) => r.data),
  listCommands: (id) => apiClient.get(`/transmitters/${id}/commands`).then((r) => r.data.commands),
  addCommand: (id, payload) => apiClient.post(`/transmitters/${id}/commands`, payload).then((r) => r.data),
  updateCommand: (id, commandId, payload) => apiClient.put(`/transmitters/${id}/commands/${commandId}`, payload).then((r) => r.data),
  removeCommand: (id, commandId) => apiClient.delete(`/transmitters/${id}/commands/${commandId}`).then((r) => r.data),
};

export const devicesApi = {
  list: () => apiClient.get('/devices').then((r) => r.data.devices),
  create: (payload) => apiClient.post('/devices', payload).then((r) => r.data),
  update: (id, payload) => apiClient.put(`/devices/${id}`, payload).then((r) => r.data),
  remove: (id) => apiClient.delete(`/devices/${id}`).then((r) => r.data),
  refreshStatus: (id) => apiClient.post(`/devices/${id}/refresh-status`).then((r) => r.data),
  status: (id) => apiClient.get(`/devices/${id}/status`).then((r) => r.data.status),
  sendCommand: (id, payload) => apiClient.post(`/devices/${id}/commands`, payload).then((r) => r.data),
};

export const groupsApi = {
  list: () => apiClient.get('/groups').then((r) => r.data.groups),
  create: (payload) => apiClient.post('/groups', payload).then((r) => r.data),
  sendCommand: (id, payload) => apiClient.post(`/groups/${id}/commands`, payload).then((r) => r.data),
};

export const auditApi = {
  list: (limit = 100) => apiClient.get('/audit', { params: { limit } }).then((r) => r.data.commands),
};

export const usersApi = {
  list: () => apiClient.get('/users').then((r) => r.data.users),
  create: (payload) => apiClient.post('/users', payload).then((r) => r.data),
  update: (id, payload) => apiClient.put(`/users/${id}`, payload).then((r) => r.data),
};

export const statusMonitoringApi = {
  get: () => apiClient.get('/status-monitoring').then((r) => r.data.config),
  update: (payload) => apiClient.put('/status-monitoring', payload).then((r) => r.data.config),
};

export const roadsApi = {
  list: () => apiClient.get('/roads').then((r) => r.data.roads),
  get: (id) => apiClient.get(`/roads/${id}`).then((r) => r.data.road),
  live: (id) => apiClient.get(`/roads/${id}/live`).then((r) => r.data),
  create: (payload) => apiClient.post('/roads', payload).then((r) => r.data),
  update: (id, payload) => apiClient.put(`/roads/${id}`, payload).then((r) => r.data),
  remove: (id) => apiClient.delete(`/roads/${id}`).then((r) => r.data),
};
