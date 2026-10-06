import { defineStore } from 'pinia';
import axios from 'axios';

// Route guards below are a UX convenience only — the real security boundary
// is the Node.js backend's requireAuth/requireRole middleware (SRS §11.2 SEC-003).
export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('token') ?? null,
    user: JSON.parse(localStorage.getItem('user') ?? 'null'),
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.token),
    role: (state) => state.user?.role ?? null,
    // can('devices', 'edit') — mirrors the server's module x action check (UX only).
    can: (state) => (module, action = 'view') => Boolean(state.user?.permissions?.[module]?.includes(action)),
  },
  actions: {
    async login(username, password) {
      const { data } = await axios.post('/api/auth/login', { username, password });
      this.token = data.token;
      this.user = data.user;
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
    },
    // Re-read role + permissions from the server (they can change while logged in,
    // and sessions saved before permissions existed don't have them).
    async refresh() {
      const { data } = await axios.get('/api/auth/me', { headers: { Authorization: `Bearer ${this.token}` } });
      this.user = data.user;
      localStorage.setItem('user', JSON.stringify(data.user));
    },
    async logout() {
      this.token = null;
      this.user = null;
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // Clearing state alone leaves the user on the current page; go to login now.
      // Imported lazily because the router itself imports this store.
      const { default: router } = await import('../router/index.js');
      if (router.currentRoute.value.name !== 'login') await router.replace({ name: 'login' });
    },
  },
});
