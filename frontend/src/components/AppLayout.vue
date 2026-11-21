<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { alarmsApi } from '../api/resources.js';
import BrandLogo from './BrandLogo.vue';
import ThemeToggle from './ThemeToggle.vue';
import CopyrightLine from './CopyrightLine.vue';
import MiniPlan from './plan/MiniPlan.vue';

const auth = useAuthStore();
const route = useRoute();


// Inline SVG paths (24x24, stroke icons) — no icon dependency needed.
const icons = {
  dashboard: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  devices: 'M4 6h16M4 12h16M4 18h16',
  control: 'M12 2v10m6.4-6.4a9 9 0 11-12.8 0',
  groups: 'M17 20h5v-2a4 4 0 00-5-3.9M9 11a4 4 0 100-8 4 4 0 000 8zm8 0a3 3 0 100-6M2 20v-2a4 4 0 014-4h6a4 4 0 014 4v2',
  plans: 'M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3V7zM9 4v13M15 7v13',
  sensors: 'M14 14.76V3.5a2.5 2.5 0 00-5 0v11.26a4.5 4.5 0 105 0z',
  tunnels: 'M3 20V12a9 9 0 0118 0v8M7 20v-8a5 5 0 0110 0v8',
  map: 'M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11zM12 12a2 2 0 100-4 2 2 0 000 4z',
  reports: 'M4 20V10m6 10V4m6 16v-7m6 7H2',
  alarms: 'M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0zM12 9v4m0 4h.01',
  schedules: 'M12 7v5l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z',
  status: 'M3 12h4l3-8 4 16 3-8h4',
  config: 'M12 15a3 3 0 100-6 3 3 0 000 6zm7.4-3a7.4 7.4 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 00-2-1.2L14.5 3h-4l-.4 2.6a7.5 7.5 0 00-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 000 2.4l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 002 1.2l.4 2.6h4l.4-2.6a7.5 7.5 0 002-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
  users: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm13 10v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8',
  logs: 'M9 12h6M9 16h6M9 8h2M7 3h7l5 5v13H7z',
};

// Alarm count for the bell and the sidebar badge, refreshed while the tab is visible.
const alarms = ref({ unacknowledged: 0, open: 0, critical: 0 });
const alarmCount = computed(() => alarms.value.unacknowledged);
async function loadAlarms({ force = false } = {}) {
  if (!auth.can('alarms') || (document.hidden && !force)) return;
  try { alarms.value = await alarmsApi.summary(); } catch { /* the bell just keeps its last value */ }
}
let alarmTimer = null;
// The menu is built from the permissions saved at sign-in, so a feature added later (or a permission an Admin
// just changed) would stay hidden until the next login. Re-read them whenever the app opens, every minute,
// and when the tab is looked at again. A dead session is handled by the 401 handler.
async function syncPermissions({ force = false } = {}) {
  if (document.hidden && !force) return;
  try { await auth.refresh(); } catch { /* offline or session ended: keep what we have */ }
}
let permTimer = null;
onMounted(() => {
  loadAlarms({ force: true });
  alarmTimer = setInterval(loadAlarms, 15000);
  syncPermissions({ force: true });
  permTimer = setInterval(syncPermissions, 60000);
  window.addEventListener('focus', syncPermissions);
});
onBeforeUnmount(() => {
  clearInterval(alarmTimer);
  clearInterval(permTimer);
  window.removeEventListener('focus', syncPermissions);
});

