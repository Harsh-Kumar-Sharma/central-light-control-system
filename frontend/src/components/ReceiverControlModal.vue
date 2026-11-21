<script setup>
import { computed, nextTick, ref } from 'vue';
import Modal from './Modal.vue';
import { devicesApi } from '../api/resources.js';
import { compactReply } from '../utils/reply.js';

const props = defineProps({
  receiver: { type: Object, required: true },
  transmitter: { type: Object, default: null },
});
const emit = defineEmits(['close', 'sent']);

const brightness = ref(50);
const busy = ref(false);
const log = ref([]);
const logEl = ref(null);

const addr = computed(() => props.receiver.lora_address);
const via = computed(() => {
  const t = props.transmitter;
  if (!t) return 'unknown transmitter';
  if (t.connection_mode !== 'lan') return t.mqtt_host ? `MQTT ${t.mqtt_host}:${t.mqtt_port ?? 1883}` : 'MQTT (default broker)';
  return t.ip_address && t.port ? `LAN ${t.ip_address}:${t.port}` : 'LAN — IP / port not set';
});
const ready = computed(() => props.receiver.status === 'active' && props.transmitter?.status === 'active');

function add(kind, text) {
  log.value.push({ kind, text, time: new Date().toLocaleTimeString() });
  nextTick(() => { if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight; });
}

// Mirrors backend buildCommandString — shown on the buttons so you can see
// exactly what will be sent before pressing anything.
const preview = (suffix) => `Tx_${addr.value}_${suffix}`;

function show(result) {
  if (result.reply) add('in', `${compactReply(result.reply)}${result.latencyMs != null ? `   (${result.latencyMs} ms)` : ''}`);
  switch (result.status) {
    case 'SUCCESS':
      add('ok', `ACK received${result.rssi != null ? ` · RSSI ${result.rssi}` : ''}${result.snr != null ? ` · SNR ${result.snr}` : ''}`);
      break;
    case 'ACKNOWLEDGED':
      add('warn', 'Device replied, but not in the expected ACK format');
      break;
    case 'NO_ACK':
      add('warn', `Delivered, but no reply: ${result.error ?? 'timed out'}`);
      break;
    case 'SENT_OVER_LORA':
      add('info', 'Sent via MQTT — the ACK arrives later, see Logs');
      break;
    default:
      add('err', `${result.status ?? 'ERROR'}${result.error ? `: ${result.error}` : ''}`);
  }
}

async function send(payload, label) {
  if (busy.value) return;
  busy.value = true;
  add('out', label);
  try {
    const result = await devicesApi.sendCommand(props.receiver.id, payload);
    show(result);
  } catch (err) {
    const data = err.response?.data;
    if (data?.status) show(data);
    else add('err', data?.error?.message ?? 'Request failed');
  } finally {
    busy.value = false;
    emit('sent');
  }
}

const relay = (n, on) => send({ type: `relay${n}`, state: on }, preview(`R${n}${on ? 'ON' : 'OFF'}`));
const applyBrightness = () => send({ type: 'brightness', value: Number(brightness.value) }, preview(`LUX_${brightness.value}`));
</script>

