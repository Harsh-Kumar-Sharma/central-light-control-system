<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import Modal from './Modal.vue';
import { transmittersApi } from '../api/resources.js';
import { useAuthStore } from '../stores/auth.js';

const props = defineProps({ transmitter: { type: Object, required: true } });
const emit = defineEmits(['close', 'tested']);

const auth = useAuthStore();
const isAdmin = computed(() => auth.can('devices', 'edit')); // saved-command editing

const isMqtt = computed(() => props.transmitter.connection_mode === 'mqtt');
const mqttReady = computed(() => !!(props.transmitter.mqtt_host && props.transmitter.mqtt_publish_topic && props.transmitter.mqtt_subscribe_topic));
const port = ref((props.transmitter.connection_mode === 'mqtt' ? (props.transmitter.mqtt_port ?? 1883) : props.transmitter.port) ?? '');
const busy = ref('');
const log = ref([]);
const logEl = ref(null);
const usable = computed(() => (isMqtt.value ? mqttReady.value : props.transmitter.connection_mode === 'lan' && !!props.transmitter.ip_address));
// LAN needs a port to talk to; MQTT already has everything it needs.
const canSend = computed(() => !busy.value && (isMqtt.value || !!port.value));
const heard = computed(() => props.transmitter.mqtt?.last_message ?? null);

function add(kind, text) {
  log.value.push({ kind, text, time: new Date().toLocaleTimeString() });
  nextTick(() => { if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight; });
}

/* ---------------- network checks ---------------- */
async function runCheck(action) {
  if (busy.value) return;
  busy.value = action;
  const ip = isMqtt.value ? props.transmitter.mqtt_host : props.transmitter.ip_address;
  try {
    add('out', action === 'ping' ? `ping ${ip} …` : action === 'connect' ? `connecting to the MQTT broker ${ip}:${props.transmitter.mqtt_port ?? 1883} …` : `check ${ip}:${port.value} …`);
    const r = await transmittersApi.test(props.transmitter.id, { action, port: port.value === '' ? undefined : Number(port.value) });
    add(r.ok ? 'ok' : 'err', r.ok ? `${r.detail}${r.latencyMs != null ? ` · ${r.latencyMs} ms` : ''}` : r.detail);
    emit('tested');
  } catch (err) {
    add('err', err.response?.data?.error?.message ?? 'Request failed');
  } finally {
    busy.value = '';
  }
}

/* ---------------- saved commands ---------------- */
const commands = ref([]);
const cmdError = ref('');
const form = reactive({ open: false, editingId: null, name: '', command: '', saving: false });
const confirmDeleteId = ref(null);

async function loadCommands() {
  try {
    commands.value = await transmittersApi.listCommands(props.transmitter.id);
  } catch (err) {
    cmdError.value = err.response?.data?.error?.message ?? 'Could not load commands';
  }
}
onMounted(loadCommands);

function openForm(c = null) {
  Object.assign(form, { open: true, editingId: c?.id ?? null, name: c?.name ?? '', command: c?.command ?? '', saving: false });
  cmdError.value = '';
}

async function saveCommand() {
  form.saving = true;
  cmdError.value = '';
  try {
    const payload = { name: form.name, command: form.command };
    if (form.editingId) await transmittersApi.updateCommand(props.transmitter.id, form.editingId, payload);
    else await transmittersApi.addCommand(props.transmitter.id, payload);
    form.open = false;
    await loadCommands();
  } catch (err) {
    cmdError.value = err.response?.data?.error?.message ?? 'Could not save command';
  } finally {
    form.saving = false;
  }
}

async function deleteCommand(c) {
  try {
    await transmittersApi.removeCommand(props.transmitter.id, c.id);
    confirmDeleteId.value = null;
    await loadCommands();
  } catch (err) {
    cmdError.value = err.response?.data?.error?.message ?? 'Could not delete command';
  }
}

