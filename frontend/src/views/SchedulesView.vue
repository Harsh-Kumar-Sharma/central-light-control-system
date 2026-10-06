<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { schedulesApi, roadsApi, groupsApi, devicesApi, tunnelsApi } from '../api/resources.js';
import { useAuthStore } from '../stores/auth.js';
import Modal from '../components/Modal.vue';

const auth = useAuthStore();
const canCreate = computed(() => auth.can('schedules', 'create'));
const canEdit = computed(() => auth.can('schedules', 'edit'));
const canDelete = computed(() => auth.can('schedules', 'delete'));
const canRun = computed(() => auth.can('schedules', 'run'));

const schedules = ref([]);
const runs = ref([]);
const settings = ref({ latitude: null, longitude: null, timezone: 'Asia/Kolkata' });
const sun = ref(null);
const targets = reactive({ road: [], group: [], receiver: [], tunnel: [] });
const loading = ref(true);
const error = ref('');
const notice = ref('');
const now = ref(Date.now());

const messageOf = (err, fallback) => err.response?.data?.error?.message ?? fallback;
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

async function load() {
  const [list, st, r] = await Promise.all([schedulesApi.list(), schedulesApi.settings(), schedulesApi.runs()]);
  schedules.value = list.schedules;
  settings.value = st.settings;
  sun.value = st.sun;
  runs.value = r;
}

let clock = null;
let refresh = null;
onMounted(async () => {
  try {
    await load();
    const [roads, groups, devices, tunnels] = await Promise.all([roadsApi.list(), groupsApi.list(), devicesApi.list(), auth.can('tunnels') ? tunnelsApi.list().catch(() => []) : Promise.resolve([])]);
    targets.tunnel = tunnels.map((x) => ({ id: x.id, name: x.name }));
    targets.road = roads.map((x) => ({ id: x.id, name: x.name }));
    targets.group = groups.map((x) => ({ id: x.id, name: x.name }));
    targets.receiver = devices.map((x) => ({ id: x.id, name: x.device_name }));
  } catch (err) {
    error.value = messageOf(err, 'Could not load schedules');
  } finally {
    loading.value = false;
  }
  clock = setInterval(() => { now.value = Date.now(); }, 30_000);
  refresh = setInterval(() => { if (!document.hidden) load().catch(() => {}); }, 30_000);
});
onBeforeUnmount(() => { clearInterval(clock); clearInterval(refresh); });

