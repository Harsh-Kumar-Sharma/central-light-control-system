<script setup>
import { onMounted, ref } from 'vue';
import { devicesApi } from '../api/resources.js';

const rows = ref([]);
const error = ref('');

async function load() {
  error.value = '';
  try {
    const devices = await devicesApi.list();
    rows.value = await Promise.all(
      devices.map(async (d) => ({ ...d, status: await devicesApi.status(d.id) }))
    );
  } catch (err) {
    error.value = err.response?.data?.error?.message ?? 'Failed to load status';
  }
}

onMounted(load);
</script>

<template>
  <div>
    <h1>Device Health and Status Monitoring</h1>
    <p v-if="error" class="error">{{ error }}</p>
    <button @click="load">Refresh</button>

    <table>
      <thead>
        <tr><th>Device</th><th>Transmitter</th><th>Online</th><th>Last Seen</th><th>Brightness</th><th>Relay 1</th><th>Relay 2</th><th>RSSI</th><th>SNR</th></tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id">
          <td>{{ row.device_name }}</td>
          <td>{{ row.transmitter_name }}</td>
          <td :class="row.status?.online ? 'ok' : 'fail'">{{ row.status?.online ? 'ONLINE' : 'OFFLINE' }}</td>
          <td>{{ row.status?.last_seen ? new Date(row.status.last_seen).toLocaleString() : '—' }}</td>
          <td>{{ row.status?.brightness ?? '—' }}</td>
          <td>{{ row.status?.relay1 === null || row.status?.relay1 === undefined ? '—' : row.status.relay1 ? 'ON' : 'OFF' }}</td>
          <td>{{ row.status?.relay2 === null || row.status?.relay2 === undefined ? '—' : row.status.relay2 ? 'ON' : 'OFF' }}</td>
          <td>{{ row.status?.rssi ?? '—' }}</td>
          <td>{{ row.status?.snr ?? '—' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
th, td { border: 1px solid #ddd; padding: 0.4rem 0.6rem; text-align: left; }
.ok { color: #2e7d32; font-weight: 700; }
.fail { color: #c0392b; font-weight: 700; }
.error { color: #c0392b; }
</style>
