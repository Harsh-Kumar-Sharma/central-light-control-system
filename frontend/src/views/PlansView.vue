<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { plansApi } from '../api/resources.js';
import { useAuthStore } from '../stores/auth.js';
import { useMiniPlan } from '../stores/miniPlan.js';
import { forgetGeometry } from '../utils/planCache.js';
import Modal from '../components/Modal.vue';
import MapTabs from '../components/plan/MapTabs.vue';

const router = useRouter();
const auth = useAuthStore();
const mini = useMiniPlan();
const canCreate = computed(() => auth.can('plans', 'create'));
const canDelete = computed(() => auth.can('plans', 'delete'));

const plans = ref([]);
const receiverCount = ref(0);
const loading = ref(true);
const error = ref('');
const notice = ref('');

async function load() {
  try {
    const d = await plansApi.list();
    plans.value = d.plans;
    receiverCount.value = d.receiver_count;
    error.value = '';
  } catch (err) {
    error.value = err.response?.data?.error?.message ?? 'Could not load the plans';
  } finally {
    loading.value = false;
  }
}
onMounted(load);

/* ---------- upload ---------- */
const fileInput = ref(null);
const dragOver = ref(false);
const up = reactive({ open: false, file: null, name: '', busy: false, stage: '', progress: 0, error: '' });
const MAX_MB = 40;

function pick(file) {
  if (!file) return;
  if (!/\.(dwg|dxf)$/i.test(file.name)) { error.value = 'Choose a .dwg or .dxf file.'; return; }
  if (file.size > MAX_MB * 1024 * 1024) { error.value = `That file is ${(file.size / 1048576).toFixed(0)} MB. The limit is ${MAX_MB} MB.`; return; }
  error.value = '';
  Object.assign(up, { open: true, file, name: file.name.replace(/\.[^.]+$/, ''), busy: false, stage: '', progress: 0, error: '' });
}
const onFile = (e) => { pick(e.target.files?.[0]); e.target.value = ''; };
const onDrop = (e) => { dragOver.value = false; if (canCreate.value) pick(e.dataTransfer.files?.[0]); };

async function startUpload() {
  up.busy = true;
  up.error = '';
  up.stage = 'Uploading';
  up.progress = 0;
  try {
    const r = await plansApi.upload(up.file, up.name.trim() || up.file.name, (p) => {
      if (p !== null) up.progress = p;
      if (p === 1) up.stage = 'Converting the drawing';
    });
    up.open = false;
    notice.value = `Uploaded. ${r.layers} layers found${r.hiddenByDefault ? `, ${r.hiddenByDefault} hidden because the file marks them off` : ''}.`;
    await load();
    router.push(`/plans/${r.id}`);
  } catch (err) {
    up.error = err.response?.data?.error?.message ?? (err.code === 'ECONNABORTED' ? 'This took too long. Try a smaller file.' : 'Upload failed');
    up.busy = false;
  }
}

/* ---------- list actions ---------- */
const pinned = (p) => mini.planId === p.id;
function pin(p) { if (pinned(p)) mini.close(); else mini.pin(p.id); }

const del = reactive({ open: false, plan: null, busy: false, error: '' });
async function confirmDelete() {
  del.busy = true;
  del.error = '';
  try {
    await plansApi.remove(del.plan.id);
    forgetGeometry(del.plan.id);
    if (mini.planId === del.plan.id) mini.close();
    del.open = false;
    await load();
  } catch (err) {
    del.error = err.response?.data?.error?.message ?? 'Could not delete';
  }
  del.busy = false;
}

const size = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const when = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const shapes = (p) => Object.values(p.stats?.drawn ?? {}).reduce((n, v) => n + v, 0);
</script>

