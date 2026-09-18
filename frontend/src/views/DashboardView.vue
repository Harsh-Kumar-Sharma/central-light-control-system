<script setup>
import { onMounted, ref } from 'vue';
import { dashboardApi } from '../api/resources.js';

const summary = ref(null);
const error = ref('');

async function load() {
  try {
    summary.value = await dashboardApi.summary();
  } catch (err) {
    error.value = err.response?.data?.error?.message ?? 'Failed to load dashboard summary';
  }
}

onMounted(load);
</script>

<template>
  <div>
    <h1>Main Dashboard</h1>
    <p v-if="error" class="error">{{ error }}</p>

    <div v-if="summary" class="cards">
      <div class="card">
        <div class="label">Transmitters</div>
        <div class="value">{{ summary.transmitters.active }} / {{ summary.transmitters.total }} active</div>
      </div>
      <div class="card">
        <div class="label">Receivers Online</div>
        <div class="value">{{ summary.receivers.online }} / {{ summary.receivers.total }}</div>
      </div>
      <div class="card">
        <div class="label">Receivers Offline</div>
        <div class="value">{{ summary.receivers.offline }}</div>
      </div>
      <div class="card">
        <div class="label">Active Faults</div>
        <div class="value">{{ summary.activeFaults }}</div>
      </div>
    </div>

    <h2>Recent Commands</h2>
    <table v-if="summary?.recentCommands?.length">
      <thead>
        <tr><th>Time</th><th>Device</th><th>Command</th><th>Parameter</th><th>Status</th></tr>
      </thead>
      <tbody>
        <tr v-for="cmd in summary.recentCommands" :key="cmd.id">
          <td>{{ new Date(cmd.created_at).toLocaleString() }}</td>
          <td>{{ cmd.device_name }}</td>
          <td>{{ cmd.command }}</td>
          <td>{{ cmd.parameter ?? '—' }}</td>
          <td>{{ cmd.status }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else>No commands issued yet.</p>
  </div>
</template>

<style scoped>
.cards { display: flex; gap: 1rem; flex-wrap: wrap; margin: 1rem 0; }
.card { border: 1px solid #ddd; border-radius: 6px; padding: 1rem; min-width: 160px; }
.label { font-size: 0.85rem; color: #666; }
.value { font-size: 1.5rem; font-weight: 700; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #ddd; padding: 0.4rem 0.6rem; text-align: left; }
.error { color: #c0392b; }
</style>
