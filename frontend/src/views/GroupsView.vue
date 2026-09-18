<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { groupsApi, devicesApi } from '../api/resources.js';
import { useAuthStore } from '../stores/auth.js';

const auth = useAuthStore();
const isAdmin = computed(() => auth.role === 'Admin');

const groups = ref([]);
const devices = ref([]);
const error = ref('');

const newGroup = reactive({ name: '', deviceIds: [] });

const selectedGroupId = ref('');
const brightness = ref(50);
const groupResult = ref(null);

async function load() {
  [groups.value, devices.value] = await Promise.all([groupsApi.list(), devicesApi.list()]);
}

async function createGroup() {
  error.value = '';
  try {
    await groupsApi.create({ name: newGroup.name, deviceIds: newGroup.deviceIds.map(Number) });
    Object.assign(newGroup, { name: '', deviceIds: [] });
    await load();
  } catch (err) {
    error.value = err.response?.data?.error?.message ?? 'Failed to create group';
  }
}

async function sendGroupBrightness() {
  error.value = '';
  groupResult.value = null;
  if (!selectedGroupId.value) {
    error.value = 'Select a group first';
    return;
  }
  try {
    groupResult.value = await groupsApi.sendCommand(selectedGroupId.value, { type: 'brightness', value: Number(brightness.value) });
  } catch (err) {
    error.value = err.response?.data?.error ?? 'Group command failed';
  }
}

// PARTIAL_SUCCESS is rendered distinctly (amber) from full SUCCESS/FAILED,
// per SRS §7.2 — never collapsed to a plain "Success".
function resultClass(aggregate) {
  if (aggregate === 'SUCCESS') return 'ok';
  if (aggregate === 'PARTIAL_SUCCESS') return 'partial';
  return 'fail';
}

onMounted(load);
</script>

<template>
  <div>
    <h1>Group Management</h1>
    <p v-if="error" class="error">{{ error }}</p>

    <table>
      <thead><tr><th>Name</th><th>Members</th></tr></thead>
      <tbody>
        <tr v-for="g in groups" :key="g.id"><td>{{ g.name }}</td><td>{{ g.member_count }}</td></tr>
      </tbody>
    </table>

    <form v-if="isAdmin" @submit.prevent="createGroup" class="inline-form">
      <input v-model="newGroup.name" placeholder="Group name" required />
      <select v-model="newGroup.deviceIds" multiple>
        <option v-for="d in devices" :key="d.id" :value="d.id">{{ d.device_name }}</option>
      </select>
      <button type="submit">Create Group</button>
    </form>

    <h2>Group Control</h2>
    <label>
      Select Group
      <select v-model="selectedGroupId">
        <option disabled value="">— choose a group —</option>
        <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
      </select>
    </label>
    <input v-model="brightness" type="number" min="1" max="99" />
    <button @click="sendGroupBrightness">Apply to Group</button>

    <div v-if="groupResult">
      <h3 :class="resultClass(groupResult.aggregate)">Group Result: {{ groupResult.aggregate }}</h3>
      <table>
        <thead><tr><th>Receiver ID</th><th>Status</th></tr></thead>
        <tbody>
          <tr v-for="r in groupResult.results" :key="r.receiverId">
            <td>{{ r.receiverId }}</td><td>{{ r.status }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
table { border-collapse: collapse; width: 100%; margin-bottom: 0.75rem; }
th, td { border: 1px solid #ddd; padding: 0.4rem 0.6rem; text-align: left; }
.inline-form { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; margin-bottom: 1.5rem; }
.error { color: #c0392b; }
.ok { color: #2e7d32; }
.partial { color: #b8860b; }
.fail { color: #c0392b; }
</style>
