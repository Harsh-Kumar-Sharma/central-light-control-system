import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import LoginView from '../views/LoginView.vue';
import AppLayout from '../components/AppLayout.vue';
import DashboardView from '../views/DashboardView.vue';
import DevicesView from '../views/DevicesView.vue';
import ControlView from '../views/ControlView.vue';
import GroupsView from '../views/GroupsView.vue';
import StatusMonitoringView from '../views/StatusMonitoringView.vue';
import ConfigurationView from '../views/ConfigurationView.vue';
import UsersView from '../views/UsersView.vue';
import LogsView from '../views/LogsView.vue';
import SchedulesView from '../views/SchedulesView.vue';
import AlarmsView from '../views/AlarmsView.vue';
import ReportsView from '../views/ReportsView.vue';
const MapView = () => import('../views/MapView.vue'); // Leaflet is big: load it only when the map is opened
import SensorsView from '../views/SensorsView.vue';
import PlansView from '../views/PlansView.vue';
const PlanDetailView = () => import('../views/PlanDetailView.vue'); // drawing viewer: loaded when opened
import TunnelsView from '../views/TunnelsView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
    {
      path: '/',
      component: AppLayout,
      children: [
        { path: '', name: 'dashboard', component: DashboardView, meta: { perm: ['dashboard', 'view'] } },
        { path: 'devices', name: 'devices', component: DevicesView, meta: { perm: ['devices', 'view'] } },
        { path: 'plans', name: 'plans', component: PlansView, meta: { perm: ['plans', 'view'] } },
        { path: 'plans/:id(\\d+)', name: 'plan', component: PlanDetailView, meta: { perm: ['plans', 'view'] } },
        { path: 'sensors', name: 'sensors', component: SensorsView, meta: { perm: ['sensors', 'view'] } },
        { path: 'tunnels', name: 'tunnels', component: TunnelsView, meta: { perm: ['tunnels', 'view'] } },
        { path: 'map', name: 'map', component: MapView, meta: { perm: ['control', 'view'] } },
        { path: 'control', name: 'control', component: ControlView, meta: { perm: ['control', 'view'] } },
        { path: 'groups', name: 'groups', component: GroupsView, meta: { perm: ['groups', 'view'] } },
        { path: 'reports', name: 'reports', component: ReportsView, meta: { perm: ['reports', 'view'] } },
        { path: 'alarms', name: 'alarms', component: AlarmsView, meta: { perm: ['alarms', 'view'] } },
        { path: 'schedules', name: 'schedules', component: SchedulesView, meta: { perm: ['schedules', 'view'] } },
        { path: 'status', name: 'status', component: StatusMonitoringView, meta: { perm: ['status', 'view'] } },
        { path: 'configuration', name: 'configuration', component: ConfigurationView, meta: { perm: ['configuration', 'view'] } },
        { path: 'users', name: 'users', component: UsersView, meta: { perm: ['users', 'view'] } },
        { path: 'logs', name: 'logs', component: LogsView, meta: { perm: ['logs', 'view'] } },
      ],
    },
  ],
});

// UX convenience only — the Node.js backend's requireAuth/requireRole
// middleware is the real security boundary (SRS §11.2 SEC-003), not this guard.
// First page this user may open (used when they land somewhere they can't use).
const HOME_ORDER = ['dashboard', 'control', 'devices', 'groups', 'plans', 'tunnels', 'sensors', 'schedules', 'alarms', 'reports', 'status', 'logs', 'configuration', 'users'];

router.beforeEach(async (to) => {
  const auth = useAuthStore();

  if (!to.meta.public && !auth.isAuthenticated) {
    return { name: 'login' };
  }
  if (to.name === 'login' && auth.isAuthenticated) {
    return { name: 'dashboard' };
  }
  if (auth.isAuthenticated && !auth.user?.permissions) {
    try {
      await auth.refresh(); // session saved before permissions existed
    } catch {
      auth.token = null; // dead session: the 401 handler already logged out
      return { name: 'login' };
    }
  }
  if (to.meta.perm && !auth.can(...to.meta.perm)) {
    const home = HOME_ORDER.find((n) => auth.can(n === 'dashboard' ? 'dashboard' : n, 'view'));
    return home && home !== to.name ? { name: home } : { name: 'login' };
  }
  return true;
});

export default router;