const links = computed(() => [
  { to: '/', label: 'Dashboard', icon: 'dashboard', show: auth.can('dashboard') },
  { to: '/devices', label: 'Devices', icon: 'devices', show: auth.can('devices') },
  { to: '/control', label: 'Control', icon: 'control', show: auth.can('control') },
  { to: '/map', label: 'GPS map', icon: 'map', show: auth.can('control') },
  { to: '/plans', label: 'Plans', icon: 'plans', show: auth.can('plans') },
  { to: '/tunnels', label: 'Tunnels', icon: 'tunnels', show: auth.can('tunnels') },
  { to: '/sensors', label: 'Sensors', icon: 'sensors', show: auth.can('sensors') },
  { to: '/groups', label: 'Groups', icon: 'groups', show: auth.can('groups') },
  { to: '/reports', label: 'Reports', icon: 'reports', show: auth.can('reports') },
  { to: '/alarms', label: 'Alarms', icon: 'alarms', show: auth.can('alarms'), badge: alarmCount },
  { to: '/schedules', label: 'Schedules', icon: 'schedules', show: auth.can('schedules') },
  { to: '/status', label: 'Status', icon: 'status', show: auth.can('status') },
  { to: '/logs', label: 'Logs', icon: 'logs', show: auth.can('logs') },
  { to: '/configuration', label: 'Configuration', icon: 'config', show: auth.can('configuration') },
  { to: '/users', label: 'Users', icon: 'users', show: auth.can('users') },
].filter((l) => l.show));

const pageTitle = computed(() => links.value.find((l) => l.to === route.path || (l.to !== '/' && route.path.startsWith(l.to + '/')))?.label ?? 'Dashboard');
const initial = computed(() => (auth.user?.username ?? '?').charAt(0).toUpperCase());

// Phones and small tablets: the menu is a slide-in drawer opened from the hamburger button.
const menuOpen = ref(false);
const closeMenu = () => { menuOpen.value = false; };
watch(() => route.fullPath, closeMenu);
watch(menuOpen, (v) => { document.body.style.overflow = v ? 'hidden' : ''; });
const onKey = (e) => { if (e.key === 'Escape') closeMenu(); };
const onResize = () => { if (window.innerWidth > 860) closeMenu(); };
onMounted(() => { window.addEventListener('keydown', onKey); window.addEventListener('resize', onResize); });
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('resize', onResize);
  document.body.style.overflow = '';
});
</script>

<template>
  <div class="shell">
    <div v-if="menuOpen" class="scrim" aria-hidden="true" @click="closeMenu" />
    <aside id="app-menu" class="sidebar" :class="{ open: menuOpen }" aria-label="Main menu">
      <router-link to="/" class="brand" aria-label="ARS Highway LED Control — home">
        <BrandLogo :height="54" class="logo-full" />
        <span class="brand-sub">Highway LED Control</span>
      </router-link>
      <button type="button" class="menu-close" aria-label="Close menu" @click="closeMenu">✕</button>

      <nav>
        <router-link v-for="l in links" :key="l.to" :to="l.to" class="nav-link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path :d="icons[l.icon]" /></svg>
          <span>{{ l.label }}</span>
          <b v-if="l.badge?.value" class="nav-badge">{{ l.badge.value }}</b>
        </router-link>
      </nav>

      <div class="drawer-user">
        <div class="avatar">{{ initial }}</div>
        <div class="drawer-user-meta">
          <div class="user-name">{{ auth.user?.username }}</div>
          <span class="badge blue">{{ auth.role }}</span>
        </div>
        <button class="btn secondary sm" @click="auth.logout()">Sign out</button>
      </div>

      <div class="sidebar-foot"><CopyrightLine /></div>
    </aside>

    <div class="main-col">
      <header class="topbar">
        <button
          type="button"
          class="menu-btn"
          aria-label="Open menu"
          aria-controls="app-menu"
          :aria-expanded="menuOpen"
          @click="menuOpen = true"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <h1>{{ pageTitle }}</h1>
        <div class="top-actions">
          <router-link
            v-if="auth.can('alarms')"
            to="/alarms"
            class="bell"
            :class="{ hot: alarms.critical > 0, warm: alarms.critical === 0 && alarms.unacknowledged > 0 }"
            :aria-label="alarms.unacknowledged ? alarms.unacknowledged + ' new alarms' : 'Alarms'"
            :title="alarms.open ? alarms.open + ' open alarm(s)' : 'No open alarms'"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" /></svg>
            <b v-if="alarms.unacknowledged" class="bell-count">{{ alarms.unacknowledged > 99 ? '99+' : alarms.unacknowledged }}</b>
          </router-link>
          <ThemeToggle />
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
      <footer class="page-foot"><CopyrightLine /></footer>
      <MiniPlan v-if="auth.can('plans')" />
    </div>
  </div>