<template>
  <div
    @dragover.prevent="canCreate && (dragOver = true)"
    @dragleave.self="dragOver = false"
    @drop.prevent="onDrop"
  >
    <MapTabs />
    <div class="page-header">
      <div>
        <h2>Plans</h2>
        <p>Upload a project's CAD drawing (DWG or DXF), then place the lights on it and control them from the drawing.</p>
      </div>
      <div v-if="canCreate">
        <input ref="fileInput" type="file" accept=".dwg,.dxf" hidden @change="onFile" />
        <button class="btn" data-action="upload" @click="fileInput.click()">+ Upload drawing</button>
      </div>
    </div>

    <div v-if="error" class="alert error">{{ error }}</div>
    <div v-if="notice" class="alert success">{{ notice }}</div>

    <div v-if="loading" class="card"><p class="muted">Loading…</p></div>

    <div v-else-if="!plans.length" class="card empty" :class="{ over: dragOver }">
      <h2>No drawings yet</h2>
      <p class="muted">Upload the project's DWG or DXF. The roads, chainage marks, culverts and labels in it appear on screen, and you can pin each light to its spot on the drawing.</p>
      <button v-if="canCreate" class="btn" @click="fileInput.click()">+ Upload your first drawing</button>
      <p v-if="canCreate" class="muted small">or drop the file here · up to {{ MAX_MB }} MB</p>
    </div>

    <div v-else class="grid-cards" :class="{ over: dragOver }">
      <article v-for="p in plans" :key="p.id" class="plan" :data-plan="p.id">
        <header>
          <span class="type">{{ p.source_type.toUpperCase() }}</span>
          <router-link :to="`/plans/${p.id}`" class="name">{{ p.name }}</router-link>
        </header>
        <dl>
          <div><dt>File</dt><dd :title="p.source_name">{{ p.source_name }}</dd></div>
          <div><dt>Size</dt><dd>{{ size(p.size_bytes) }}<template v-if="p.units"> · {{ p.units }}</template></dd></div>
          <div><dt>Drawn</dt><dd>{{ shapes(p).toLocaleString() }} shapes · {{ (p.stats?.drawn?.text ?? 0).toLocaleString() }} labels</dd></div>
          <div><dt>Lights placed</dt><dd><b>{{ p.light_count }}</b> of {{ receiverCount }}</dd></div>
          <div><dt>Uploaded</dt><dd>{{ when(p.created_at) }}</dd></div>
        </dl>
        <footer>
          <router-link :to="`/plans/${p.id}`" class="btn sm">Open</router-link>
          <button class="btn secondary sm" :data-pin="p.id" @click="pin(p)">{{ pinned(p) ? '✓ Pinned as mini map' : 'Pin as mini map' }}</button>
          <button v-if="canDelete" class="btn danger sm" @click="del.plan = p; del.error = ''; del.open = true">Delete</button>
        </footer>
      </article>
    </div>

    <p v-if="canCreate && plans.length" class="muted small drop-hint">You can also drop a DWG/DXF file anywhere on this page.</p>

    <Modal v-if="up.open" title="Upload drawing" width="500px" @close="!up.busy && (up.open = false)">
      <form id="upForm" class="stack" @submit.prevent="startUpload">
        <div v-if="up.error" class="alert error">{{ up.error }}</div>
        <div class="file-line"><span class="type">{{ up.file.name.split('.').pop().toUpperCase() }}</span> {{ up.file.name }} <span class="muted">· {{ size(up.file.size) }}</span></div>
        <div class="field"><label for="pname">Plan name *</label><input id="pname" v-model="up.name" maxlength="150" :disabled="up.busy" required /></div>
        <div v-if="up.busy" class="progress-wrap" role="status">
          <div class="bar"><i :style="{ width: (up.stage === 'Uploading' ? up.progress * 100 : 100) + '%' }" :class="{ pulse: up.stage !== 'Uploading' }" /></div>
          <span>{{ up.stage }}…</span>
        </div>
        <p v-else class="hint">The file is converted once on the server, so large drawings can take a few seconds.</p>
      </form>
      <template #footer>
        <button class="btn secondary" type="button" :disabled="up.busy" @click="up.open = false">Cancel</button>
        <button class="btn" type="submit" form="upForm" :disabled="up.busy" data-action="start-upload">{{ up.busy ? 'Working…' : 'Upload' }}</button>
      </template>
    </Modal>

    <Modal v-if="del.open" title="Delete this plan?" width="440px" @close="del.open = false">
      <div v-if="del.error" class="alert error">{{ del.error }}</div>
      <p>Delete <strong>{{ del.plan?.name }}</strong>? The drawing and where the lights stand on it are removed. The lights themselves are not touched.</p>
      <template #footer>
        <button class="btn secondary" @click="del.open = false">Cancel</button>
        <button class="btn danger" :disabled="del.busy" @click="confirmDelete">{{ del.busy ? 'Deleting…' : 'Delete' }}</button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.muted { color: var(--text-muted); }
.small { font-size: 0.85rem; }
.empty { text-align: center; padding: 3rem 1.2rem; border: 2px dashed var(--border); }
.empty.over, .grid-cards.over { outline: 3px dashed var(--primary); outline-offset: 4px; }
.empty p { max-width: 520px; margin: 0.6rem auto 1.2rem; }
.grid-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1rem; }
.plan { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); padding: 1rem 1.1rem; display: flex; flex-direction: column; gap: 0.7rem; }
.plan header { display: flex; align-items: center; gap: 0.6rem; min-width: 0; }
.name { font-size: 1.05rem; font-weight: 800; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.type { flex: none; padding: 0.1rem 0.5rem; border-radius: 6px; background: var(--primary-soft); color: var(--primary); font-size: 0.72rem; font-weight: 800; letter-spacing: 0.04em; }
dl { margin: 0; display: grid; gap: 0.3rem; }
dl div { display: flex; justify-content: space-between; gap: 1rem; font-size: 0.86rem; }
dt { color: var(--text-muted); }
dd { margin: 0; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 62%; }
.plan footer { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: auto; padding-top: 0.3rem; }
.drop-hint { margin-top: 1rem; }
.stack { display: flex; flex-direction: column; gap: 0.9rem; }
.file-line { padding: 0.6rem 0.8rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px; word-break: break-all; }
.progress-wrap { display: flex; flex-direction: column; gap: 0.4rem; font-size: 0.9rem; }
.bar { height: 10px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 999px; overflow: hidden; }
.bar i { display: block; height: 100%; background: var(--primary); transition: width 0.2s; }
.bar i.pulse { animation: pulse 1.1s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 0.45; } 50% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .bar i.pulse { animation: none; } }
</style>