<template>
  <Modal :title="`Control — ${receiver.device_name}`" width="680px" @close="emit('close')">
    <div class="meta">
      <span class="badge blue">address {{ addr }}</span>
      <span class="badge gray">network {{ receiver.network_id ?? '—' }}</span>
      <span class="badge" :class="via.includes('not set') ? 'red' : 'blue'">{{ via }}</span>
    </div>

    <div v-if="!ready" class="alert error">
      This receiver or its transmitter is switched to <strong>Disabled</strong>. Enable it (Edit) before sending commands.
    </div>

    <div class="grid two">
      <div class="panel">
        <h3>Relay 1</h3>
        <div class="pair">
          <button class="btn success" :disabled="busy || !ready" @click="relay(1, true)">ON<small>{{ preview('R1ON') }}</small></button>
          <button class="btn danger" :disabled="busy || !ready" @click="relay(1, false)">OFF<small>{{ preview('R1OFF') }}</small></button>
        </div>
      </div>
      <div class="panel">
        <h3>Relay 2</h3>
        <div class="pair">
          <button class="btn success" :disabled="busy || !ready" @click="relay(2, true)">ON<small>{{ preview('R2ON') }}</small></button>
          <button class="btn danger" :disabled="busy || !ready" @click="relay(2, false)">OFF<small>{{ preview('R2OFF') }}</small></button>
        </div>
      </div>
    </div>

    <div class="panel">
      <h3>Brightness <span class="badge amber">1 – 99</span></h3>
      <div class="slider">
        <input v-model="brightness" type="range" min="1" max="99" />
        <input v-model="brightness" type="number" min="1" max="99" class="num" />
        <button class="btn" :disabled="busy || !ready" @click="applyBrightness">Apply<small>{{ preview(`LUX_${brightness}`) }}</small></button>
      </div>
    </div>

    <div class="log-head">
      <h3>Log</h3>
      <button class="btn secondary sm" :disabled="!log.length" @click="log = []">Clear</button>
    </div>
    <div ref="logEl" class="log">
      <div v-if="!log.length" class="muted">Press a button — the exact command and the device's reply will show here.</div>
      <div v-for="(l, i) in log" :key="i" class="line" :class="l.kind">
        <span class="t">{{ l.time }}</span>
        <span class="arrow">{{ { out: '→', in: '←', ok: '✓', warn: '⚠', info: 'ℹ', err: '✗' }[l.kind] }}</span>
        <span class="txt">{{ l.text }}</span>
      </div>
      <div v-if="busy" class="line info"><span class="t" /><span class="arrow">…</span><span class="txt">waiting for the device</span></div>
    </div>

    <template #footer>
      <button class="btn secondary" @click="emit('close')">Close</button>
    </template>
  </Modal>
</template>

<style scoped>
.meta { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem; }
.two { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); margin-bottom: 1rem; }
.panel { border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0.85rem 1rem; background: var(--surface-2); margin-bottom: 1rem; }
.two .panel { margin-bottom: 0; }
h3 { font-size: 0.92rem; margin-bottom: 0.6rem; display: flex; align-items: center; gap: 0.5rem; }
.pair { display: flex; gap: 0.6rem; }
.pair .btn { flex: 1; }
.btn { flex-direction: column; gap: 0; line-height: 1.2; }
.btn small { font-weight: 500; font-size: 0.7rem; opacity: 0.85; font-family: ui-monospace, Consolas, monospace; }
.slider { display: flex; align-items: center; gap: 0.7rem; flex-wrap: wrap; }
.slider input[type='range'] { flex: 1 1 160px; padding: 0; accent-color: var(--primary); }
.num { width: 76px; }
.muted { color: #6f7aa6; }
.log-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem; }
.log {
  background: #0d1226; color: #d6dcf5; border-radius: var(--radius-sm); padding: 0.7rem 0.85rem;
  font-family: ui-monospace, Consolas, 'Courier New', monospace; font-size: 0.84rem; height: 170px; overflow-y: auto;
}
.line { display: flex; gap: 0.55rem; padding: 0.1rem 0; }
.t { color: #6f7aa6; flex: none; min-width: 5.2rem; }
.arrow { flex: none; width: 1rem; text-align: center; }
.txt { white-space: pre-wrap; word-break: break-word; }
.line.out .arrow { color: #7c78ff; }
.line.in .arrow, .line.ok .arrow, .line.ok .txt { color: #34d399; }
.line.warn .arrow, .line.warn .txt { color: #fbbf24; }
.line.err .arrow, .line.err .txt { color: #fb7185; }
.line.info { color: #94a0c6; }
@media (max-width: 560px) { .two { grid-template-columns: 1fr; } }
</style>
