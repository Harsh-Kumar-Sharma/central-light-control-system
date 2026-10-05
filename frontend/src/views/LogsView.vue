<script setup>
import { onMounted, ref } from 'vue';
import { auditApi } from '../api/resources.js';
import { badgeClass } from '../utils/status.js';

const commands = ref([]);
const error = ref('');

async function load() {
  error.value = '';
  try {
    commands.value = await auditApi.list();
  } catch (err) {
    error.value = err.response?.data?.error?.message ?? 'Failed to load logs';
  }
}

onMounted(load);
</script>

<template>
  <div>
    <div v-if="error" class="alert error">{{ error }}</div>

    <div class="card">
      <div class="card-title">
        <h2>Command audit trail</h2>
        <button class="btn secondary" @click="load">Refresh</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Time</th><th>User</th><th>Role</th><th>Device</th><th>Command</th>
              <th>Parameter</th><th>Status</th><th>RSSI</th><th>SNR</th><th>Error</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in commands" :key="c.id">
              <td>{{ new Date(c.created_at).toLocaleString() }}</td>
              <td><strong>{{ c.username }}</strong></td>
              <td>{{ c.user_role }}</td>
              <td>{{ c.device_name }}</td>
              <td>{{ c.command }}</td>
              <td>{{ c.parameter ?? '—' }}</td>
              <td><span class="badge" :class="badgeClass(c.status)">{{ c.status }}</span></td>
              <td>{{ c.rssi ?? '—' }}</td>
              <td>{{ c.snr ?? '—' }}</td>
              <td class="err">{{ c.error_code ?? '—' }}</td>
            </tr>
            <tr v-if="!commands.length"><td colspan="10" class="empty">No commands recorded yet.</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.err { max-width: 260px; overflow: hidden; text-overflow: ellipsis; color: var(--text-muted); }
</style>
