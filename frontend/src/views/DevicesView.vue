<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { transmittersApi, devicesApi } from '../api/resources.js';
import { useAuthStore } from '../stores/auth.js';
import Modal from '../components/Modal.vue';
import DeviceTestModal from '../components/DeviceTestModal.vue';
import ReceiverControlModal from '../components/ReceiverControlModal.vue';

const auth = useAuthStore();
const canAdd = computed(() => auth.can('devices', 'create'));
const canEdit = computed(() => auth.can('devices', 'edit'));
const canDelete = computed(() => auth.can('devices', 'delete'));
const canTest = computed(() => auth.can('devices', 'test'));

const transmitters = ref([]);
const devices = ref([]);
const error = ref('');

const icons = {
  test: 'M5 12.5a10 10 0 0114 0M8.5 16a5 5 0 017 0M12 20h.01M2 9a15 15 0 0120 0',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z',
  bolt: 'M13 2L3 14h8l-1 8 10-12h-8l1-8z',
  trash: 'M3 6h18M8 6V4h8v2m-9 0l1 14h8l1-14M10 11v6M14 11v6',
};

async function load() {
  try {
    [transmitters.value, devices.value] = await Promise.all([transmittersApi.list(), devicesApi.list()]);
  } catch (err) {
    error.value = err.response?.data?.error?.message ?? 'Failed to load devices';
  }
}

// Connection badge: reflects the last ping / port check, NOT the record's
// Enabled flag (a wrong IP must never show up green).
function connection(t) {
  if (t.connection_mode === 'mqtt') return { cls: 'gray', text: 'MQTT (coming soon)', title: '' };
  if (t.last_test_ok === null || t.last_test_ok === undefined) return { cls: 'gray', text: 'Not tested', title: 'Use the Test button' };
  const when = t.last_test_at ? new Date(t.last_test_at).toLocaleString() : '';
  return t.last_test_ok
    ? { cls: 'green', text: `Reachable${t.last_test_latency_ms != null ? ` · ${t.last_test_latency_ms} ms` : ''}`, title: `Last test ${when}` }
    : { cls: 'red', text: 'Unreachable', title: `Last test ${when}` };
}

const orDash = (v) => (v === null || v === undefined || v === '' ? '—' : v);

/* ---------------- transmitter add / edit ---------------- */
const txModal = reactive({ open: false, editingId: null, saving: false, error: '' });
const txForm = reactive({
  name: '', junctionLocation: '', networkId: '', loraAddress: '', connectionMode: 'lan',
  ipAddress: '', port: '', gateway: '', subnetMask: '', lanLineEnding: 'none', enabled: true,
});

function openAddTx() {
  Object.assign(txForm, {
    name: '', junctionLocation: '', networkId: '', loraAddress: '', connectionMode: 'lan',
    ipAddress: '', port: '', gateway: '', subnetMask: '', lanLineEnding: 'none', enabled: true,
  });
  Object.assign(txModal, { open: true, editingId: null, saving: false, error: '' });
}

function openEditTx(t) {
  Object.assign(txForm, {
    name: t.name, junctionLocation: t.junction_location ?? '', networkId: t.network_id ?? '', loraAddress: t.lora_address ?? '',
    connectionMode: t.connection_mode, ipAddress: t.ip_address ?? '', port: t.port ?? '', gateway: t.gateway ?? '',
    subnetMask: t.subnet_mask ?? '', lanLineEnding: t.lan_line_ending ?? 'none', enabled: t.status === 'active',
  });
  Object.assign(txModal, { open: true, editingId: t.id, saving: false, error: '' });
}

const numOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

async function saveTx() {
  txModal.saving = true;
  txModal.error = '';
  const payload = {
    name: txForm.name,
    junctionLocation: txForm.junctionLocation,
    networkId: numOrNull(txForm.networkId),
    loraAddress: numOrNull(txForm.loraAddress),
    connectionMode: txForm.connectionMode,
    ipAddress: txForm.ipAddress,
    port: numOrNull(txForm.port),
    gateway: txForm.gateway,
    subnetMask: txForm.subnetMask,
    lanLineEnding: txForm.lanLineEnding,
  };
  try {
    if (txModal.editingId) {
      await transmittersApi.update(txModal.editingId, { ...payload, status: txForm.enabled ? 'active' : 'inactive' });
    } else {
      await transmittersApi.create(payload);
    }
    txModal.open = false;
    await load();
  } catch (err) {
    txModal.error = err.response?.data?.error?.message ?? 'Failed to save transmitter';
  } finally {
    txModal.saving = false;
  }
}

