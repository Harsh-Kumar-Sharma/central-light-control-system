// Module x action permissions. The catalog below is the single source of truth:
// the API checks against it and GET /api/permissions/catalog sends it to the UI.
export const MODULES = {
  dashboard:     { label: 'Dashboard',     actions: { view: 'View' } },
  devices:       { label: 'Devices',       actions: { view: 'View', create: 'Add', edit: 'Edit', delete: 'Delete', test: 'Test / ping' } },
  control:       { label: 'Control',       actions: { view: 'View map', control: 'Switch lights', design: 'Design roads' } },
  sensors:       { label: 'Sensors',       actions: { view: 'View', configure: 'Manage alarm rules' } },
  tunnels:       { label: 'Tunnels',       actions: { view: 'View', create: 'Create', edit: 'Edit zones', delete: 'Delete', control: 'Switch mode' } },
  reports:       { label: 'Reports',       actions: { view: 'View', export: 'Download CSV', configure: 'Set tariff' } },
  alarms:        { label: 'Alarms',        actions: { view: 'View', acknowledge: 'Acknowledge' } },
  schedules:     { label: 'Schedules',     actions: { view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete', run: 'Run now' } },
  groups:        { label: 'Groups',        actions: { view: 'View', create: 'Create', control: 'Send to group' } },
  status:        { label: 'Status',        actions: { view: 'View', edit: 'Edit polling' } },
  logs:          { label: 'Logs',          actions: { view: 'View own', view_all: 'View everyone\'s' } },
  configuration: { label: 'Configuration', actions: { view: 'View', edit: 'Edit' } },
  users:         { label: 'Users',         actions: { view: 'View', create: 'Create', edit: 'Edit / permissions' } },
};

const all = () => Object.fromEntries(Object.entries(MODULES).map(([m, d]) => [m, Object.keys(d.actions)]));

export const ROLE_DEFAULTS = {
  Admin: all(),
  Operator: {
    dashboard: ['view'],
    devices: ['view', 'test'],
    control: ['view', 'control'],
    groups: ['view', 'control'],
    sensors: ['view'],
    tunnels: ['view', 'control'],
    reports: ['view', 'export'],
    alarms: ['view', 'acknowledge'],
    schedules: ['view', 'run'],
    status: ['view'],
    logs: ['view'],
  },
  User: {
    dashboard: ['view'],
    devices: ['view'],
    control: ['view'],
    groups: ['view'],
    alarms: ['view'],
    sensors: ['view'],
    tunnels: ['view'],
    schedules: ['view'],
    status: ['view'],
  },
};

// Drop anything that is not in the catalog, so a bad payload can't store junk.
export function sanitize(input) {
  const out = {};
  for (const [mod, actions] of Object.entries(input ?? {})) {
    if (!MODULES[mod] || !Array.isArray(actions)) continue;
    const valid = actions.filter((a) => a in MODULES[mod].actions);
    if (valid.length) out[mod] = [...new Set(valid)];
  }
  return out;
}

// Admin: always everything. Otherwise the user's override if set, else the role template.
export function effective(role, stored) {
  if (role === 'Admin') return all();
  const override = typeof stored === 'string' ? JSON.parse(stored) : stored;
  return override ? sanitize(override) : (ROLE_DEFAULTS[role] ?? {});
}

export const has = (perms, mod, action) => Boolean(perms?.[mod]?.includes(action));
