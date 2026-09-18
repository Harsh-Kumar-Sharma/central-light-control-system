import { apiClient } from './client.js';

export const dashboardApi = {
  summary: () => apiClient.get('/dashboard/summary').then((r) => r.data),
};

export const transmittersApi = {
  list: () => apiClient.get('/transmitters').then((r) => r.data.transmitters),
  create: (payload) => apiClient.post('/transmitters', payload).then((r) => r.data),
};

export const devicesApi = {
  list: () => apiClient.get('/devices').then((r) => r.data.devices),
  create: (payload) => apiClient.post('/devices', payload).then((r) => r.data),
  update: (id, payload) => apiClient.put(`/devices/${id}`, payload).then((r) => r.data),
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
