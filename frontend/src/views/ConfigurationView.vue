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
    <div v-if="error" class="alert error">{{ error }}</div>
    <div v-if="saved" class="alert success">Configuration saved.</div>

    <form class="card form" @submit.prevent="save">
      <div class="card-title"><h2>Status monitoring</h2></div>
      <p class="hint">
        Admin only. Values marked TBD in the SRS have no confirmed default — the offline
        threshold was seeded at 90s as a development placeholder.
      </p>

      <label class="check"><input v-model="config.enabled" type="checkbox" /> Status monitoring enabled</label>

      <div class="grid two">
        <div class="field">
          <label>Polling interval (s)</label>
          <input v-model="config.polling_interval_seconds" type="number" min="3" placeholder="10" />
          <span class="hint" style="margin:0">How often receivers that have a <strong>status command</strong> are asked for their state (Control map). Empty = 10 s, minimum 3 s.</span>
        </div>
        <div class="field"><label>Response timeout (s)</label><input v-model="config.response_timeout_seconds" type="number" /></div>
        <div class="field"><label>Retry count</label><input v-model="config.retry_count" type="number" /></div>
        <div class="field"><label>Offline threshold (s)</label><input v-model="config.offline_threshold_seconds" type="number" /></div>
        <div class="field"><label>Status polling mode</label><input v-model="config.status_polling_mode" type="text" /></div>
      </div>

      <div><button class="btn" type="submit">Save configuration</button></div>
    </form>
  </div>
</template>

<style scoped>
.form { max-width: 640px; display: flex; flex-direction: column; gap: 1rem; }
.two { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
.check { display: flex; align-items: center; gap: 0.5rem; color: var(--text); font-size: 0.95rem; }
.check input { width: 18px; height: 18px; accent-color: var(--primary); }
</style>
