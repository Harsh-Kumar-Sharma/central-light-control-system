<script setup>
import { computed, nextTick, ref } from 'vue';
import Modal from './Modal.vue';
import { devicesApi } from '../api/resources.js';
import { compactReply } from '../utils/reply.js';

const props = defineProps({
  light: { type: Object, required: true },   // live info for this receiver (kept fresh by the parent)
  canControl: { type: Boolean, default: false },
});
const emit = defineEmits(['close', 'changed']);

const busy = ref(false);
const log = ref([]);
const logEl = ref(null);
const brightness = ref(props.light.brightness ?? 50);

const relays = computed(() => [
  { n: 1, name: props.light.relay1Name || 'Relay 1', on: props.light.relay1 },
  { n: 2, name: props.light.relay2Name || 'Relay 2', on: props.light.relay2 },
]);
const connection = computed(() => {
  if (!props.light.enabled) return { cls: 'gray', text: 'Disabled' };
  if (props.light.online === true) return { cls: 'green', text: 'Online' };
  if (props.light.online === false) return { cls: 'red', text: 'Offline' };
  return { cls: 'gray', text: 'No data yet' };
});
const canSend = computed(() => props.canControl && props.light.enabled && !busy.value);

function ago(value) {
  if (!value) return null;
  const s = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
const stateNote = computed(() => {
  const l = props.light;
  if (!l.stateAt) return 'State not known yet';
  return l.stateSource === 'reported' ? `Reported by the device ${ago(l.stateAt)}` : `From the last command the device acknowledged, ${ago(l.stateAt)}`;
});

function add(kind, text) {
  log.value.push({ kind, text, time: new Date().toLocaleTimeString() });
  nextTick(() => { if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight; });
}

function showResult(result) {
  if (result.reply) add('in', `${compactReply(result.reply)}${result.latencyMs != null ? `   (${result.latencyMs} ms)` : ''}`);
  switch (result.status) {
    case 'SUCCESS': add('ok', `ACK received${result.rssi != null ? ` · RSSI ${result.rssi}` : ''}${result.snr != null ? ` · SNR ${result.snr}` : ''}`); break;
    case 'ACKNOWLEDGED': add('warn', 'The device replied, but not in the expected ACK format'); break;
    case 'NO_ACK': add('warn', `Delivered, but no reply: ${result.error ?? 'timed out'}`); break;
    case 'SENT_OVER_LORA': add('info', 'Sent via MQTT — the ACK arrives later, see Logs'); break;
    default: add('err', `${result.status ?? 'ERROR'}${result.error ? `: ${result.error}` : ''}`);
  }
}

// Asks the device for its real state (only possible when a status command is set).
async function verify(expect) {
  if (!props.light.hasStatusCommand) return;
  add('out', 'checking the device state…');
  try {
    const r = await devicesApi.refreshStatus(props.light.receiverId);
    if (!r.ok) { add('warn', r.detail ?? 'Could not read the device state'); return; }
    add('ok', `Device reports: Relay 1 ${r.status.relay1 ? 'ON' : 'OFF'}, Relay 2 ${r.status.relay2 ? 'ON' : 'OFF'}${r.status.brightness != null ? `, brightness ${r.status.brightness}%` : ''}`);
    if (expect && r.status[expect.key] != null && Boolean(r.status[expect.key]) !== expect.value) {
      add('warn', `The device still reports this as ${r.status[expect.key] ? 'ON' : 'OFF'} — the change may not have applied`);
    }
  } catch (err) {
    add('err', err.response?.data?.error?.message ?? 'Status check failed');
  }
}

async function run(payload, label, expect) {
  if (!canSend.value) return;
  busy.value = true;
  add('out', label);
  try {
    showResult(await devicesApi.sendCommand(props.light.receiverId, payload));
  } catch (err) {
    const data = err.response?.data;
    if (data?.status) showResult(data);
    else add('err', data?.error?.message ?? 'Request failed');
  }
  await verify(expect);
  busy.value = false;
  emit('changed');
}

const setRelay = (n, on) => run({ type: `relay${n}`, state: on }, `${relays.value[n - 1].name} → ${on ? 'ON' : 'OFF'}`, { key: `relay${n}`, value: on });
const applyBrightness = () => run({ type: 'brightness', value: Number(brightness.value) }, `Brightness → ${brightness.value}%`, null);

async function refresh() {
  if (busy.value) return;
  busy.value = true;
  await verify(null);
  busy.value = false;
  emit('changed');
}
</script>

<template>
  <Modal :title="light.name" width="680px" @close="emit('close')">
    <div class="meta">
      <span class="badge" :class="connection.cls">{{ connection.text }}</span>
      <span class="badge blue">address {{ light.address }}</span>
      <span class="badge gray">network {{ light.networkId ?? '—' }}</span>
      <span class="badge gray">via {{ light.transmitterName }}</span>
      <span v-if="light.rssi != null" class="badge gray">RSSI {{ light.rssi }}<template v-if="light.snr != null"> · SNR {{ light.snr }}</template></span>
      <span v-if="light.lastSeen" class="seen">last seen {{ ago(light.lastSeen) }}</span>
    </div>

    <div v-if="!light.enabled" class="alert error">This light (or its transmitter) is switched to <strong>Disabled</strong>, so commands are blocked.</div>
    <div v-else-if="light.online === false" class="alert warn">
      This light looks <strong>offline</strong>. Commands still go out through its transmitter, but may not reach the device.
    </div>
    <div v-else-if="light.online === null" class="alert info">No status has been received from this light yet.</div>
    <div v-if="light.enabled && !light.hasStatusCommand" class="alert info">
      No status command is set for this receiver, so live state can't be read — what you see is based on the last command it acknowledged.
      Set one in Devices → edit receiver.
    </div>

    <div class="relays">
      <div v-for="r in relays" :key="r.n" class="relay" :class="r.on === true ? 'is-on' : r.on === false ? 'is-off' : 'is-unk'" :data-relay="r.n">
        <div class="r-head">
          <strong>{{ r.name }}</strong>
          <span class="badge" :class="r.on === true ? 'green' : r.on === false ? 'gray' : 'amber'">{{ r.on === true ? 'ON' : r.on === false ? 'OFF' : 'Unknown' }}</span>
        </div>
        <div v-if="canControl" class="r-actions">
          <button v-if="r.on !== true" class="btn success" :disabled="!canSend" data-action="on" @click="setRelay(r.n, true)">Turn ON</button>
          <button v-if="r.on !== false" class="btn danger" :disabled="!canSend" data-action="off" @click="setRelay(r.n, false)">Turn OFF</button>
        </div>
      </div>
    </div>
    <p class="state-note">{{ stateNote }}</p>

    <div class="brightness">
      <div class="b-head">
        <strong>Brightness</strong>
        <span class="b-now" data-brightness>{{ light.brightness != null ? `${light.brightness}%` : '—' }}</span>
      </div>
      <div class="bar"><div class="fill" :style="{ width: `${light.brightness ?? 0}%` }" /></div>
      <div v-if="canControl" class="b-set">
        <input v-model="brightness" type="range" min="1" max="99" />
        <input v-model="brightness" type="number" min="1" max="99" class="num" />
        <button class="btn" :disabled="!canSend" @click="applyBrightness">Apply</button>
      </div>
    </div>
    <p v-if="!canControl" class="hint">You have view-only access. Ask an Admin or Operator to change this light.</p>

    <div class="log-head">
      <h3>Log</h3>
      <button class="btn secondary sm" :disabled="!log.length" @click="log = []">Clear</button>
    </div>
    <div ref="logEl" class="log">
      <div v-if="!log.length" class="muted">Actions and the device's replies will show here.</div>
      <div v-for="(l, i) in log" :key="i" class="line" :class="l.kind">
        <span class="t">{{ l.time }}</span>
        <span class="arrow">{{ { out: '→', in: '←', ok: '✓', warn: '⚠', info: 'ℹ', err: '✗' }[l.kind] }}</span>
        <span class="txt">{{ l.text }}</span>
      </div>
      <div v-if="busy" class="line info"><span class="t" /><span class="arrow">…</span><span class="txt">waiting for the device</span></div>
    </div>

    <template #footer>
      <button v-if="canControl && light.hasStatusCommand" class="btn secondary" :disabled="busy" @click="refresh">Refresh status</button>
      <button class="btn secondary" @click="emit('close')">Close</button>
    </template>
  </Modal>
</template>

<style scoped>
.meta { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; margin-bottom: 1rem; }
.seen { color: var(--text-muted); font-size: 0.82rem; }

.relays { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 0.9rem; }
.relay { border: 1px solid var(--border); border-left-width: 5px; border-radius: var(--radius-sm); padding: 0.85rem 1rem; background: var(--surface-2); }
.relay.is-on { border-left-color: var(--green); }
.relay.is-off { border-left-color: #94a3b8; }
.relay.is-unk { border-left-color: var(--amber); }
.r-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.7rem; gap: 0.5rem; }
.r-actions { display: flex; gap: 0.5rem; }
.r-actions .btn { flex: 1; }
.state-note { color: var(--text-muted); font-size: 0.8rem; margin: 0.5rem 0 1rem; }

.brightness { border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0.85rem 1rem; background: var(--surface-2); margin-bottom: 1rem; }
.b-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.5rem; }
.b-now { font-size: 1.4rem; font-weight: 800; }
.bar { height: 10px; background: var(--border); border-radius: 999px; overflow: hidden; }
.fill { height: 100%; background: linear-gradient(90deg, #fbbf24, #f59e0b); transition: width 0.4s; }
.b-set { display: flex; align-items: center; gap: 0.7rem; margin-top: 0.8rem; flex-wrap: wrap; }
.b-set input[type='range'] { flex: 1 1 160px; padding: 0; accent-color: var(--primary); }
.num { width: 76px; }

.log-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem; }
h3 { font-size: 0.92rem; }
.log {
  background: #0d1226; color: #d6dcf5; border-radius: var(--radius-sm); padding: 0.7rem 0.85rem;
  font-family: ui-monospace, Consolas, 'Courier New', monospace; font-size: 0.84rem; height: 150px; overflow-y: auto;
}
.muted { color: #6f7aa6; }
.line { display: flex; gap: 0.55rem; padding: 0.1rem 0; }
.t { color: #6f7aa6; flex: none; min-width: 5.2rem; }
.arrow { flex: none; width: 1rem; text-align: center; }
.txt { white-space: pre-wrap; word-break: break-word; }
.line.out .arrow { color: #7c78ff; }
.line.in .arrow, .line.ok .arrow, .line.ok .txt { color: #34d399; }
.line.warn .arrow, .line.warn .txt { color: #fbbf24; }
.line.err .arrow, .line.err .txt { color: #fb7185; }
.line.info { color: #94a0c6; }
@media (max-width: 560px) { .relays { grid-template-columns: 1fr; } }
</style>
