<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
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
const editingId = ref(null); // null = the form creates a new group
const saving = ref(false);
const formEl = ref(null);

const selectedGroupId = ref('');
const brightness = ref(50);
const relaySel = ref('both');
const busy = ref(false);
const groupResult = ref(null);
const nameOf = (id) => devices.value.find((d) => d.id === id)?.device_name ?? `Device ${id}`;

async function load() {
  [groups.value, devices.value] = await Promise.all([groupsApi.list(), devicesApi.list()]);
  if (selectedGroupId.value && !groups.value.some((g) => g.id === selectedGroupId.value)) selectedGroupId.value = '';
}

const apiMessage = (err, fallback) => {
  const data = err.response?.data;
  return data?.error?.message ?? data?.message ?? (typeof data?.error === 'string' ? data.error : fallback);
};

function resetForm() {
  editingId.value = null;
  Object.assign(newGroup, { name: '', deviceIds: [] });
}

async function editGroup(g) {
  error.value = '';
  try {
    const full = await groupsApi.get(g.id);
    editingId.value = g.id;
    Object.assign(newGroup, { name: full.name, deviceIds: full.deviceIds });
    await nextTick();
    formEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    error.value = apiMessage(err, 'Could not load the group');
  }
}

async function saveGroup() {
  error.value = '';
  saving.value = true;
  try {
    const payload = { name: newGroup.name.trim(), deviceIds: newGroup.deviceIds.map(Number) };
    if (editingId.value) await groupsApi.update(editingId.value, payload);
    else await groupsApi.create(payload);
    resetForm();
    await load();
  } catch (err) {
    error.value = apiMessage(err, editingId.value ? 'Failed to save the group' : 'Failed to create group');
  } finally {
    saving.value = false;
  }
}

async function removeGroup(g) {
  if (!window.confirm(`Delete the group "${g.name}"? The lights themselves are not changed.`)) return;
  error.value = '';
  try {
    await groupsApi.remove(g.id);
    if (editingId.value === g.id) resetForm();
    await load();
  } catch (err) {
    error.value = apiMessage(err, 'Failed to delete the group');
  }
}

// One group command per relay; a light counts as done only if every command for it was confirmed.
function merge(runs) {
  const byLight = new Map();
  for (const run of runs) {
    for (const r of run.results ?? []) {
      const prev = byLight.get(r.receiverId);
      if (!prev || (prev.status === 'SUCCESS' && r.status !== 'SUCCESS')) byLight.set(r.receiverId, r);
    }
  }
  const results = [...byLight.values()];
  const ok = results.filter((r) => r.status === 'SUCCESS' || r.status === 'SENT_OVER_LORA').length;
  const aggregate = results.length === 0 || ok === 0 ? 'FAILED' : ok === results.length ? 'SUCCESS' : 'PARTIAL_SUCCESS';
  return { aggregate, results };
}

async function runGroup(commands) {
  error.value = '';
  groupResult.value = null;
  if (!selectedGroupId.value) { error.value = 'Select a group first'; return; }
  busy.value = true;
  try {
    const runs = [];
    for (const c of commands) runs.push(await groupsApi.sendCommand(selectedGroupId.value, c));
    groupResult.value = merge(runs);
  } catch (err) {
    error.value = apiMessage(err, 'Group command failed');
  } finally {
    busy.value = false;
  }
}

const relayTypes = () => (relaySel.value === 'both' ? ['relay1', 'relay2'] : [`relay${relaySel.value}`]);
const sendGroupSwitch = (state) => runGroup(relayTypes().map((type) => ({ type, state })));
const sendGroupBrightness = () => runGroup([{ type: 'brightness', value: Number(brightness.value) }]);
const selectedGroup = computed(() => groups.value.find((g) => g.id === selectedGroupId.value) ?? null);

onMounted(load);
</script>

