<script setup>
import { onMounted, ref } from 'vue';
import { auditApi } from '../api/resources.js';

const commands = ref([]);
const error = ref('');

async function load() {
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
    <h1>Command Audit Trail</h1>
    <p v-if="error" class="error">{{ error }}</p>
    <button @click="load">Refresh</button>

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
          <td>{{ c.username }}</td>
          <td>{{ c.user_role }}</td>
          <td>{{ c.device_name }}</td>
          <td>{{ c.command }}</td>
          <td>{{ c.parameter ?? '—' }}</td>
          <td>{{ c.status }}</td>
          <td>{{ c.rssi ?? '—' }}</td>
          <td>{{ c.snr ?? '—' }}</td>
          <td>{{ c.error_code ?? '—' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
th, td { border: 1px solid #ddd; padding: 0.4rem 0.6rem; text-align: left; }
.error { color: #c0392b; }
</style>