</template>

<style scoped>
.shell { display: flex; min-height: 100vh; }

.sidebar {
  width: 248px; flex: none; background: var(--sidebar-bg); color: var(--sidebar-text);
  display: flex; flex-direction: column; padding: 1.2rem 0.85rem 0.8rem; position: sticky; top: 0; height: 100vh; height: 100dvh;
  border-right: 1px solid rgba(150, 160, 255, 0.12); overflow: hidden;
}
.brand { flex: none; display: flex; flex-direction: column; align-items: flex-start; gap: 0.5rem; padding: 0.35rem 0.6rem 1.3rem; text-decoration: none; }
.brand:hover { text-decoration: none; }
.menu-btn, .menu-close, .drawer-user, .scrim { display: none; }
.brand-sub { color: var(--sidebar-text); font-size: 0.74rem; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 600; opacity: 0.85; }

/* The menu has grown to 15 entries: on a shorter window it scrolls inside the sidebar instead of spilling out of it. */
nav { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 0.2rem; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: rgba(150, 160, 255, 0.35) transparent; margin-right: -0.4rem; padding-right: 0.4rem; }
nav::-webkit-scrollbar { width: 6px; }
nav::-webkit-scrollbar-thumb { background: rgba(150, 160, 255, 0.35); border-radius: 6px; }
nav::-webkit-scrollbar-track { background: transparent; }
.nav-link { flex: none; }
@media (max-height: 820px) {
  .sidebar { padding-top: 0.8rem; }
  .brand { padding-bottom: 0.7rem; gap: 0.3rem; }
  .brand-sub { display: none; }
  .nav-link { padding-top: 0.5rem; padding-bottom: 0.5rem; }
}
@media (max-height: 640px) {
  .logo-full { height: 40px !important; width: auto; } /* beats the size set on the logo itself */
  .nav-link { padding-top: 0.38rem; padding-bottom: 0.38rem; }
}
.nav-link {
  display: flex; align-items: center; gap: 0.75rem; padding: 0.62rem 0.8rem; border-radius: 10px;
  color: var(--sidebar-text); font-weight: 600; transition: background 0.15s, color 0.15s;
}
.nav-link:hover { background: var(--sidebar-hover); color: #fff; text-decoration: none; }
.nav-link svg { width: 20px; height: 20px; flex: none; }
.nav-link.router-link-exact-active {
  background: linear-gradient(90deg, rgba(150, 160, 255, 0.28), rgba(150, 160, 255, 0.08));
  color: #fff; box-shadow: inset 3px 0 0 var(--sidebar-active-bar);
}
.nav-link:focus-visible { outline-color: #fff; }
.sidebar-foot { flex: none; margin-top: 0; padding: 0.7rem 0.4rem 0; border-top: 1px solid rgba(150, 160, 255, 0.12); font-size: 0.7rem; line-height: 1.4; text-align: center; opacity: 0.65; }

.main-col { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.topbar {
  display: flex; align-items: center; justify-content: space-between; gap: 1rem;
  padding: 0.85rem 1.6rem; background: var(--surface); border-bottom: 1px solid var(--border);
  position: sticky; top: 0; z-index: 5;
}
.topbar h1 { font-size: 1.25rem; }
.nav-badge { margin-left: auto; min-width: 20px; padding: 0 6px; height: 20px; border-radius: 999px; display: grid; place-items: center; font-size: 0.7rem; background: #ff5c7c; color: #0a1428; }
.bell { position: relative; width: 38px; height: 38px; display: grid; place-items: center; border-radius: 11px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text-muted); }
.bell:hover { color: var(--text); text-decoration: none; }
.bell svg { width: 19px; height: 19px; }
.bell.hot { color: var(--red-fg); background: var(--red-soft); border-color: transparent; }
.bell.warm { color: var(--amber-fg); background: var(--amber-soft); border-color: transparent; }
.bell-count { position: absolute; top: -6px; right: -6px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; display: grid; place-items: center; font-size: 0.68rem; background: var(--red); color: #fff; }
.top-actions { display: flex; align-items: center; gap: 0.9rem; }
.user { display: flex; align-items: center; gap: 0.6rem; }
.avatar {
  width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; color: var(--on-primary); font-weight: 800;
  background: linear-gradient(135deg, var(--primary), var(--accent));
}
.user-name { font-weight: 700; line-height: 1.1; margin-bottom: 0.15rem; }
.content { padding: 1.6rem; max-width: 1400px; width: 100%; flex: 1; }
.page-foot { padding: 1rem 1.6rem 1.3rem; text-align: center; font-size: 0.78rem; color: var(--text-muted); border-top: 1px solid var(--border); }

@media print {
  .sidebar, .topbar, .page-foot { display: none !important; }
  .content { padding: 0; max-width: none; }
}

/* Phones & small tablets: the menu becomes a slide-in drawer, the top bar a single tidy row. */
@media (max-width: 860px) {
  .sidebar {
    position: fixed; top: 0; bottom: 0; left: 0; z-index: 60; height: auto;
    width: min(290px, 86vw); padding-bottom: calc(0.8rem + env(safe-area-inset-bottom));
    transform: translateX(-102%); visibility: hidden;
    transition: transform 0.22s ease, visibility 0s linear 0.22s;
    box-shadow: none;
  }
  .sidebar.open { transform: none; visibility: visible; transition: transform 0.22s ease; box-shadow: 8px 0 40px rgba(0, 0, 0, 0.45); }
  .scrim { display: block; position: fixed; inset: 0; z-index: 55; background: rgba(8, 12, 30, 0.55); backdrop-filter: blur(2px); }
  .menu-close {
    display: grid; place-items: center; position: absolute; top: 0.75rem; right: 0.75rem; width: 40px; height: 40px;
    border: 0; border-radius: 10px; background: var(--sidebar-hover); color: #fff; font-size: 1.05rem; cursor: pointer;
  }
  .nav-link { padding-top: 0.75rem; padding-bottom: 0.75rem; min-height: 46px; }
  .drawer-user {
    flex: none; display: flex; align-items: center; gap: 0.6rem; padding: 0.8rem 0.4rem; margin-top: 0.4rem;
    border-top: 1px solid rgba(150, 160, 255, 0.12); color: #fff;
  }
  .drawer-user-meta { flex: 1; min-width: 0; }
  .drawer-user .user-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .menu-btn {
    display: grid; place-items: center; flex: none; width: 40px; height: 40px; border-radius: 11px; cursor: pointer;
    border: 1px solid var(--border); background: var(--surface-2); color: var(--text);
  }
  .menu-btn svg { width: 22px; height: 22px; }
  .topbar { padding: 0.6rem 0.8rem; gap: 0.6rem; }
  .topbar h1 { flex: 1; font-size: 1.1rem; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .top-actions { gap: 0.5rem; margin-left: auto; flex: none; }
  .top-actions .user, .top-actions > .btn { display: none; }
  .content { padding: 1rem; }
  .page-foot { padding-bottom: calc(1.3rem + env(safe-area-inset-bottom)); }
}
@media (max-width: 360px) {
  .topbar { padding-inline: 0.5rem; gap: 0.4rem; }
  .top-actions { gap: 0.35rem; }
}
</style>
