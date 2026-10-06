<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { alarmsApi } from '../api/resources.js';
import { useAuthStore } from '../stores/auth.js';

const auth = useAuthStore();
const canAck = computed(() => auth.can('alarms', 'acknowledge'));

const tab = ref('open');
const alarms = ref([]);
const loading = ref(true);
const error = ref('');
const now = ref(Date.now());

async function load() {
  try {
    alarms.value = await alarmsApi.list(tab.value);
    error.value = '';
  } catch (err) {
    error.value = err.response?.data?.error?.message ?? 'Could not load alarms';
  } finally {
    loading.value = false;
  }
}
function setTab(t) { tab.value = t; loading.value = true; load(); }

let timer = null;
let clock = null;
onMounted(() => {
  load();
  timer = setInterval(() => { if (!document.hidden) load(); }, 10000);
  clock = setInterval(() => { now.value = Date.now(); }, 30000);
});
onBeforeUnmount(() => { clearInterval(timer); clearInterval(clock); });

const ago = (iso) => {
  const s = Math.max(0, Math.round((now.value - new Date(iso).getTime()) / 1000));
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};
const newCount = computed(() => alarms.value.filter((a) => a.status === 'active').length);
const linkFor = (a) => {
  if (a.schedule_id) return { to: '/schedules', label: 'Open schedules' };
  if (a.type === 'tunnel_failed') return { to: '/tunnels', label: 'Open tunnels' };
  if (a.type === 'sensor_rule') return { to: '/sensors', label: 'Open sensors' };
  return { to: '/devices', label: 'Open devices' };
};

async function ack(a) {
  try { await alarmsApi.acknowledge(a.id); await load(); } catch (err) { error.value = err.response?.data?.error?.message ?? 'Could not acknowledge'; }
}
async function ackAll() {
  try { await alarmsApi.acknowledgeAll(); await load(); } catch (err) { error.value = err.response?.data?.error?.message ?? 'Could not acknowledge'; }
}
</script>

<template>
  <div>
    <div class="page-header">
      <div>
        <h2>Alarms</h2>
        <p>Problems that need attention. They clear by themselves once the problem goes away.</p>
      </div>
      <button v-if="canAck && tab === 'open' && newCount" class="btn secondary" data-action="ack-all" @click="ackAll">Acknowledge all ({{ newCount }})</button>
    </div>

    <div class="tabs" role="tablist">
      <button role="tab" :class="{ on: tab === 'open' }" :aria-selected="tab === 'open'" @click="setTab('open')">Open</button>
      <button role="tab" :class="{ on: tab === 'resolved' }" :aria-selected="tab === 'resolved'" @click="setTab('resolved')">History</button>
    </div>

    <div v-if="error" class="alert error">{{ error }}</div>
    <div v-if="loading" class="card"><p class="muted">Loading…</p></div>

    <div v-else-if="!alarms.length" class="card clear">
      <div class="ok-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10" /></svg></div>
      <h2>{{ tab === 'open' ? 'All clear' : 'Nothing in the history yet' }}</h2>
      <p class="muted">{{ tab === 'open' ? 'No lights or transmitters need attention right now.' : 'Resolved alarms will show up here.' }}</p>
    </div>

    <div v-else class="list">
      <article v-for="a in alarms" :key="a.id" class="alarm" :class="[a.severity, { done: a.status === 'resolved' }]" :data-id="a.id">
        <span class="bar" />
        <div class="body">
          <div class="top">
            <h3>{{ a.title }}</h3>
            <span class="badge" :class="a.severity === 'critical' ? 'red' : 'amber'">{{ a.severity }}</span>
            <span v-if="a.status === 'active'" class="badge blue">new</span>
            <span v-else-if="a.status === 'acknowledged'" class="badge gray">acknowledged<template v-if="a.acknowledged_by"> by {{ a.acknowledged_by }}</template></span>
            <span v-else class="badge green">resolved</span>
          </div>
          <p v-if="a.detail" class="detail">{{ a.detail }}</p>
          <div class="meta muted">
            Raised {{ ago(a.raised_at) }}
            <template v-if="a.resolved_at"> · resolved {{ ago(a.resolved_at) }}</template>
            <template v-if="a.status !== 'resolved'"> · <router-link :to="linkFor(a).to">{{ linkFor(a).label }}</router-link></template>
          </div>
        </div>
        <button v-if="canAck && a.status === 'active'" class="btn secondary sm" data-action="ack" @click="ack(a)">Acknowledge</button>
      </article>
    </div>
  </div>
</template>

<style scoped>
.muted { color: var(--text-muted); }
.tabs { display: inline-flex; gap: 0.25rem; padding: 0.25rem; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 1rem; }
.tabs button { border: 0; background: transparent; color: var(--text-muted); font: inherit; font-weight: 700; padding: 0.45rem 1.1rem; border-radius: 9px; cursor: pointer; }
.tabs button.on { background: var(--primary); color: var(--on-primary); }

.list { display: flex; flex-direction: column; gap: 0.7rem; }
.alarm { display: flex; align-items: center; gap: 1rem; padding: 0.9rem 1.1rem 0.9rem 0; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); overflow: hidden; }
.alarm .bar { align-self: stretch; width: 5px; background: var(--amber); flex: none; }
.alarm.critical .bar { background: var(--offline); }
.alarm.done { opacity: 0.7; }
.alarm.done .bar { background: var(--online); }
.body { flex: 1; min-width: 0; }
.top { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.top h3 { font-size: 1rem; }
.detail { margin: 0.25rem 0 0; font-size: 0.9rem; }
.meta { margin-top: 0.3rem; font-size: 0.8rem; }

.clear { text-align: center; padding: 3rem 1rem; }
.clear p { margin: 0.4rem 0 0; }
.ok-ico { width: 54px; height: 54px; margin: 0 auto 0.8rem; border-radius: 50%; display: grid; place-items: center; background: var(--green-soft); color: var(--green-fg); }
.ok-ico svg { width: 28px; height: 28px; }
</style>
