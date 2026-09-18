<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { transmittersApi, devicesApi } from '../api/resources.js';
import { useAuthStore } from '../stores/auth.js';

const auth = useAuthStore();
const isAdmin = computed(() => auth.role === 'Admin');

const transmitters = ref([]);
const devices = ref([]);
const error = ref('');

const newTransmitter = reactive({ name: '', junctionLocation: '', networkId: '', loraAddress: '', connectivityType: 'unknown' });
const newDevice = reactive({ deviceName: '', loraAddress: '', networkId: '', parentTransmitterId: '', location: '' });

async function load() {
  try {
    [transmitters.value, devices.value] = await Promise.all([transmittersApi.list(), devicesApi.list()]);
  } catch (err) {
    error.value = err.response?.data?.error?.message ?? 'Failed to load devices';
  }
}

async function createTransmitter() {
  error.value = '';
  try {
    await transmittersApi.create({
      name: newTransmitter.name,
      junctionLocation: newTransmitter.junctionLocation || null,
      networkId: newTransmitter.networkId ? Number(newTransmitter.networkId) : null,
      loraAddress: newTransmitter.loraAddress ? Number(newTransmitter.loraAddress) : null,
      connectivityType: newTransmitter.connectivityType,
    });
    Object.assign(newTransmitter, { name: '', junctionLocation: '', networkId: '', loraAddress: '', connectivityType: 'unknown' });
    await load();
  } catch (err) {
    error.value = err.response?.data?.error?.message ?? 'Failed to create transmitter';
  }
}

async function createDevice() {
  error.value = '';
  try {
    await devicesApi.create({
      deviceName: newDevice.deviceName,
      loraAddress: Number(newDevice.loraAddress),
      networkId: newDevice.networkId ? Number(newDevice.networkId) : null,
      parentTransmitterId: Number(newDevice.parentTransmitterId),
      location: newDevice.location || null,
    });
    Object.assign(newDevice, { deviceName: '', loraAddress: '', networkId: '', parentTransmitterId: '', location: '' });
    await load();
  } catch (err) {
    error.value = err.response?.data?.error?.message ?? 'Failed to create device';
  }
}

onMounted(load);
</script>

<template>
  <div>
    <h1>Device Management</h1>
    <p v-if="error" class="error">{{ error }}</p>

    <section>
      <h2>Transmitters</h2>
      <table>
        <thead><tr><th>Name</th><th>Junction</th><th>Network ID</th><th>LoRa Address</th><th>Connectivity</th><th>Status</th></tr></thead>
        <tbody>
          <tr v-for="t in transmitters" :key="t.id">
            <td>{{ t.name }}</td><td>{{ t.junction_location ?? '—' }}</td><td>{{ t.network_id ?? '—' }}</td>
            <td>{{ t.lora_address ?? '—' }}</td><td>{{ t.connectivity_type }}</td><td>{{ t.status }}</td>
          </tr>
        </tbody>
      </table>

      <form v-if="isAdmin" @submit.prevent="createTransmitter" class="inline-form">
        <input v-model="newTransmitter.name" placeholder="Name" required />
        <input v-model="newTransmitter.junctionLocation" placeholder="Junction location" />
        <input v-model="newTransmitter.networkId" placeholder="Network ID" type="number" />
        <input v-model="newTransmitter.loraAddress" placeholder="LoRa address" type="number" />
        <select v-model="newTransmitter.connectivityType">
          <option value="unknown">Unknown</option>
          <option value="fiber">Fiber</option>
          <option value="gsm">GSM</option>
          <option value="lan">LAN</option>
        </select>
        <button type="submit">Add Transmitter</button>
      </form>
    </section>

    <section>
      <h2>Receivers</h2>
      <table>
        <thead><tr><th>Name</th><th>Transmitter</th><th>LoRa Address</th><th>Location</th><th>Status</th></tr></thead>
        <tbody>
          <tr v-for="d in devices" :key="d.id">
            <td>{{ d.device_name }}</td><td>{{ d.transmitter_name }}</td><td>{{ d.lora_address }}</td>
            <td>{{ d.location ?? '—' }}</td><td>{{ d.status }}</td>
          </tr>
        </tbody>
      </table>

      <form v-if="isAdmin" @submit.prevent="createDevice" class="inline-form">
        <input v-model="newDevice.deviceName" placeholder="Device name" required />
        <select v-model="newDevice.parentTransmitterId" required>
          <option disabled value="">Parent transmitter</option>
          <option v-for="t in transmitters" :key="t.id" :value="t.id">{{ t.name }}</option>
        </select>
        <input v-model="newDevice.loraAddress" placeholder="LoRa address" type="number" required />
        <input v-model="newDevice.networkId" placeholder="Network ID" type="number" />
        <input v-model="newDevice.location" placeholder="Location" />
        <button type="submit">Add Receiver</button>
      </form>
    </section>
  </div>
</template>

<style scoped>
section { margin-bottom: 2rem; }
table { border-collapse: collapse; width: 100%; margin-bottom: 0.75rem; }
th, td { border: 1px solid #ddd; padding: 0.4rem 0.6rem; text-align: left; }
.inline-form { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
.inline-form input, .inline-form select { padding: 0.4rem; }
.error { color: #c0392b; }
</style>
