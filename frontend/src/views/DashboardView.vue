<script setup>
import { onMounted, ref } from 'vue';
import { dashboardApi } from '../api/resources.js';
import { badgeClass } from '../utils/status.js';

const summary = ref(null);
const error = ref('');

async function load() {
  error.value = '';
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
    <div class="page-header">
      <div>
        <h2>Overview</h2>
        <p>Live summary of your transmitters, receivers and recent activity</p>
      </div>
      <button class="btn secondary" @click="load">Refresh</button>
    </div>

    <div v-if="error" class="alert error">{{ error }}</div>

    <div v-if="summary" class="grid stats">
      <div class="stat primary">
        <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5a10 10 0 0114 0M8.5 16a5 5 0 017 0M12 20h.01M2 9a15 15 0 0120 0" /></svg></div>
        <div>
          <div class="label">Transmitters</div>
          <div class="value">{{ summary.transmitters.active }} <small>/ {{ summary.transmitters.total }} active</small></div>
        </div>
      </div>
      <div class="stat green">
        <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.1V12a10 10 0 11-5.9-9.1M22 4L12 14l-3-3" /></svg></div>
        <div>
          <div class="label">Receivers online</div>
          <div class="value">{{ summary.receivers.online }} <small>/ {{ summary.receivers.total }}</small></div>
        </div>
      </div>
      <div class="stat red">
        <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6m0-6l6 6" /></svg></div>
        <div>
          <div class="label">Receivers offline</div>
          <div class="value">{{ summary.receivers.offline }}</div>
        </div>
      </div>
      <div class="stat amber">
        <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0zM12 9v4m0 4h.01" /></svg></div>
        <div>
          <div class="label">Active faults</div>
          <div class="value">{{ summary.activeFaults }}</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">
        <h2>Recent commands</h2>
        <router-link to="/logs" class="btn secondary sm">View all logs</router-link>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Time</th><th>Device</th><th>Command</th><th>Parameter</th><th>Status</th></tr>
          </thead>
          <tbody>
            <tr v-for="cmd in summary?.recentCommands ?? []" :key="cmd.id">
              <td>{{ new Date(cmd.created_at).toLocaleString() }}</td>
              <td><strong>{{ cmd.device_name }}</strong></td>
              <td>{{ cmd.command }}</td>
              <td>{{ cmd.parameter ?? '—' }}</td>
              <td><span class="badge" :class="badgeClass(cmd.status)">{{ cmd.status }}</span></td>
            </tr>
            <tr v-if="!summary?.recentCommands?.length"><td colspan="5" class="empty">No commands issued yet.</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.value small { font-size: 0.85rem; font-weight: 600; color: var(--text-muted); }
</style>
