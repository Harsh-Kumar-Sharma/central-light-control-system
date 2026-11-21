import { apiClient } from './client.js';

export const plansApi = {
  list: () => apiClient.get('/plans').then((r) => r.data),
  get: (id) => apiClient.get('/plans/' + id).then((r) => r.data.plan),
  // The server sends the drawing gzip-compressed; the browser unpacks it.
  geometry: (id) => apiClient.get('/plans/' + id + '/geometry', { timeout: 120000 }).then((r) => r.data),
  upload: (file, name, onProgress) => file.arrayBuffer().then((buf) => apiClient.post('/plans/upload', buf, {
    headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name), 'X-Plan-Name': encodeURIComponent(name) },
    timeout: 300000,
    maxBodyLength: Infinity,
    onUploadProgress: (e) => onProgress?.(e.total ? e.loaded / e.total : null),
  }).then((r) => r.data)),
  rename: (id, name) => apiClient.put('/plans/' + id, { name }).then((r) => r.data),
  setLayers: (id, hidden) => apiClient.put('/plans/' + id + '/layers', { hidden }).then((r) => r.data),
  remove: (id) => apiClient.delete('/plans/' + id).then((r) => r.data),
  lights: (id) => apiClient.get('/plans/' + id + '/lights').then((r) => r.data),
  setLight: (id, receiverId, pos) => apiClient.put('/plans/' + id + '/lights/' + receiverId, pos).then((r) => r.data),
};

export const sensorsApi = {
  latest: () => apiClient.get('/sensors/latest').then((r) => r.data),
  history: (params) => apiClient.get('/sensors/history', { params }).then((r) => r.data),
  rules: () => apiClient.get('/sensors/rules').then((r) => r.data.rules),
  createRule: (payload) => apiClient.post('/sensors/rules', payload).then((r) => r.data),
  updateRule: (id, payload) => apiClient.put('/sensors/rules/' + id, payload).then((r) => r.data),
  removeRule: (id) => apiClient.delete('/sensors/rules/' + id).then((r) => r.data),
};

export const tunnelsApi = {
  list: () => apiClient.get('/tunnels').then((r) => r.data.tunnels),
  create: (payload) => apiClient.post('/tunnels', payload).then((r) => r.data),
  update: (id, payload) => apiClient.put('/tunnels/' + id, payload).then((r) => r.data),
  remove: (id) => apiClient.delete('/tunnels/' + id).then((r) => r.data),
  setZones: (id, zones) => apiClient.put('/tunnels/' + id + '/zones', { zones }).then((r) => r.data),
  setMode: (id, mode) => apiClient.post('/tunnels/' + id + '/mode', { mode }).then((r) => r.data),
};

export const mapApi = {
  lights: () => apiClient.get('/map/lights').then((r) => r.data),
  setPosition: (id, payload) => apiClient.put('/map/lights/' + id + '/position', payload).then((r) => r.data),
  setRoadPath: (id, points) => apiClient.put('/map/roads/' + id + '/path', { points }).then((r) => r.data),
};

export const reportsApi = {
  overview: (params) => apiClient.get('/reports/overview', { params }).then((r) => r.data),
  settings: () => apiClient.get('/reports/settings').then((r) => r.data),
  updateSettings: (payload) => apiClient.put('/reports/settings', payload).then((r) => r.data),
  // Downloads a CSV through the authenticated client and hands it to the browser as a file.
  async download(kind, params) {
    const res = await apiClient.get('/reports/export', { params: { ...params, kind }, responseType: 'blob' });
    const name = /filename="([^"]+)"/.exec(res.headers['content-disposition'] ?? '')?.[1] ?? kind + '.csv';
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

export const alarmsApi = {
  summary: () => apiClient.get('/alarms/summary').then((r) => r.data),
  list: (state = 'open') => apiClient.get('/alarms', { params: { state } }).then((r) => r.data.alarms),
  acknowledge: (id) => apiClient.post('/alarms/' + id + '/acknowledge').then((r) => r.data),
  acknowledgeAll: () => apiClient.post('/alarms/acknowledge-all').then((r) => r.data),
};

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
  statusAll: () => apiClient.get('/devices/status/all').then((r) => r.data.statuses),
  status: (id) => apiClient.get(`/devices/${id}/status`).then((r) => r.data.status),
  sendCommand: (id, payload) => apiClient.post(`/devices/${id}/commands`, payload).then((r) => r.data),
};

export const groupsApi = {
  list: () => apiClient.get('/groups').then((r) => r.data.groups),
  get: (id) => apiClient.get(`/groups/${id}`).then((r) => r.data),
  create: (payload) => apiClient.post('/groups', payload).then((r) => r.data),
  update: (id, payload) => apiClient.put(`/groups/${id}`, payload).then((r) => r.data),
  remove: (id) => apiClient.delete(`/groups/${id}`).then((r) => r.data),
  sendCommand: (id, payload) => apiClient.post(`/groups/${id}/commands`, payload).then((r) => r.data),
};

export const auditApi = {
  list: (limit = 100) => apiClient.get('/audit', { params: { limit } }).then((r) => r.data.commands),
};

export const usersApi = {
  list: () => apiClient.get('/users').then((r) => r.data.users),
  create: (payload) => apiClient.post('/users', payload).then((r) => r.data),
  update: (id, payload) => apiClient.put(`/users/${id}`, payload).then((r) => r.data),
  catalog: () => apiClient.get('/users/permission-catalog').then((r) => r.data),
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

export const schedulesApi = {
  list: () => apiClient.get('/schedules').then((r) => r.data),
  runs: () => apiClient.get('/schedules/runs').then((r) => r.data.runs),
  settings: () => apiClient.get('/schedules/settings').then((r) => r.data),
  updateSettings: (payload) => apiClient.put('/schedules/settings', payload).then((r) => r.data),
  create: (payload) => apiClient.post('/schedules', payload).then((r) => r.data),
  update: (id, payload) => apiClient.put('/schedules/' + id, payload).then((r) => r.data),
  remove: (id) => apiClient.delete('/schedules/' + id).then((r) => r.data),
  run: (id) => apiClient.post('/schedules/' + id + '/run').then((r) => r.data),
};