/* ---------------- receiver add / edit ---------------- */
const rxModal = reactive({ open: false, editingId: null, saving: false, error: '' });
const rxForm = reactive({
  deviceName: '', parentTransmitterId: '', loraAddress: '', networkId: '', location: '', enabled: true,
  relay1Name: '', relay2Name: '', statusCommand: '', relay1Watts: '', relay2Watts: '', latitude: '', longitude: '',
});

function openAddRx() {
  Object.assign(rxForm, {
    deviceName: '', parentTransmitterId: '', loraAddress: '', networkId: '', location: '', enabled: true,
    relay1Name: '', relay2Name: '', statusCommand: '', relay1Watts: '', relay2Watts: '', latitude: '', longitude: '',
  });
  Object.assign(rxModal, { open: true, editingId: null, saving: false, error: '' });
}

function openEditRx(d) {
  Object.assign(rxForm, {
    deviceName: d.device_name, parentTransmitterId: d.parent_transmitter_id, loraAddress: d.lora_address,
    networkId: d.network_id ?? '', location: d.location ?? '', enabled: d.status === 'active',
    relay1Name: d.relay1_name ?? '', relay2Name: d.relay2_name ?? '', statusCommand: d.status_command ?? '',
    relay1Watts: d.relay1_watts ?? '', relay2Watts: d.relay2_watts ?? '',
    latitude: d.latitude ?? '', longitude: d.longitude ?? '',
  });
  Object.assign(rxModal, { open: true, editingId: d.id, saving: false, error: '' });
}

async function saveRx() {
  rxModal.saving = true;
  rxModal.error = '';
  try {
    if (rxModal.editingId) {
      await devicesApi.update(rxModal.editingId, {
        deviceName: rxForm.deviceName,
        parentTransmitterId: Number(rxForm.parentTransmitterId),
        loraAddress: Number(rxForm.loraAddress),
        networkId: numOrNull(rxForm.networkId),
        location: rxForm.location,
        relay1Name: rxForm.relay1Name,
        relay2Name: rxForm.relay2Name,
        statusCommand: rxForm.statusCommand,
        relay1Watts: rxForm.relay1Watts,
        relay2Watts: rxForm.relay2Watts,
        latitude: rxForm.latitude,
        longitude: rxForm.longitude,
        status: rxForm.enabled ? 'active' : 'inactive',
      });
    } else {
      await devicesApi.create({
        deviceName: rxForm.deviceName,
        loraAddress: Number(rxForm.loraAddress),
        networkId: numOrNull(rxForm.networkId),
        parentTransmitterId: Number(rxForm.parentTransmitterId),
        location: rxForm.location || null,
        relay1Name: rxForm.relay1Name,
        relay2Name: rxForm.relay2Name,
        statusCommand: rxForm.statusCommand,
        relay1Watts: rxForm.relay1Watts,
        relay2Watts: rxForm.relay2Watts,
        latitude: rxForm.latitude,
        longitude: rxForm.longitude,
      });
    }
    rxModal.open = false;
    await load();
  } catch (err) {
    rxModal.error = err.response?.data?.error?.message ?? 'Failed to save receiver';
  } finally {
    rxModal.saving = false;
  }
}

/* ---------------- test / delete ---------------- */
const testTx = ref(null);
const controlRx = ref(null);
const controlTx = computed(() => transmitters.value.find((t) => t.id === controlRx.value?.parent_transmitter_id) ?? null);
const del = reactive({ item: null, kind: '', busy: false, error: '' });

function askDelete(kind, item) {
  Object.assign(del, { item, kind, busy: false, error: '' });
}

