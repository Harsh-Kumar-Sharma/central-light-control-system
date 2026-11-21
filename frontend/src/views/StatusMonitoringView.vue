<script setup>
import { computed, onMounted, ref } from 'vue';
import { devicesApi } from '../api/resources.js';
import { badgeClass } from '../utils/status.js';

const rows = ref([]);
const error = ref('');

const onlineCount = computed(() => rows.value.filter((r) => r.status?.online).length);

async function load() {
  error.value = '';
  try {
    const [devices, statuses] = await Promise.all([devicesApi.list(), devicesApi.statusAll()]);
    const byId = new Map(statuses.map((s) => [s.receiver_id, s]));
    rows.value = devices.map((d) => ({ ...d, status: byId.get(d.id) ?? null }));
  } catch (err) {
    error.value = err.response?.data?.error?.message ?? 'Failed to load status';
  }
}

function relayText(value) {
  if (value === null || value === undefined) return '—';
  return value ? 'ON' : 'OFF';
}

onMounted(load);
</script>

<template>
  <div>
    <div v-if="error" class="alert error">{{ error }}</div>

    <div class="card">
      <div class="card-title">
        <div>
          <h2>Device health</h2>
          <p class="hint" style="margin: 0.2rem 0 0">{{ onlineCount }} of {{ rows.length }} receivers online</p>
        </div>
        <button class="btn secondary" @click="load">Refresh</button>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Device</th><th>Transmitter</th><th>Online</th><th>Last seen</th><th>Brightness</th><th>Relay 1</th><th>Relay 2</th><th>RSSI</th><th>SNR</th></tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id">
              <td><strong>{{ row.device_name }}</strong></td>
              <td>{{ row.transmitter_name }}</td>
              <td>
                <span class="badge" :class="badgeClass(row.status?.online ? 'ONLINE' : 'OFFLINE')">
                  {{ row.status?.online ? 'ONLINE' : 'OFFLINE' }}
                </span>
              </td>
              <td>{{ row.status?.last_seen ? new Date(row.status.last_seen).toLocaleString() : '—' }}</td>
              <td>{{ row.status?.brightness ?? '—' }}</td>
              <td><span v-if="row.status?.relay1 != null" class="badge" :class="row.status.relay1 ? 'green' : 'gray'">{{ relayText(row.status.relay1) }}</span><span v-else>—</span></td>
              <td><span v-if="row.status?.relay2 != null" class="badge" :class="row.status.relay2 ? 'green' : 'gray'">{{ relayText(row.status.relay2) }}</span><span v-else>—</span></td>
              <td>{{ row.status?.rssi ?? '—' }}</td>
              <td>{{ row.status?.snr ?? '—' }}</td>
            </tr>
            <tr v-if="!rows.length"><td colspan="9" class="empty">No receivers registered yet.</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