/* ---------- display helpers ---------- */
const tz = computed(() => settings.value.timezone);
const clockIn = (iso) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: tz.value, hour: '2-digit', minute: '2-digit' });
const dayIn = (iso) => new Date(iso).toLocaleDateString('en-GB', { timeZone: tz.value, weekday: 'short', day: 'numeric', month: 'short' });
const todayKey = () => new Date(now.value).toLocaleDateString('en-CA', { timeZone: tz.value });
function whenText(iso) {
  if (!iso) return null;
  const sameDay = new Date(iso).toLocaleDateString('en-CA', { timeZone: tz.value }) === todayKey();
  const mins = Math.max(0, Math.round((new Date(iso).getTime() - now.value) / 60000));
  const left = mins < 60 ? `${mins} min` : mins < 1440 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${Math.round(mins / 1440)} d`;
  return `${sameDay ? 'Today' : dayIn(iso)} ${clockIn(iso)} · in ${left}`;
}
const ago = (iso) => {
  const s = Math.max(0, Math.round((now.value - new Date(iso).getTime()) / 1000));
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};
const triggerText = (s) => {
  if (s.trigger_type === 'time') return `At ${s.time_of_day}`;
  const off = Number(s.offset_minutes);
  const base = s.trigger_type === 'sunrise' ? 'sunrise' : 'sunset';
  if (!off) return `At ${base}`;
  return `${Math.abs(off)} min ${off < 0 ? 'before' : 'after'} ${base}`;
};
const MODE_LABEL = { day: 'Day', evening: 'Evening', night: 'Night', off: 'Off' };
const actionText = (s) => {
  if (s.action === 'tunnel_mode') return `Tunnel → ${MODE_LABEL[s.mode] ?? s.mode} mode`;
  if (s.action === 'brightness') return `Set brightness ${s.brightness}%`;
  const rel = s.relay === 'both' ? 'both relays' : `relay ${s.relay}`;
  return `Turn ${s.action === 'on' ? 'ON' : 'OFF'} · ${rel}`;
};
const targetText = (s) => `${({ receiver: 'Light', road: 'Road', group: 'Group', tunnel: 'Tunnel' })[s.target_type]}: ${s.target_name ?? 'deleted'}`;
const daysList = (s) => DAYS.map((d, i) => ({ d: d[0], on: s.days[i] === '1', title: d }));
const everyDay = (s) => s.days === '1111111';

/* ---------- toggle / run / delete ---------- */
async function guard(fn, fallback) {
  error.value = '';
  notice.value = '';
  try { await fn(); } catch (err) { error.value = messageOf(err, fallback); }
}
const toggle = (s) => guard(async () => { await schedulesApi.update(s.id, { enabled: !s.enabled }); await load(); }, 'Could not update the schedule');

const running = ref(null);
const runNow = (s) => guard(async () => {
  running.value = s.id;
  try {
    const r = await schedulesApi.run(s.id);
    notice.value = r.note ?? `"${s.name}" ran: ${r.ok} of ${r.total} lights confirmed${r.failed ? `, ${r.failed} did not` : ''}${r.skipped ? `, ${r.skipped} disabled skipped` : ''}.`;
    await load();
  } finally { running.value = null; }
}, 'Could not run the schedule');

const del = reactive({ open: false, item: null, busy: false });
const askDelete = (s) => { del.item = s; del.open = true; };
async function confirmDelete() {
  del.busy = true;
  await guard(async () => { await schedulesApi.remove(del.item.id); del.open = false; await load(); }, 'Could not delete the schedule');
  del.busy = false;
}

/* ---------- create / edit ---------- */
const blank = () => ({ id: null, name: '', target_type: 'road', target_id: '', action: 'on', relay: 'both', brightness: 50, trigger_type: 'sunset', time_of_day: '18:30', offset: 0, offsetDir: 'after', days: '1111111', enabled: true, mode: 'night' });
const form = reactive({ open: false, saving: false, error: '', ...blank() });

function openForm(s) {
  const off = s ? Number(s.offset_minutes) : 0;
  Object.assign(form, blank(), s ? {
    id: s.id, name: s.name, target_type: s.target_type, target_id: s.target_id, action: s.action, relay: s.relay,
    brightness: s.brightness ?? 50, trigger_type: s.trigger_type, time_of_day: s.time_of_day ?? '18:30',
    offset: Math.abs(off), offsetDir: off < 0 ? 'before' : 'after', days: s.days, enabled: s.enabled, mode: s.mode ?? 'night',
  } : { target_id: targets.road[0]?.id ?? '' }, { open: true, saving: false, error: '' });
}
const toggleDay = (i) => {
  const a = form.days.split('');
  a[i] = a[i] === '1' ? '0' : '1';
  form.days = a.join('');
};
const onTargetType = () => {
  form.target_id = targets[form.target_type][0]?.id ?? '';
  // A tunnel is switched with a mode; everything else with on / off / brightness.
  if (form.target_type === 'tunnel') form.action = 'tunnel_mode';
  else if (form.action === 'tunnel_mode') form.action = 'on';
};
const targetOptions = computed(() => targets[form.target_type]);

async function save() {
  form.saving = true;
  form.error = '';
  const signed = (form.offsetDir === 'before' ? -1 : 1) * Number(form.offset || 0);
  const payload = {
    name: form.name,
    target_type: form.target_type,
    target_id: Number(form.target_id),
    action: form.action,
    mode: form.action === 'tunnel_mode' ? form.mode : undefined,
    relay: form.relay,
    brightness: form.action === 'brightness' ? Number(form.brightness) : null,
    trigger_type: form.trigger_type,
    time_of_day: form.trigger_type === 'time' ? form.time_of_day : null,
    offset_minutes: form.trigger_type === 'time' ? 0 : signed,
    days: form.days,
    enabled: form.enabled,
  };
  try {
    if (form.id) await schedulesApi.update(form.id, payload);
    else await schedulesApi.create(payload);
    form.open = false;
    await load();
  } catch (err) {
    form.error = messageOf(err, 'Could not save the schedule');
  } finally {
    form.saving = false;
  }
}

/* ---------- site location ---------- */
const loc = reactive({ open: false, saving: false, error: '', latitude: '', longitude: '', timezone: 'Asia/Kolkata', locating: false });
const hasLocation = computed(() => settings.value.latitude != null && settings.value.longitude != null);
function openLocation() {
  Object.assign(loc, {
    open: true, saving: false, error: '',
    latitude: settings.value.latitude ?? '', longitude: settings.value.longitude ?? '', timezone: settings.value.timezone,
  });
}
function useMyLocation() {
  if (!navigator.geolocation) { loc.error = 'This browser cannot give a location. Type the numbers in.'; return; }
  loc.locating = true;
  navigator.geolocation.getCurrentPosition(
    (p) => { loc.latitude = Number(p.coords.latitude.toFixed(4)); loc.longitude = Number(p.coords.longitude.toFixed(4)); loc.locating = false; },
    () => { loc.error = 'Could not get the location (permission denied?). Type the numbers in.'; loc.locating = false; },
    { timeout: 8000 },
  );
}
async function saveLocation() {
  loc.saving = true;
  loc.error = '';
  try {
    await schedulesApi.updateSettings({ latitude: loc.latitude === '' ? null : Number(loc.latitude), longitude: loc.longitude === '' ? null : Number(loc.longitude), timezone: loc.timezone });
    loc.open = false;
    await load();
  } catch (err) {
    loc.error = messageOf(err, 'Could not save the location');
  } finally {
    loc.saving = false;
  }
}
const timezones = computed(() => {
  const list = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return list.includes(loc.timezone) ? list : [loc.timezone, ...list];
});

const runClass = (r) => (r.failed ? 'amber' : r.total === 0 ? 'gray' : 'green');
</script>

<template>
  <div>
    <div class="page-header">
      <div>
        <h2>Schedules</h2>
        <p>Switch lights automatically at a set time, or at sunrise and sunset.</p>
      </div>
      <div class="head-actions">
        <button v-if="canEdit" class="btn secondary" data-action="location" @click="openLocation">⌖ Location &amp; time zone</button>
        <button v-if="canCreate" class="btn" data-action="new-schedule" @click="openForm()">+ New schedule</button>
      </div>
    </div>

    <div v-if="error" class="alert error">{{ error }}</div>
    <div v-if="notice" class="alert success">{{ notice }}</div>

    <div class="sun-card" :class="{ missing: !hasLocation }">
      <template v-if="hasLocation && sun">
        <span class="sun-item"><b>☀ Sunrise</b> {{ sun.sunrise ?? '—' }}</span>
        <span class="sun-item"><b>☾ Sunset</b> {{ sun.sunset ?? '—' }}</span>
        <span class="muted">today · {{ settings.timezone }} · {{ settings.latitude }}, {{ settings.longitude }}</span>
      </template>
      <template v-else>
        <span><b>Site location not set.</b> Sunrise and sunset schedules stay idle until you set it.</span>
        <button v-if="canEdit" class="btn sm" @click="openLocation">Set location</button>
      </template>
    </div>

    <div v-if="loading" class="card"><p class="muted">Loading…</p></div>

    <div v-else-if="!schedules.length" class="card empty-state">
      <h2>No schedules yet</h2>
      <p class="muted">For example: “Turn the whole highway ON at sunset” and “OFF at sunrise”, so nobody has to press a button.</p>
      <button v-if="canCreate" class="btn" @click="openForm()">+ Create your first schedule</button>
    </div>

    <div v-else class="list">
      <article v-for="s in schedules" :key="s.id" class="sched" :class="{ off: !s.enabled }" :data-id="s.id">
        <div class="s-main">
          <div class="s-top">
            <h3>{{ s.name }}</h3>
            <span class="badge" :class="s.action === 'on' ? 'green' : s.action === 'off' ? 'gray' : 'amber'">{{ actionText(s) }}</span>
          </div>
          <div class="s-meta">
            <span class="pill">⏱ {{ triggerText(s) }}</span>
            <span class="pill">{{ targetText(s) }}</span>
            <span class="days" :title="everyDay(s) ? 'Every day' : 'Selected days'">
              <i v-for="(d, i) in daysList(s)" :key="i" :class="{ on: d.on }" :title="d.title">{{ d.d }}</i>
            </span>
          </div>
          <div class="s-when">
            <template v-if="!s.enabled"><span class="muted">Paused</span></template>
            <template v-else-if="s.needs_location"><span class="warn">Needs the site location (see above)</span></template>
            <template v-else-if="s.next_run_at"><span>Next: <b>{{ whenText(s.next_run_at) }}</b></span></template>
            <template v-else><span class="muted">No upcoming run</span></template>
            <span v-if="s.last_run" class="muted last">
              · Last: {{ ago(s.last_run.ran_at) }}
              <span class="badge" :class="runClass(s.last_run)">{{ s.last_run.total === 0 ? 'nothing to do' : `${s.last_run.ok}/${s.last_run.total} ok` }}</span>
            </span>
          </div>
        </div>
        <div class="s-actions">
          <label v-if="canEdit" class="switch" :title="s.enabled ? 'Pause' : 'Enable'">
            <input type="checkbox" :checked="s.enabled" :aria-label="`${s.enabled ? 'Pause' : 'Enable'} ${s.name}`" @change="toggle(s)" />
            <span class="track" />
          </label>
          <button v-if="canRun" class="btn secondary sm" :disabled="running === s.id" data-action="run-now" @click="runNow(s)">{{ running === s.id ? 'Running…' : 'Run now' }}</button>
          <button v-if="canEdit" class="btn secondary sm" data-action="edit" @click="openForm(s)">Edit</button>
          <button v-if="canDelete" class="btn danger sm" data-action="delete" @click="askDelete(s)">Delete</button>
        </div>
      </article>
    </div>

    <div v-if="runs.length" class="card history">
      <div class="card-title"><h2>Recent runs</h2></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>When</th><th>Schedule</th><th>How</th><th>Lights</th><th>Result</th></tr></thead>
          <tbody>
            <tr v-for="r in runs" :key="r.id">
              <td>{{ ago(r.ran_at) }}</td>
              <td><strong>{{ r.schedule_name }}</strong></td>
              <td>{{ r.trigger_kind === 'auto' ? 'Automatic' : 'Run now' }}</td>
              <td>{{ r.total }}<span v-if="r.skipped" class="muted"> (+{{ r.skipped }} disabled)</span></td>
              <td><span class="badge" :class="runClass(r)">{{ r.note ? 'nothing to do' : `${r.ok} ok${r.failed ? `, ${r.failed} no reply` : ''}` }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="hint foot">Every command a schedule sends is also in Logs, under the role “Scheduler”.</p>
    </div>

    <!-- create / edit -->
    <Modal v-if="form.open" :title="form.id ? 'Edit schedule' : 'New schedule'" width="560px" @close="form.open = false">
      <form id="schedForm" class="stack" @submit.prevent="save">
        <div v-if="form.error" class="alert error">{{ form.error }}</div>

        <div class="field"><label for="sname">Name *</label><input id="sname" v-model="form.name" maxlength="100" placeholder="e.g. Highway ON at sunset" required /></div>

        <div class="two">
          <div class="field">
            <label for="stype">What to switch</label>
            <select id="stype" v-model="form.target_type" @change="onTargetType">
              <option value="road">A whole road</option>
              <option value="group">A group</option>
              <option value="receiver">One light</option>
              <option v-if="targets.tunnel.length || form.target_type === 'tunnel'" value="tunnel">A tunnel</option>
            </select>
          </div>
          <div class="field">
            <label for="starget">Which one *</label>
            <select id="starget" v-model="form.target_id" required>
              <option value="" disabled>Select…</option>
              <option v-for="t in targetOptions" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
          </div>
        </div>

        <div class="field">
          <label>Action</label>
          <div v-if="form.target_type !== 'tunnel'" class="seg" role="group" aria-label="Action">
            <button type="button" :class="{ on: form.action === 'on' }" @click="form.action = 'on'">Turn ON</button>
            <button type="button" :class="{ on: form.action === 'off' }" @click="form.action = 'off'">Turn OFF</button>
            <button type="button" :class="{ on: form.action === 'brightness' }" @click="form.action = 'brightness'">Set brightness</button>
          </div>
          <div v-else class="seg" role="group" aria-label="Tunnel mode">
            <button v-for="(label, m) in MODE_LABEL" :key="m" type="button" :class="{ on: form.mode === m }" :data-mode="m" @click="form.mode = m">{{ label }}</button>
          </div>
        </div>
        <div v-if="form.action === 'on' || form.action === 'off'" class="field">
          <label for="srelay">Relay</label>
          <select id="srelay" v-model="form.relay"><option value="both">Both relays</option><option value="1">Relay 1 only</option><option value="2">Relay 2 only</option></select>
        </div>
        <div v-else-if="form.action === 'brightness'" class="field">
          <label for="sbright">Brightness: {{ form.brightness }}%</label>
          <input id="sbright" v-model.number="form.brightness" type="range" min="1" max="99" />
        </div>

        <div class="field">
          <label>When</label>
          <div class="seg" role="group" aria-label="Trigger">
            <button type="button" :class="{ on: form.trigger_type === 'time' }" @click="form.trigger_type = 'time'">At a time</button>
            <button type="button" :class="{ on: form.trigger_type === 'sunrise' }" @click="form.trigger_type = 'sunrise'">☀ Sunrise</button>
            <button type="button" :class="{ on: form.trigger_type === 'sunset' }" @click="form.trigger_type = 'sunset'">☾ Sunset</button>
          </div>
        </div>
        <div v-if="form.trigger_type === 'time'" class="field">
          <label for="stime">Time ({{ settings.timezone }})</label>
          <input id="stime" v-model="form.time_of_day" type="time" required />
        </div>
        <div v-else class="two">
          <div class="field"><label for="soff">Minutes</label><input id="soff" v-model.number="form.offset" type="number" min="0" max="180" /></div>
          <div class="field">
            <label for="sdir">…</label>
            <select id="sdir" v-model="form.offsetDir"><option value="after">after {{ form.trigger_type }}</option><option value="before">before {{ form.trigger_type }}</option></select>
          </div>
        </div>
        <p v-if="form.trigger_type !== 'time' && !hasLocation" class="alert warn">The site location isn't set yet, so this won't run until you set it (Location &amp; time zone).</p>

        <div class="field">
          <label>Days</label>
          <div class="day-pick" role="group" aria-label="Days">
            <button v-for="(d, i) in DAYS" :key="d" type="button" :class="{ on: form.days[i] === '1' }" :aria-pressed="form.days[i] === '1'" @click="toggleDay(i)">{{ d }}</button>
          </div>
        </div>

        <label v-if="form.id" class="check"><input v-model="form.enabled" type="checkbox" /> Enabled</label>
        <p class="hint">Disabled lights are skipped. If you save a time that has already passed today, it first runs tomorrow.</p>
      </form>
      <template #footer>
        <button class="btn secondary" type="button" @click="form.open = false">Cancel</button>
        <button class="btn" type="submit" form="schedForm" :disabled="form.saving" data-action="save-schedule">{{ form.saving ? 'Saving…' : 'Save schedule' }}</button>
      </template>
    </Modal>

    <!-- location -->
    <Modal v-if="loc.open" title="Location & time zone" width="480px" @close="loc.open = false">
      <form id="locForm" class="stack" @submit.prevent="saveLocation">
        <div v-if="loc.error" class="alert error">{{ loc.error }}</div>
        <p class="hint">Sunrise and sunset are worked out from where the lights are. Clock-time schedules only need the time zone.</p>
        <div class="two">
          <div class="field"><label for="lat">Latitude</label><input id="lat" v-model="loc.latitude" type="number" step="any" min="-90" max="90" placeholder="28.6139" /></div>
          <div class="field"><label for="lon">Longitude</label><input id="lon" v-model="loc.longitude" type="number" step="any" min="-180" max="180" placeholder="77.2090" /></div>
        </div>
        <button type="button" class="btn secondary sm" :disabled="loc.locating" @click="useMyLocation">{{ loc.locating ? 'Locating…' : 'Use this computer\'s location' }}</button>
        <div class="field">
          <label for="tzsel">Time zone</label>
          <select id="tzsel" v-model="loc.timezone"><option v-for="z in timezones" :key="z" :value="z">{{ z }}</option></select>
        </div>
      </form>
      <template #footer>
        <button class="btn secondary" type="button" @click="loc.open = false">Cancel</button>
        <button class="btn" type="submit" form="locForm" :disabled="loc.saving">{{ loc.saving ? 'Saving…' : 'Save' }}</button>
      </template>
    </Modal>

    <!-- delete -->
    <Modal v-if="del.open" title="Delete this schedule?" width="420px" @close="del.open = false">
      <p>Delete <strong>{{ del.item?.name }}</strong>? Lights stay as they are; it just won't run any more.</p>
      <template #footer>
        <button class="btn secondary" @click="del.open = false">Cancel</button>
        <button class="btn danger" :disabled="del.busy" @click="confirmDelete">{{ del.busy ? 'Deleting…' : 'Delete' }}</button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.head-actions { display: flex; gap: 0.6rem; flex-wrap: wrap; }
.muted { color: var(--text-muted); }
.sun-card { display: flex; align-items: center; gap: 1.2rem; flex-wrap: wrap; padding: 0.7rem 1rem; margin-bottom: 1rem; border-radius: var(--radius); background: var(--accent-soft); color: var(--accent-fg); border: 1px solid var(--border); }
.sun-card.missing { background: var(--amber-soft); color: var(--amber-fg); }
.sun-card .muted { color: inherit; opacity: 0.8; font-size: 0.85rem; }
.sun-item b { margin-right: 0.35rem; }

.list { display: flex; flex-direction: column; gap: 0.8rem; margin-bottom: 1.25rem; }
.sched { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; padding: 1rem 1.2rem; background: var(--surface); border: 1px solid var(--border); border-left: 4px solid var(--primary); border-radius: var(--radius); box-shadow: var(--shadow); }
.sched.off { border-left-color: var(--border); opacity: 0.75; }
.s-main { display: flex; flex-direction: column; gap: 0.45rem; min-width: 0; flex: 1 1 380px; }
.s-top { display: flex; align-items: center; gap: 0.7rem; flex-wrap: wrap; }
.s-top h3 { font-size: 1.05rem; }
.s-meta { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.pill { padding: 0.15rem 0.6rem; border-radius: 999px; background: var(--surface-2); border: 1px solid var(--border); font-size: 0.82rem; }
.days { display: inline-flex; gap: 3px; }
.days i { width: 22px; height: 22px; display: grid; place-items: center; border-radius: 6px; font-style: normal; font-size: 0.7rem; font-weight: 700; background: var(--surface-2); color: var(--text-muted); opacity: 0.55; }
.days i.on { background: var(--primary-soft); color: var(--primary); opacity: 1; }
.s-when { font-size: 0.88rem; display: flex; gap: 0.4rem; flex-wrap: wrap; align-items: center; }
.s-when .warn { color: var(--amber-fg); font-weight: 600; }
.s-actions { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }

.switch { position: relative; display: inline-block; width: 42px; height: 24px; cursor: pointer; }
.switch input { position: absolute; opacity: 0; inset: 0; width: 100%; height: 100%; margin: 0; cursor: pointer; z-index: 1; }
.switch .track { position: absolute; inset: 0; border-radius: 999px; background: var(--border); transition: background 0.15s; }
.switch .track::after { content: ''; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: var(--surface); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35); transition: transform 0.15s; }
.switch input:checked + .track { background: var(--primary); }
.switch input:checked + .track::after { transform: translateX(18px); background: var(--on-primary); }
.switch input:focus-visible + .track { outline: 2px solid var(--primary); outline-offset: 2px; }

.empty-state { text-align: center; padding: 3rem 1rem; }
.empty-state p { max-width: 480px; margin: 0.6rem auto 1.2rem; }
.history .foot { margin: 0.8rem 0 0; }

.stack { display: flex; flex-direction: column; gap: 0.9rem; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; }
@media (max-width: 520px) { .two { grid-template-columns: 1fr; } }
.seg { display: flex; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.seg button { flex: 1; border: 0; background: var(--surface-2); color: var(--text-muted); font: inherit; font-weight: 600; padding: 0.5rem 0.4rem; cursor: pointer; border-right: 1px solid var(--border); }
.seg button:last-child { border-right: 0; }
.seg button.on { background: var(--primary); color: var(--on-primary); }
.day-pick { display: flex; gap: 0.35rem; flex-wrap: wrap; }
.day-pick button { padding: 0.35rem 0.7rem; border-radius: 8px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text-muted); font: inherit; font-weight: 600; font-size: 0.85rem; cursor: pointer; }
.day-pick button.on { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
.check { display: inline-flex; align-items: center; gap: 0.5rem; cursor: pointer; }
.check input { accent-color: var(--primary); width: 16px; height: 16px; padding: 0; }
input[type='range'] { padding: 0; accent-color: var(--primary); }
</style>