async function confirmDelete() {
  del.busy = true;
  del.error = '';
  try {
    if (del.kind === 'tx') await transmittersApi.remove(del.item.id);
    else await devicesApi.remove(del.item.id);
    del.item = null;
    await load();
  } catch (err) {
    del.error = err.response?.data?.error?.message ?? 'Delete failed';
  } finally {
    del.busy = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <div v-if="error" class="alert error">{{ error }}</div>

    <!-- ============ Transmitters ============ -->
    <div class="card">
      <div class="card-title">
        <h2>Transmitters</h2>
        <button v-if="canAdd" class="btn" @click="openAddTx">+ Add transmitter</button>
      </div>
      <p class="hint">
        <strong>Connection</strong> shows the result of the last Ping / Port test.
        <strong>Enabled</strong> only says whether this record is switched on — it does not mean the device is reachable.
      </p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th><th>Mode</th><th>Address</th><th>LoRa addr.</th><th>Connection</th><th>Status</th><th v-if="canTest">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in transmitters" :key="t.id">
              <td>
                <strong>{{ t.name }}</strong>
                <div class="sub">{{ orDash(t.junction_location) }}</div>
              </td>
              <td><span class="badge blue">{{ t.connection_mode.toUpperCase() }}</span></td>
              <td>
                <template v-if="t.connection_mode === 'lan'">
                  <strong>{{ t.ip_address ?? '—' }}</strong><span v-if="t.port">:{{ t.port }}</span>
                  <div class="sub">gw {{ orDash(t.gateway) }} · mask {{ orDash(t.subnet_mask) }}</div>
                </template>
                <span v-else class="sub">—</span>
              </td>
              <td>{{ orDash(t.lora_address) }}</td>
              <td><span class="badge" :class="connection(t).cls" :title="connection(t).title">{{ connection(t).text }}</span></td>
              <td><span class="badge" :class="t.status === 'active' ? 'green' : 'gray'">{{ t.status === 'active' ? 'Enabled' : 'Disabled' }}</span></td>
              <td v-if="canTest" class="acts">
                <button class="act" title="Test connection" :disabled="t.connection_mode !== 'lan'" @click="testTx = t">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path :d="icons.test" /></svg>
                </button>
                <button v-if="canEdit" class="act" title="Edit" @click="openEditTx(t)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path :d="icons.edit" /></svg>
                </button>
                <button v-if="canDelete" class="act danger" title="Delete" @click="askDelete('tx', t)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path :d="icons.trash" /></svg>
                </button>
              </td>
            </tr>
            <tr v-if="!transmitters.length"><td :colspan="canTest ? 7 : 6" class="empty">No transmitters yet.</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ============ Receivers ============ -->
    <div class="card">
      <div class="card-title">
        <h2>Receivers</h2>
        <button v-if="canAdd" class="btn" @click="openAddRx">+ Add receiver</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Transmitter</th><th>Network address</th><th>Network ID</th><th>Location</th><th>Status</th><th v-if="canTest">Actions</th></tr></thead>
          <tbody>
            <tr v-for="d in devices" :key="d.id">
              <td><strong>{{ d.device_name }}</strong></td>
              <td>{{ d.transmitter_name }}</td>
              <td><strong>{{ d.lora_address }}</strong></td>
              <td>{{ orDash(d.network_id) }}</td>
              <td>{{ orDash(d.location) }}</td>
              <td><span class="badge" :class="d.status === 'active' ? 'green' : 'gray'">{{ d.status === 'active' ? 'Enabled' : 'Disabled' }}</span></td>
              <td v-if="canTest" class="acts">
                <button class="act control" title="Send commands (relay / brightness)" @click="controlRx = d">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path :d="icons.bolt" /></svg>
                </button>
                <button v-if="canEdit" class="act" title="Edit" @click="openEditRx(d)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path :d="icons.edit" /></svg>
                </button>
                <button v-if="canDelete" class="act danger" title="Delete" @click="askDelete('rx', d)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path :d="icons.trash" /></svg>
                </button>
              </td>
            </tr>
            <tr v-if="!devices.length"><td :colspan="canTest ? 7 : 6" class="empty">No receivers yet.</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ============ Add / Edit transmitter ============ -->
    <Modal v-if="txModal.open" :title="txModal.editingId ? 'Edit transmitter' : 'Add transmitter'" width="640px" @close="txModal.open = false">
      <form id="txForm" class="mform" @submit.prevent="saveTx">
        <div v-if="txModal.error" class="alert error">{{ txModal.error }}</div>

        <div class="field full">
          <label>Connection mode</label>
          <div class="seg">
            <button type="button" :class="{ on: txForm.connectionMode === 'lan' }" @click="txForm.connectionMode = 'lan'">LAN (Ethernet / Wi-Fi)</button>
            <button type="button" disabled title="MQTT mode is coming next">MQTT · coming soon</button>
          </div>
        </div>

        <div class="field"><label>Name *</label><input v-model="txForm.name" required /></div>
        <div class="field"><label>Junction / location</label><input v-model="txForm.junctionLocation" /></div>
        <div class="field"><label>LoRa address</label><input v-model="txForm.loraAddress" type="number" min="0" /></div>
        <div class="field"><label>Network ID</label><input v-model="txForm.networkId" type="number" min="0" /></div>

        <template v-if="txForm.connectionMode === 'lan'">
          <div class="field"><label>IP address</label><input v-model="txForm.ipAddress" placeholder="192.168.1.50" /></div>
          <div class="field"><label>Port</label><input v-model="txForm.port" type="number" min="1" max="65535" placeholder="e.g. 80 or 502" /></div>
          <div class="field"><label>Gateway</label><input v-model="txForm.gateway" placeholder="192.168.1.1" /></div>
          <div class="field"><label>Subnet mask</label><input v-model="txForm.subnetMask" placeholder="255.255.255.0" /></div>
          <div class="field full">
            <label>Line ending sent after each command</label>
            <select v-model="txForm.lanLineEnding">
              <option value="none">None — send the command text exactly (e.g. Tx_1_R1ON)</option>
              <option value="lf">LF — new line after the command</option>
              <option value="crlf">CRLF — Windows-style new line after the command</option>
            </select>
          </div>
          <p class="hint full">These record how the device is configured. They are not pushed to the device; use <strong>Test</strong> to check it is reachable.</p>
        </template>

        <label v-if="txModal.editingId" class="check full"><input v-model="txForm.enabled" type="checkbox" /> Enabled (record is switched on)</label>
      </form>
      <template #footer>
        <button class="btn secondary" type="button" @click="txModal.open = false">Cancel</button>
        <button class="btn" type="submit" form="txForm" :disabled="txModal.saving">{{ txModal.saving ? 'Saving…' : 'Save' }}</button>
      </template>
    </Modal>

    <!-- ============ Add / Edit receiver ============ -->
    <Modal v-if="rxModal.open" :title="rxModal.editingId ? 'Edit receiver' : 'Add receiver'" @close="rxModal.open = false">
      <form id="rxForm" class="mform" @submit.prevent="saveRx">
        <div v-if="rxModal.error" class="alert error">{{ rxModal.error }}</div>
        <div class="field full"><label>Device name *</label><input v-model="rxForm.deviceName" required /></div>
        <div class="field full">
          <label>Parent transmitter *</label>
          <select v-model="rxForm.parentTransmitterId" required>
            <option disabled value="">Select…</option>
            <option v-for="t in transmitters" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
        </div>
        <div class="field"><label>Network address * <span class="muted">(the number in Tx_&lt;address&gt;_…)</span></label><input v-model="rxForm.loraAddress" type="number" min="0" max="65535" required /></div>
        <div class="field"><label>Network ID</label><input v-model="rxForm.networkId" type="number" min="0" /></div>
        <div class="field full"><label>Location</label><input v-model="rxForm.location" /></div>
        <div class="field"><label>Latitude</label><input v-model="rxForm.latitude" type="number" step="any" min="-90" max="90" placeholder="26.912400" /></div>
        <div class="field"><label>Longitude</label><input v-model="rxForm.longitude" type="number" step="any" min="-180" max="180" placeholder="75.787300" /></div>
        <span class="hint full" style="margin:0">Optional. Or place the light by clicking its spot on the GPS map.</span>
        <div class="field"><label>Relay 1 name</label><input v-model="rxForm.relay1Name" maxlength="64" placeholder="Relay 1" /></div>
        <div class="field"><label>Relay 2 name</label><input v-model="rxForm.relay2Name" maxlength="64" placeholder="Relay 2" /></div>
        <div class="field"><label>Relay 1 load (watts)</label><input v-model="rxForm.relay1Watts" type="number" min="0" max="65535" placeholder="e.g. 150" /></div>
        <div class="field"><label>Relay 2 load (watts)</label><input v-model="rxForm.relay2Watts" type="number" min="0" max="65535" placeholder="e.g. 150" /></div>
        <span class="hint full" style="margin:0">The rated power of what each relay switches. Reports use it to estimate energy and cost; leave empty to leave this light out of those totals.</span>
        <div class="field full">
          <label>Status command <span class="muted">(asks the device for its state)</span></label>
          <input v-model="rxForm.statusCommand" maxlength="500" class="mono" placeholder="e.g. Tx_{address}_STATUS" />
          <span class="hint" style="margin:0">
            <code>{address}</code> is replaced by this receiver's network address. The control map sends it regularly and reads relay and
            brightness from the reply (e.g. <code>{"relay1":true,"relay2":false,"brightness":40}</code>). Leave empty to skip polling.
          </span>
        </div>
        <p class="hint full">Commands are sent as <code>Tx_&lt;network address&gt;_&lt;command&gt;</code>, e.g. address <strong>1</strong> + Relay 1 ON → <code>Tx_1_R1ON</code>.</p>
        <label v-if="rxModal.editingId" class="check full"><input v-model="rxForm.enabled" type="checkbox" /> Enabled (record is switched on)</label>
      </form>
      <template #footer>
        <button class="btn secondary" type="button" @click="rxModal.open = false">Cancel</button>
        <button class="btn" type="submit" form="rxForm" :disabled="rxModal.saving">{{ rxModal.saving ? 'Saving…' : 'Save' }}</button>
      </template>
    </Modal>

    <!-- ============ Confirm delete ============ -->
    <Modal v-if="del.item" title="Delete?" width="440px" @close="del.item = null">
      <div v-if="del.error" class="alert error">{{ del.error }}</div>
      <p>
        Delete <strong>{{ del.kind === 'tx' ? del.item.name : del.item.device_name }}</strong>?
        This can't be undone.
      </p>
      <template #footer>
        <button class="btn secondary" @click="del.item = null">Cancel</button>
        <button class="btn danger" :disabled="del.busy" @click="confirmDelete">{{ del.busy ? 'Deleting…' : 'Delete' }}</button>
      </template>
    </Modal>

    <!-- ============ Receiver control ============ -->
    <ReceiverControlModal v-if="controlRx" :receiver="controlRx" :transmitter="controlTx" @close="controlRx = null" @sent="load" />

    <!-- ============ Test connection ============ -->
    <DeviceTestModal v-if="testTx" :transmitter="testTx" @close="testTx = null" @tested="load" />
  </div>
</template>

<style scoped>
.sub { color: var(--text-muted); font-size: 0.78rem; }
.acts { display: flex; gap: 0.35rem; }
.act {
  width: 34px; height: 34px; border-radius: 9px; border: 1px solid var(--border); background: var(--surface-2);
  color: var(--text-muted); display: grid; place-items: center; cursor: pointer;
}
.act svg { width: 17px; height: 17px; }
.act:hover:not(:disabled) { background: var(--primary-soft); color: var(--primary); border-color: var(--primary); }
.act.danger:hover:not(:disabled) { background: var(--red-soft); color: var(--red-fg); border-color: var(--red); }
.act.control { color: var(--amber); }
.act.control:hover:not(:disabled) { background: var(--amber-soft); color: var(--amber-fg); border-color: var(--amber); }
.act:disabled { opacity: 0.4; cursor: not-allowed; }
.muted { color: var(--text-muted); font-weight: 400; }
.mono { font-family: ui-monospace, Consolas, monospace; }
code { background: var(--surface-2); padding: 0.05rem 0.35rem; border-radius: 5px; font-size: 0.85em; }

.mform { display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem 1rem; }
.mform .full { grid-column: 1 / -1; }
.mform p.hint { margin: 0; }
.check { display: flex; align-items: center; gap: 0.5rem; color: var(--text); font-size: 0.92rem; }
.check input { width: 18px; height: 18px; accent-color: var(--primary); }
.seg { display: flex; gap: 0.5rem; }
.seg button {
  flex: 1; padding: 0.55rem; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--surface-2);
  color: var(--text-muted); font: inherit; font-weight: 600; cursor: pointer;
}
.seg button.on { background: var(--primary-soft); color: var(--primary); border-color: var(--primary); }
.seg button:disabled { opacity: 0.55; cursor: not-allowed; }
@media (max-width: 600px) { .mform { grid-template-columns: 1fr; } }
</style>
