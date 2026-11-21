<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { groupsApi, devicesApi } from '../api/resources.js';
import { useAuthStore } from '../stores/auth.js';
import { badgeClass } from '../utils/status.js';

const auth = useAuthStore();
const isAdmin = computed(() => auth.can('groups', 'create'));
const canSend = computed(() => auth.can('groups', 'control')); // "Send to group"

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
    const data = err.response?.data;
    error.value = data?.error?.message ?? data?.message ?? (typeof data?.error === 'string' ? data.error : 'Group command failed');
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

      <form v-if="isAdmin" class="new-group" @submit.prevent="createGroup">
        <h3>New group</h3>
        <div class="field">
          <label for="g-name">Group name</label>
          <input id="g-name" v-model="newGroup.name" placeholder="e.g. Toll plaza lights" required />
        </div>
        <fieldset class="field">
          <legend>
            <span>Devices</span>
            <span class="picked">{{ newGroup.deviceIds.length }} of {{ devices.length }} selected</span>
          </legend>
          <div v-if="devices.length" class="pick-tools">
            <button type="button" class="link-btn" @click="newGroup.deviceIds = devices.map((d) => d.id)">Select all</button>
            <button type="button" class="link-btn" :disabled="!newGroup.deviceIds.length" @click="newGroup.deviceIds = []">Clear</button>
          </div>
          <div class="pick-list" role="group" aria-label="Devices in the group">
            <label v-for="d in devices" :key="d.id" class="pick" :class="{ on: newGroup.deviceIds.includes(d.id) }">
              <input v-model="newGroup.deviceIds" type="checkbox" :value="d.id" />
              <span>{{ d.device_name }}</span>
            </label>
            <p v-if="!devices.length" class="hint none">No receivers yet — add them on the Devices page.</p>
          </div>
        </fieldset>
        <div><button class="btn" type="submit">+ Create group</button></div>
      </form>
    </div>

    <div v-if="canSend" class="card">
      <div class="card-title"><h2>Group control</h2></div>
      <div class="control-row">
        <div class="field grow">
          <label for="g-pick">Group</label>
          <select id="g-pick" v-model="selectedGroupId">
            <option disabled value="">— choose a group —</option>
            <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
          </select>
        </div>
        <div class="field">
          <label for="g-bri">Brightness (1–99)</label>
          <input id="g-bri" v-model="brightness" type="number" min="1" max="99" inputmode="numeric" />
        </div>
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
    <p v-else class="hint">You have view-only access to groups. Ask an Admin for the "Send to group" permission to control them.</p>
  </div>
</template>

<style scoped>
.result { margin-top: 1.2rem; }

.new-group { display: flex; flex-direction: column; gap: 0.9rem; margin-top: 1.2rem; padding-top: 1.1rem; border-top: 1px solid var(--border); }
.new-group h3 { font-size: 1rem; }
.new-group .field input { max-width: 420px; }
fieldset { border: 0; margin: 0; padding: 0; }
legend { display: flex; justify-content: space-between; gap: 0.5rem; width: 100%; padding: 0; margin-bottom: 0.3rem; font-size: 0.85rem; font-weight: 600; color: var(--text-muted); }
.picked { font-weight: 500; }
.pick-tools { display: flex; gap: 0.9rem; margin-bottom: 0.3rem; }
.link-btn { border: 0; background: none; padding: 0.2rem 0; font: inherit; font-size: 0.85rem; font-weight: 600; color: var(--primary); cursor: pointer; }
.link-btn:disabled { color: var(--text-muted); opacity: 0.6; cursor: default; }
.pick-list {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(min(240px, 100%), 1fr)); gap: 0.4rem;
  max-height: 260px; overflow-y: auto; padding: 0.5rem; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface-2);
}
.pick {
  display: flex; align-items: center; gap: 0.6rem; min-height: 40px; padding: 0.45rem 0.65rem; border: 1px solid transparent; border-radius: 8px;
  color: var(--text); font-weight: 500; font-size: 0.9rem; cursor: pointer; background: var(--surface);
}
.pick:hover { border-color: var(--border); }
.pick.on { border-color: var(--primary); background: var(--primary-soft); }
.pick input { width: 18px; height: 18px; flex: none; accent-color: var(--primary); }
.pick span { min-width: 0; overflow-wrap: anywhere; line-height: 1.3; }
.none { margin: 0.3rem; }

.control-row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.75rem; }
.control-row .grow { flex: 1 1 220px; }
.control-row .field:not(.grow) { flex: 0 1 170px; }
@media (max-width: 600px) {
  .control-row .field, .control-row .field:not(.grow), .control-row .btn { flex: 1 1 100%; }
}
</style>