<template>
  <div>
    <div v-if="error" class="alert error">{{ error }}</div>

    <div class="card">
      <div class="card-title"><h2>Groups</h2></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Members</th><th v-if="isAdmin" class="actions-col">Actions</th></tr></thead>
          <tbody>
            <tr v-for="g in groups" :key="g.id">
              <td><strong>{{ g.name }}</strong></td>
              <td><span class="badge blue">{{ g.member_count }} devices</span></td>
              <td v-if="isAdmin" class="actions-col">
                <button type="button" class="btn sm secondary" @click="editGroup(g)">Edit</button>
                <button type="button" class="btn sm danger" @click="removeGroup(g)">Delete</button>
              </td>
            </tr>
            <tr v-if="!groups.length"><td :colspan="isAdmin ? 3 : 2" class="empty">No groups yet.</td></tr>
          </tbody>
        </table>
      </div>

      <form v-if="isAdmin" ref="formEl" class="new-group" @submit.prevent="saveGroup">
        <h3>{{ editingId ? 'Edit group' : 'New group' }}</h3>
        <div class="field">
          <label for="g-name">Group name</label>
          <input id="g-name" v-model="newGroup.name" placeholder="e.g. Toll plaza lights" maxlength="128" required />
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
        <div class="form-actions">
          <button class="btn" type="submit" :disabled="saving">{{ editingId ? 'Save changes' : '+ Create group' }}</button>
          <button v-if="editingId" class="btn secondary" type="button" @click="resetForm">Cancel</button>
        </div>
      </form>
    </div>

    <div v-if="canSend" class="card">
      <div class="card-title"><h2>Group control</h2></div>
      <div class="control-row">
        <div class="field grow">
          <label for="g-pick">Group</label>
          <select id="g-pick" v-model="selectedGroupId">
            <option disabled value="">— choose a group —</option>
            <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }} ({{ g.member_count }})</option>
          </select>
        </div>
        <div class="field">
          <label for="g-relay">Relays</label>
          <select id="g-relay" v-model="relaySel">
            <option value="both">Both relays</option>
            <option value="1">Relay 1 only</option>
            <option value="2">Relay 2 only</option>
          </select>
        </div>
        <button class="btn success" :disabled="busy || !selectedGroupId" @click="sendGroupSwitch(true)">All ON</button>
        <button class="btn danger" :disabled="busy || !selectedGroupId" @click="sendGroupSwitch(false)">All OFF</button>
      </div>
      <div class="control-row dim-row">
        <div class="field">
          <label for="g-bri">Brightness (1–99)</label>
          <input id="g-bri" v-model="brightness" type="number" min="1" max="99" inputmode="numeric" />
        </div>
        <button class="btn" :disabled="busy || !selectedGroupId" @click="sendGroupBrightness">Apply to group</button>
        <span v-if="busy" class="hint">Sending to {{ selectedGroup?.member_count ?? '' }} lights, one at a time…</span>
      </div>

      <div v-if="groupResult" class="result">
        <div class="card-title">
          <h2>Group result</h2>
          <span class="badge" :class="badgeClass(groupResult.aggregate)">{{ groupResult.aggregate }}</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Light</th><th>Status</th></tr></thead>
            <tbody>
              <tr v-for="r in groupResult.results" :key="r.receiverId">
                <td>{{ nameOf(r.receiverId) }}</td>
                <td><span class="badge" :class="badgeClass(r.status)">{{ r.status }}</span><span v-if="r.error" class="hint"> {{ r.error }}</span></td>
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

.actions-col { text-align: right; white-space: nowrap; }
.actions-col .btn + .btn { margin-left: 0.4rem; }
.form-actions { display: flex; gap: 0.6rem; flex-wrap: wrap; }
.dim-row { margin-top: 0.9rem; }
.control-row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.75rem; }
.control-row .grow { flex: 1 1 220px; }
.control-row .field:not(.grow) { flex: 0 1 170px; }
@media (max-width: 600px) {
  .control-row .field, .control-row .field:not(.grow), .control-row .btn { flex: 1 1 100%; }
}
</style>
