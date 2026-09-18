<script setup>
import { onMounted, reactive, ref } from 'vue';
import { statusMonitoringApi } from '../api/resources.js';

const config = reactive({
  enabled: true,
  polling_interval_seconds: '',
  response_timeout_seconds: '',
  retry_count: '',
  offline_threshold_seconds: '',
  status_polling_mode: '',
});
const error = ref('');
const saved = ref(false);

async function load() {
  const data = await statusMonitoringApi.get();
  if (data) Object.assign(config, data);
}

async function save() {
  error.value = '';
  saved.value = false;
  try {
    const payload = { ...config };
    for (const key of ['polling_interval_seconds', 'response_timeout_seconds', 'retry_count', 'offline_threshold_seconds']) {
      payload[key] = payload[key] === '' || payload[key] === null ? null : Number(payload[key]);
    }
    await statusMonitoringApi.update(payload);
    saved.value = true;
  } catch (err) {
    error.value = err.response?.data?.error?.message ?? 'Failed to save configuration';
  }
}

onMounted(load);
</script>

<template>
  <div>
    <h1>Status Monitoring Configuration</h1>
    <p class="hint">
      Admin-only. Values marked TBD in the SRS have no confirmed default — the
      offline threshold below was seeded at 90s as a development placeholder only.
    </p>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="saved" class="ok">Saved.</p>

    <form @submit.prevent="save" class="form">
      <label><input v-model="config.enabled" type="checkbox" /> Status Monitoring Enabled</label>
      <label>Polling Interval (s) <input v-model="config.polling_interval_seconds" type="number" /></label>
      <label>Response Timeout (s) <input v-model="config.response_timeout_seconds" type="number" /></label>
      <label>Retry Count <input v-model="config.retry_count" type="number" /></label>
      <label>Offline Threshold (s) <input v-model="config.offline_threshold_seconds" type="number" /></label>
      <label>Status Polling Mode <input v-model="config.status_polling_mode" type="text" /></label>
      <button type="submit">Save</button>
    </form>
  </div>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: 0.75rem; max-width: 320px; }
.hint { color: #666; font-size: 0.85rem; }
.error { color: #c0392b; }
.ok { color: #2e7d32; }
</style>
