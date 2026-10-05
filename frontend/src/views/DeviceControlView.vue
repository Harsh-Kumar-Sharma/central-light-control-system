<script setup>
import { onMounted, ref } from 'vue';
import { devicesApi } from '../api/resources.js';
import { badgeClass } from '../utils/status.js';

const devices = ref([]);
const selectedDeviceId = ref('');
const brightness = ref(50);
const lastResult = ref(null);
const error = ref('');

async function load() {
  devices.value = await devicesApi.list();
}

async function sendBrightness() {
  await send({ type: 'brightness', value: Number(brightness.value) });
}

async function sendRelay(relay, state) {
  await send({ type: relay, state });
}

async function send(payload) {
  error.value = '';
  lastResult.value = null;
  if (!selectedDeviceId.value) {
    error.value = 'Select a device first';
    return;
  }
  try {
    // Firmware validates brightness 1–99 (see backend commandService.js);
    // out-of-range values are rejected with INVALID_PARAMETER.
    lastResult.value = await devicesApi.sendCommand(selectedDeviceId.value, payload);
  } catch (err) {
    lastResult.value = err.response?.data ?? null;
    error.value = err.response?.data?.error ?? err.response?.data?.message ?? 'Command failed';
  }
}

onMounted(load);
</script>

<template>
  <div>
    <div v-if="error" class="alert error">{{ error }}</div>

    <div class="card">
      <div class="field select-device">
        <label for="dev">Select device</label>
        <select id="dev" v-model="selectedDeviceId">
          <option disabled value="">— choose a device —</option>
          <option v-for="d in devices" :key="d.id" :value="d.id">{{ d.device_name }} ({{ d.transmitter_name }})</option>
        </select>
      </div>
    </div>

    <div class="grid controls">
      <div class="card">
        <div class="card-title"><h2>Brightness</h2><span class="badge amber">1 – 99</span></div>
        <div class="slider-row">
          <input v-model="brightness" type="range" min="1" max="99" />
          <input v-model="brightness" type="number" min="1" max="99" class="num" />
        </div>
        <button class="btn" @click="sendBrightness">Apply brightness</button>
        <p class="hint">Firmware-enforced range. The protocol's 0–100% is an open issue.</p>
      </div>

      <div class="card">
        <div class="card-title"><h2>Relay 1</h2></div>
        <div class="pair">
          <button class="btn success" @click="sendRelay('relay1', true)">Turn ON</button>
          <button class="btn danger" @click="sendRelay('relay1', false)">Turn OFF</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title"><h2>Relay 2</h2></div>
        <div class="pair">
          <button class="btn success" @click="sendRelay('relay2', true)">Turn ON</button>
          <button class="btn danger" @click="sendRelay('relay2', false)">Turn OFF</button>
        </div>
      </div>
    </div>

    <div v-if="lastResult" class="card">
      <div class="card-title">
        <h2>Command result</h2>
        <span class="badge" :class="badgeClass(lastResult.status)">{{ lastResult.status ?? 'ERROR' }}</span>
      </div>
      <pre>{{ JSON.stringify(lastResult, null, 2) }}</pre>
    </div>
  </div>
</template>

<style scoped>
.select-device { max-width: 420px; }
.controls { grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
.controls .card { margin-bottom: 0; }
.slider-row { display: flex; align-items: center; gap: 0.8rem; margin-bottom: 1rem; }
.slider-row input[type='range'] { flex: 1; padding: 0; accent-color: var(--primary); }
.num { width: 76px; }
.pair { display: flex; gap: 0.7rem; }
.pair .btn { flex: 1; }
pre { margin: 0; background: var(--surface-2); padding: 0.9rem; border-radius: var(--radius-sm); overflow-x: auto; }
</style>
