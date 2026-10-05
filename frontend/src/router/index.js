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

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
    {
      path: '/',
      component: AppLayout,
      children: [
        { path: '', name: 'dashboard', component: DashboardView },
        { path: 'devices', name: 'devices', component: DevicesView },
        { path: 'control', name: 'control', component: ControlView },
        { path: 'groups', name: 'groups', component: GroupsView, meta: { roles: ['Admin', 'Operator'] } },
        { path: 'status', name: 'status', component: StatusMonitoringView },
        { path: 'configuration', name: 'configuration', component: ConfigurationView, meta: { roles: ['Admin'] } },
        { path: 'users', name: 'users', component: UsersView, meta: { roles: ['Admin'] } },
        { path: 'logs', name: 'logs', component: LogsView, meta: { roles: ['Admin', 'Operator'] } },
      ],
    },
  ],
});

// UX convenience only — the Node.js backend's requireAuth/requireRole
// middleware is the real security boundary (SRS §11.2 SEC-003), not this guard.
router.beforeEach((to) => {
  const auth = useAuthStore();

  if (!to.meta.public && !auth.isAuthenticated) {
    return { name: 'login' };
  }
  if (to.name === 'login' && auth.isAuthenticated) {
    return { name: 'dashboard' };
  }
  if (to.meta.roles && !to.meta.roles.includes(auth.role)) {
    return { name: 'dashboard' };
  }
  return true;
});

export default router;
