<script setup>
import { onMounted, ref } from 'vue';
import { devicesApi } from '../api/resources.js';

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
    // out-of-range values are rejected here with INVALID_PARAMETER.
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
    <h1>Device Control</h1>
    <p v-if="error" class="error">{{ error }}</p>

    <label>
      Select Device
      <select v-model="selectedDeviceId">
        <option disabled value="">— choose a device —</option>
        <option v-for="d in devices" :key="d.id" :value="d.id">{{ d.device_name }} ({{ d.transmitter_name }})</option>
      </select>
    </label>

    <fieldset>
      <legend>Brightness</legend>
      <input v-model="brightness" type="number" min="1" max="99" />
      <button @click="sendBrightness">Apply</button>
      <p class="hint">Valid range: 1–99 (firmware-enforced; protocol's 0–100% is an open issue).</p>
    </fieldset>

    <fieldset>
      <legend>Relay 1</legend>
      <button @click="sendRelay('relay1', true)">ON</button>
      <button @click="sendRelay('relay1', false)">OFF</button>
    </fieldset>

    <fieldset>
      <legend>Relay 2</legend>
      <button @click="sendRelay('relay2', true)">ON</button>
      <button @click="sendRelay('relay2', false)">OFF</button>
    </fieldset>

    <div v-if="lastResult">
      <h2>Command Result</h2>
      <pre>{{ JSON.stringify(lastResult, null, 2) }}</pre>
    </div>
  </div>
</template>

<style scoped>
fieldset { margin: 1rem 0; padding: 0.75rem; }
button { margin-left: 0.5rem; padding: 0.4rem 0.8rem; cursor: pointer; }
.hint { font-size: 0.8rem; color: #666; }
.error { color: #c0392b; }
pre { background: #f5f5f5; padding: 0.75rem; overflow-x: auto; }
</style>
