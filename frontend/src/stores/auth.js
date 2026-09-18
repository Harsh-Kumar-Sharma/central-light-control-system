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
  },
  actions: {
    async login(username, password) {
      const { data } = await axios.post('/api/auth/login', { username, password });
      this.token = data.token;
      this.user = data.user;
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
    },
    logout() {
      this.token = null;
      this.user = null;
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    },
  },
});
