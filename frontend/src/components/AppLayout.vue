<script setup>
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';

const auth = useAuthStore();
const route = useRoute();

const isAdmin = computed(() => auth.role === 'Admin');
const canControl = computed(() => auth.role === 'Admin' || auth.role === 'Operator');

// Inline SVG paths (24x24, stroke icons) — no icon dependency needed.
const icons = {
  dashboard: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  devices: 'M4 6h16M4 12h16M4 18h16',
  control: 'M12 2v10m6.4-6.4a9 9 0 11-12.8 0',
  groups: 'M17 20h5v-2a4 4 0 00-5-3.9M9 11a4 4 0 100-8 4 4 0 000 8zm8 0a3 3 0 100-6M2 20v-2a4 4 0 014-4h6a4 4 0 014 4v2',
  status: 'M3 12h4l3-8 4 16 3-8h4',
  config: 'M12 15a3 3 0 100-6 3 3 0 000 6zm7.4-3a7.4 7.4 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 00-2-1.2L14.5 3h-4l-.4 2.6a7.5 7.5 0 00-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 000 2.4l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 002 1.2l.4 2.6h4l.4-2.6a7.5 7.5 0 002-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
  users: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm13 10v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8',
  logs: 'M9 12h6M9 16h6M9 8h2M7 3h7l5 5v13H7z',
};

const links = computed(() => [
  { to: '/', label: 'Dashboard', icon: 'dashboard', show: true },
  { to: '/devices', label: 'Devices', icon: 'devices', show: true },
  { to: '/control', label: 'Control', icon: 'control', show: true },
  { to: '/groups', label: 'Groups', icon: 'groups', show: canControl.value },
  { to: '/status', label: 'Status', icon: 'status', show: true },
  { to: '/logs', label: 'Logs', icon: 'logs', show: canControl.value },
  { to: '/configuration', label: 'Configuration', icon: 'config', show: isAdmin.value },
  { to: '/users', label: 'Users', icon: 'users', show: isAdmin.value },
].filter((l) => l.show));

const pageTitle = computed(() => links.value.find((l) => l.to === route.path)?.label ?? 'Dashboard');

const dark = ref(document.documentElement.dataset.theme === 'dark');
function toggleTheme() {
  dark.value = !dark.value;
  const theme = dark.value ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('theme', theme); } catch { /* ignore */ }
}

const initial = computed(() => (auth.user?.username ?? '?').charAt(0).toUpperCase());
</script>

<template>
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 22h4M12 2a7 7 0 00-4 12.7c.6.5 1 1.2 1 2V17h6v-.3c0-.8.4-1.5 1-2A7 7 0 0012 2z" /></svg>
        </div>
        <div>
          <div class="brand-name">Highway LED</div>
          <div class="brand-sub">Control &amp; Monitoring</div>
        </div>
      </div>

      <nav>
        <router-link v-for="l in links" :key="l.to" :to="l.to" class="nav-link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path :d="icons[l.icon]" /></svg>
          <span>{{ l.label }}</span>
        </router-link>
      </nav>

      <div class="sidebar-foot">LoRa · MQTT · MySQL</div>
    </aside>

    <div class="main-col">
      <header class="topbar">
        <h1>{{ pageTitle }}</h1>
        <div class="top-actions">
          <button class="icon-btn" :title="dark ? 'Light theme' : 'Dark theme'" @click="toggleTheme">
            <svg v-if="!dark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" /></svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4l1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4l1.4-1.4" /></svg>
          </button>
          <div class="user">
            <div class="avatar">{{ initial }}</div>
            <div class="user-meta">
              <div class="user-name">{{ auth.user?.username }}</div>
              <span class="badge blue">{{ auth.role }}</span>
            </div>
          </div>
          <button class="btn secondary sm" @click="auth.logout()">Sign out</button>
        </div>
      </header>
      <main class="content">
        <router-view />
      </main>
    </div>
  </div>
</template>

<style scoped>
.shell { display: flex; min-height: 100vh; }

.sidebar {
  width: 248px; flex: none; background: var(--sidebar-bg); color: var(--sidebar-text);
  display: flex; flex-direction: column; padding: 1.2rem 0.85rem; position: sticky; top: 0; height: 100vh;
}
.brand { display: flex; align-items: center; gap: 0.75rem; padding: 0.25rem 0.5rem 1.4rem; }
.logo {
  width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center; color: #fff;
  background: linear-gradient(135deg, #f59e0b, #ef4444 60%, #ec4899);
  box-shadow: 0 6px 16px rgba(239, 68, 68, 0.4);
}
.logo svg { width: 24px; height: 24px; }
.brand-name { color: #fff; font-weight: 800; font-size: 1.05rem; }
.brand-sub { font-size: 0.75rem; opacity: 0.75; }

nav { display: flex; flex-direction: column; gap: 0.2rem; }
.nav-link {
  display: flex; align-items: center; gap: 0.75rem; padding: 0.62rem 0.8rem; border-radius: 10px;
  color: var(--sidebar-text); font-weight: 600; transition: background 0.15s, color 0.15s;
}
.nav-link svg { width: 20px; height: 20px; flex: none; }
.nav-link:hover { background: rgba(255, 255, 255, 0.09); color: #fff; }
.nav-link.router-link-exact-active {
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0.08));
  color: #fff; box-shadow: inset 3px 0 0 #fbbf24;
}
.sidebar-foot { margin-top: auto; font-size: 0.72rem; opacity: 0.55; text-align: center; padding-top: 1rem; }

.main-col { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.topbar {
  display: flex; align-items: center; justify-content: space-between; gap: 1rem;
  padding: 0.85rem 1.6rem; background: var(--surface); border-bottom: 1px solid var(--border);
  position: sticky; top: 0; z-index: 5;
}
.topbar h1 { font-size: 1.25rem; }
.top-actions { display: flex; align-items: center; gap: 0.9rem; }
.icon-btn {
  width: 38px; height: 38px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface-2);
  color: var(--text); display: grid; place-items: center; cursor: pointer;
}
.icon-btn:hover { background: var(--primary-soft); color: var(--primary); }
.icon-btn svg { width: 19px; height: 19px; }
.user { display: flex; align-items: center; gap: 0.6rem; }
.avatar {
  width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; color: #fff; font-weight: 800;
  background: linear-gradient(135deg, var(--primary), var(--teal));
}
.user-name { font-weight: 700; line-height: 1.1; margin-bottom: 0.15rem; }
.content { padding: 1.6rem; max-width: 1400px; width: 100%; }

@media (max-width: 860px) {
  .sidebar { width: 68px; padding-inline: 0.5rem; }
  .brand > div:last-child, .nav-link span, .sidebar-foot { display: none; }
  .nav-link { justify-content: center; }
  .user-meta { display: none; }
  .content { padding: 1rem; }
}
</style>
