<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { groupsApi, devicesApi } from '../api/resources.js';
import { useAuthStore } from '../stores/auth.js';
import { badgeClass } from '../utils/status.js';

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
    error.value = err.response?.data?.error ?? err.response?.data?.message ?? 'Group command failed';
  }
}

onMounted(load);
</script>

<template>
  <div>
    <div v-if="error" class="alert error">{{ error }}</div>

    <div class="card">
      <div class="card-title"><h2>Groups</h2></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Members</th></tr></thead>
          <tbody>
            <tr v-for="g in groups" :key="g.id">
              <td><strong>{{ g.name }}</strong></td>
              <td><span class="badge blue">{{ g.member_count }} devices</span></td>
            </tr>
            <tr v-if="!groups.length"><td colspan="2" class="empty">No groups yet.</td></tr>
          </tbody>
        </table>
      </div>

      <form v-if="isAdmin" @submit.prevent="createGroup" class="form-row">
        <input v-model="newGroup.name" placeholder="Group name" required />
        <select v-model="newGroup.deviceIds" multiple class="multi">
          <option v-for="d in devices" :key="d.id" :value="d.id">{{ d.device_name }}</option>
        </select>
        <button class="btn" type="submit">+ Create group</button>
      </form>
      <p v-if="isAdmin" class="hint">Hold Ctrl / Cmd to select several devices.</p>
    </div>

    <div class="card">
      <div class="card-title"><h2>Group control</h2></div>
      <div class="form-row first">
        <select v-model="selectedGroupId">
          <option disabled value="">— choose a group —</option>
          <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
        </select>
        <input v-model="brightness" type="number" min="1" max="99" placeholder="Brightness 1–99" />
        <button class="btn" @click="sendGroupBrightness">Apply to group</button>
      </div>

      <div v-if="groupResult" class="result">
        <div class="card-title">
          <h2>Group result</h2>
          <span class="badge" :class="badgeClass(groupResult.aggregate)">{{ groupResult.aggregate }}</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Receiver ID</th><th>Status</th></tr></thead>
            <tbody>
              <tr v-for="r in groupResult.results" :key="r.receiverId">
                <td>{{ r.receiverId }}</td>
                <td><span class="badge" :class="badgeClass(r.status)">{{ r.status }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.multi { min-height: 90px; }
.form-row.first { margin-top: 0; }
.result { margin-top: 1.2rem; }
</style>