function showSendResult(r) {
  if (r.ok) {
    add('in', `${r.received}${r.latencyMs != null ? `   (${r.latencyMs} ms)` : ''}`);
    let ack = null;
    try { ack = JSON.parse(r.received.trim()); } catch { /* not JSON */ }
    if (typeof ack?.message === 'string' && ack.message.startsWith('ACK:')) {
      add('ok', `ACK received${ack.rssi != null ? ` · RSSI ${ack.rssi}` : ''}${ack.snr != null ? ` · SNR ${ack.snr}` : ''}`);
    }
  } else {
    add('err', r.detail);
  }
}

async function sendSaved(c) {
  if (busy.value) return;
  busy.value = `cmd-${c.id}`;
  add('out', `${c.name}  ·  ${c.command}`);
  try {
    showSendResult(await transmittersApi.test(props.transmitter.id, {
      action: 'send', commandId: c.id, port: port.value === '' ? undefined : Number(port.value),
    }));
  } catch (err) {
    add('err', err.response?.data?.error?.message ?? 'Request failed');
  } finally {
    busy.value = '';
  }
}

/* ---------------- custom text (advanced) ---------------- */
const custom = ref('');
async function sendCustom() {
  if (busy.value) return;
  busy.value = 'custom';
  add('out', custom.value);
  try {
    showSendResult(await transmittersApi.test(props.transmitter.id, {
      action: 'send', message: custom.value, port: port.value === '' ? undefined : Number(port.value),
    }));
  } catch (err) {
    add('err', err.response?.data?.error?.message ?? 'Request failed');
  } finally {
    busy.value = '';
  }
}
</script>

<template>
  <Modal :title="`Test connection — ${transmitter.name}`" width="720px" @close="emit('close')">
    <div class="target">
      <span class="badge blue">{{ transmitter.connection_mode.toUpperCase() }}</span>
      <template v-if="isMqtt">
        <strong>{{ transmitter.mqtt_host ?? 'no broker set' }}<template v-if="transmitter.mqtt_host">:{{ transmitter.mqtt_port ?? 1883 }}</template></strong>
        <span v-if="transmitter.mqtt?.state === 'connected'" class="badge green">connected</span>
        <span v-else-if="transmitter.mqtt?.state === 'error'" class="badge red" :title="transmitter.mqtt.error">can't connect</span>
        <span v-else-if="transmitter.mqtt?.state === 'connecting'" class="badge amber">connecting…</span>
        <span v-else class="badge gray">not connected yet</span>
      </template>
      <template v-else>
        <strong>{{ transmitter.ip_address ?? 'no IP set' }}</strong>
        <span v-if="transmitter.gateway" class="muted">gateway {{ transmitter.gateway }}</span>
      </template>
    </div>
    <div v-if="isMqtt && mqttReady" class="topics">
      <div><span class="arrow">↑</span> commands go to <code>{{ transmitter.mqtt_publish_topic }}</code></div>
      <div><span class="arrow">↓</span> replies come from <code>{{ transmitter.mqtt_subscribe_topic }}</code></div>
      <div v-if="transmitter.mqtt?.state === 'error' && transmitter.mqtt.error" class="bad">{{ transmitter.mqtt.error }}</div>
      <div v-if="heard" class="muted">Last message heard: <code>{{ heard }}</code></div>
    </div>

    <div v-if="!usable" class="alert error">
      {{ isMqtt ? 'MQTT tests need the broker host and both topics. Edit this transmitter first.' : 'LAN tests need this transmitter to be in LAN mode with an IP address. Edit it first.' }}
    </div>

    <template v-else>
      <section>
        <h3>1 · {{ isMqtt ? 'Connection check' : 'Network check' }}</h3>
        <p v-if="!isMqtt" class="hint">Ping the device, and check that its software is listening on a port.</p>
        <p v-else class="hint">Open the MQTT connection (and subscribe to the reply topic), or just check that the broker's port is open.</p>
        <div v-if="!isMqtt" class="row">
          <button class="btn" :disabled="!!busy" @click="runCheck('ping')">{{ busy === 'ping' ? 'Pinging…' : 'Ping' }}</button>
          <input v-model="port" type="number" min="1" max="65535" placeholder="Port" class="port" />
          <button class="btn secondary" :disabled="!!busy || !port" @click="runCheck('port')">{{ busy === 'port' ? 'Checking…' : 'Check port' }}</button>
        </div>
        <div v-else class="row">
          <button class="btn" data-action="mqtt-connect" :disabled="!!busy" @click="runCheck('connect')">{{ busy === 'connect' ? 'Connecting…' : 'Test MQTT connection' }}</button>
          <input v-model="port" type="number" min="1" max="65535" placeholder="Port" class="port" />
          <button class="btn secondary" :disabled="!!busy || !port" @click="runCheck('port')">{{ busy === 'port' ? 'Checking…' : 'Check broker port' }}</button>
        </div>
      </section>

      <section>
        <div class="head">
          <h3>2 · Commands</h3>
          <button v-if="isAdmin && !form.open" class="btn secondary sm" @click="openForm()">+ Add command</button>
        </div>
        <p class="hint">Press a command to send it to the device. The command text is saved behind the name.</p>
        <div v-if="cmdError" class="alert error">{{ cmdError }}</div>

        <form v-if="form.open" class="cmd-form" @submit.prevent="saveCommand">
          <input v-model="form.name" placeholder="Name (button label), e.g. Relay 1 ON" maxlength="64" required />
          <input v-model="form.command" placeholder="Command to send, e.g. Tx_1_R1ON" maxlength="500" required class="mono" />
          <button class="btn" type="submit" :disabled="form.saving">{{ form.saving ? 'Saving…' : form.editingId ? 'Update' : 'Save' }}</button>
          <button class="btn secondary" type="button" @click="form.open = false">Cancel</button>
        </form>

        <div class="chips">
          <div v-for="c in commands" :key="c.id" class="chip">
            <template v-if="confirmDeleteId === c.id">
              <span class="ask">Delete “{{ c.name }}”?</span>
              <button class="mini danger" @click="deleteCommand(c)">Yes</button>
              <button class="mini" @click="confirmDeleteId = null">No</button>
            </template>
            <template v-else>
              <button class="send" :disabled="!canSend" :title="c.name" @click="sendSaved(c)">
                {{ busy === `cmd-${c.id}` ? 'Sending…' : c.name }}
              </button>
              <template v-if="isAdmin">
                <button class="mini" title="Edit" @click="openForm(c)">✎</button>
                <button class="mini" title="Delete" @click="confirmDeleteId = c.id">✕</button>
              </template>
            </template>
          </div>
          <p v-if="!commands.length" class="muted none">
            No commands yet.<template v-if="isAdmin"> Use “+ Add command”.</template>
          </p>
        </div>
        <p v-if="commands.length && !isMqtt && !port" class="hint">Enter a port above to enable the commands.</p>

        <details class="advanced">
          <summary>Send custom text (advanced)</summary>
          <form class="row" @submit.prevent="sendCustom">
            <input v-model="custom" placeholder="Any text — sent exactly as typed" maxlength="1000" required />
            <button class="btn secondary" type="submit" :disabled="!canSend">{{ busy === 'custom' ? 'Waiting…' : 'Send' }}</button>
          </form>
        </details>
      </section>

      <section>
        <div class="head">
          <h3>Log</h3>
          <button class="btn secondary sm" :disabled="!log.length" @click="log = []">Clear</button>
        </div>
        <div ref="logEl" class="log">
          <div v-if="!log.length" class="muted-log">Nothing yet — run a check or press a command.</div>
          <div v-for="(l, i) in log" :key="i" class="line" :class="l.kind">
            <span class="t">{{ l.time }}</span>
            <span class="arrow">{{ { out: '→', in: '←', ok: '✓', err: '✗' }[l.kind] }}</span>
            <span class="txt">{{ l.text }}</span>
          </div>
          <div v-if="busy" class="line info"><span class="t" /><span class="arrow">…</span><span class="txt">{{ isMqtt ? 'waiting for the broker / device (up to a few seconds)' : 'waiting for the device (a ping to an unreachable device takes about 7 s)' }}</span></div>
        </div>
      </section>
    </template>

    <template #footer>
      <button class="btn secondary" @click="emit('close')">Close</button>
    </template>
  </Modal>
</template>

<style scoped>
.target { display: flex; align-items: center; gap: 0.7rem; margin-bottom: 1rem; flex-wrap: wrap; }
.muted { color: var(--text-muted); font-size: 0.85rem; }
section { margin-bottom: 1.2rem; }
h3 { font-size: 0.95rem; margin-bottom: 0.2rem; }
.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.2rem; }
.row { display: flex; gap: 0.6rem; flex-wrap: wrap; align-items: center; }
.row input { flex: 1 1 200px; }
.row .port { flex: 0 0 110px; }

.cmd-form { display: flex; gap: 0.5rem; flex-wrap: wrap; margin: 0.6rem 0; padding: 0.7rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); }
.cmd-form input { flex: 1 1 200px; }
.mono { font-family: ui-monospace, Consolas, monospace; }
.topics { margin: -0.4rem 0 1rem; display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.85rem; }
.topics code { background: var(--surface-2); padding: 0.05rem 0.35rem; border-radius: 5px; word-break: break-all; }
.topics .arrow { display: inline-block; width: 1rem; font-weight: 700; color: var(--primary); }
.topics .bad { color: var(--red-fg); }

.chips { display: flex; flex-wrap: wrap; gap: 0.55rem; margin-top: 0.6rem; }
.chip { display: inline-flex; align-items: stretch; border: 1px solid var(--primary); border-radius: 10px; overflow: hidden; background: var(--primary-soft); }
.chip .send { border: 0; background: transparent; color: var(--primary); font: inherit; font-weight: 700; padding: 0.5rem 0.95rem; cursor: pointer; }
.chip .send:hover:not(:disabled) { background: var(--primary); color: #fff; }
.chip .send:disabled { opacity: 0.5; cursor: not-allowed; }
.mini { border: 0; border-left: 1px solid var(--border); background: var(--surface); color: var(--text-muted); padding: 0 0.6rem; cursor: pointer; font: inherit; }
.mini:hover { background: var(--surface-2); color: var(--text); }
.mini.danger { background: var(--red); color: #fff; }
.ask { padding: 0.5rem 0.7rem; font-size: 0.85rem; color: var(--text); background: var(--surface); }
.none { margin: 0.2rem 0; }
.advanced { margin-top: 0.8rem; }
.advanced summary { cursor: pointer; color: var(--text-muted); font-size: 0.85rem; margin-bottom: 0.5rem; }

.log {
  background: #0d1226; color: #d6dcf5; border-radius: var(--radius-sm); padding: 0.7rem 0.85rem;
  font-family: ui-monospace, Consolas, 'Courier New', monospace; font-size: 0.84rem; height: 190px; overflow-y: auto;
}
.muted-log { color: #6f7aa6; }
.line { display: flex; gap: 0.55rem; padding: 0.1rem 0; }
.t { color: #6f7aa6; flex: none; min-width: 5.2rem; }
.arrow { flex: none; width: 1rem; text-align: center; }
.txt { white-space: pre-wrap; word-break: break-word; }
.line.out .arrow { color: #7c78ff; }
.line.in .arrow, .line.ok .arrow { color: #34d399; }
.line.ok .txt, .line.in .txt { color: #a7f3d0; }
.line.err .arrow, .line.err .txt { color: #fb7185; }
.line.info { color: #94a0c6; }
</style>
