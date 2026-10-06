<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { usersApi } from '../api/resources.js';
import { useAuthStore } from '../stores/auth.js';
import { badgeClass } from '../utils/status.js';
import Modal from '../components/Modal.vue';

const auth = useAuthStore();
const users = ref([]);
const catalog = ref({ modules: {}, roleDefaults: {} });
const error = ref('');
const newUser = reactive({ username: '', password: '', role: 'Operator' });
const roleColor = { Admin: 'blue', Operator: 'amber', User: 'gray' };

const canCreate = computed(() => auth.can('users', 'create'));
const canEdit = computed(() => auth.can('users', 'edit'));
const isSelf = (u) => u.id === auth.user?.id;

async function load() {
  [users.value, catalog.value] = await Promise.all([usersApi.list(), usersApi.catalog()]);
}

function fail(err, fallback) {
  error.value = err.response?.data?.error?.message ?? fallback;
}

async function createUser() {
  error.value = '';
  try {
    await usersApi.create({ ...newUser });
    Object.assign(newUser, { username: '', password: '', role: 'Operator' });
    await load();
  } catch (err) {
    fail(err, 'Failed to create user');
  }
}

async function toggleStatus(user) {
  error.value = '';
  try {
    await usersApi.update(user.id, { status: user.status === 'active' ? 'disabled' : 'active' });
    await load();
  } catch (err) {
    fail(err, 'Failed to update user');
  }
}

// ---- permission editor ----
const editor = reactive({ open: false, user: null, role: 'Operator', grid: {}, saving: false });
const moduleList = computed(() => Object.entries(catalog.value.modules));

const cloneGrid = (g) => Object.fromEntries(Object.entries(g ?? {}).map(([m, a]) => [m, [...a]]));

function openEditor(u) {
  error.value = '';
  Object.assign(editor, { open: true, user: u, role: u.role, grid: cloneGrid(u.permissions), saving: false });
}
const has = (m, a) => editor.grid[m]?.includes(a) ?? false;
function toggle(m, a) {
  const cur = new Set(editor.grid[m] ?? []);
  if (cur.has(a)) cur.delete(a);
  else cur.add(a);
  editor.grid[m] = [...cur];
}
const toggleModule = (m, on) => { editor.grid[m] = on ? Object.keys(catalog.value.modules[m].actions) : []; };
const moduleAll = (m) => Object.keys(catalog.value.modules[m].actions).every((a) => has(m, a));
function applyTemplate(role) {
  editor.role = role;
  editor.grid = cloneGrid(catalog.value.roleDefaults[role]);
}

async function savePermissions() {
  editor.saving = true;
  error.value = '';
  try {
    const u = editor.user;
    const payload = {};
    if (editor.role !== u.role) payload.role = editor.role;
    payload.permissions = editor.role === 'Admin' ? null : editor.grid;
    await usersApi.update(u.id, payload);
    editor.open = false;
    await load();
  } catch (err) {
    fail(err, 'Failed to save permissions');
  } finally {
    editor.saving = false;
  }
}

async function resetToRole() {
  editor.saving = true;
  try {
    await usersApi.update(editor.user.id, { permissions: null });
    editor.open = false;
    await load();
  } catch (err) {
    fail(err, 'Failed to reset');
  } finally {
    editor.saving = false;
  }
}

const count = (u) => Object.values(u.permissions ?? {}).reduce((n, a) => n + a.length, 0);
const total = computed(() => Object.values(catalog.value.modules).reduce((n, m) => n + Object.keys(m.actions).length, 0));

onMounted(load);
</script>

<template>
  <div>
    <div v-if="error" class="alert error">{{ error }}</div>

    <div class="card">
      <div class="card-title"><h2>Users</h2></div>
      <p class="hint">Each user gets a role template, which you can then fine-tune per module.</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Username</th><th>Role</th><th>Access</th><th>Status</th><th></th></tr></thead>
          <tbody>
            <tr v-for="u in users" :key="u.id">
              <td><strong>{{ u.username }}</strong> <span v-if="isSelf(u)" class="you">you</span></td>
              <td><span class="badge" :class="roleColor[u.role] ?? 'gray'">{{ u.role }}</span></td>
              <td>
                <span class="access">{{ count(u) }} / {{ total }}</span>
                <span v-if="u.custom_permissions" class="badge amber custom">custom</span>
              </td>
              <td><span class="badge" :class="badgeClass(u.status)">{{ u.status }}</span></td>
              <td class="acts">
                <button v-if="canEdit && !isSelf(u)" class="btn secondary sm" data-action="permissions" @click="openEditor(u)">Permissions</button>
                <button v-if="canEdit && !isSelf(u)" class="btn sm" :class="u.status === 'active' ? 'danger' : 'success'" @click="toggleStatus(u)">
                  {{ u.status === 'active' ? 'Disable' : 'Enable' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <form v-if="canCreate" class="form-row" @submit.prevent="createUser">
        <input v-model="newUser.username" placeholder="Username" required />
        <input v-model="newUser.password" placeholder="Password" type="password" required />
        <select v-model="newUser.role">
          <option value="Admin">Admin</option>
          <option value="Operator">Operator</option>
          <option value="User">User (view only)</option>
        </select>
        <button class="btn" type="submit">+ Create user</button>
      </form>
    </div>

    <Modal v-if="editor.open" :title="`Permissions — ${editor.user.username}`" width="720px" @close="editor.open = false">
      <div class="tpl">
        <label for="tplrole">Role</label>
        <select id="tplrole" :value="editor.role" @change="applyTemplate($event.target.value)">
          <option value="Admin">Admin (everything)</option>
          <option value="Operator">Operator</option>
          <option value="User">User (view only)</option>
        </select>
        <span class="hint">Changing the role loads its template. Tick boxes below to adjust.</span>
      </div>

      <p v-if="editor.role === 'Admin'" class="alert info">Admins always have every permission.</p>
      <div class="table-wrap" :class="{ locked: editor.role === 'Admin' }">
        <table class="grid">
          <tbody>
            <tr v-for="[m, def] in moduleList" :key="m">
              <th scope="row">
                <label class="all">
                  <input type="checkbox" :checked="editor.role === 'Admin' || moduleAll(m)" :disabled="editor.role === 'Admin'" @change="toggleModule(m, $event.target.checked)" />
                  {{ def.label }}
                </label>
              </th>
              <td v-for="(label, a) in def.actions" :key="a">
                <label class="act-box">
                  <input type="checkbox" :checked="editor.role === 'Admin' || has(m, a)" :disabled="editor.role === 'Admin'" :data-perm="`${m}.${a}`" @change="toggle(m, a)" />
                  {{ label }}
                </label>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="hint">Changes apply to the user immediately, even if they are signed in.</p>

      <template #footer>
        <button v-if="editor.user.custom_permissions" class="btn secondary" :disabled="editor.saving" @click="resetToRole">Reset to role default</button>
        <button class="btn secondary" @click="editor.open = false">Cancel</button>
        <button class="btn" :disabled="editor.saving" @click="savePermissions">{{ editor.saving ? 'Saving…' : 'Save permissions' }}</button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.you { font-size: 0.7rem; color: var(--text-muted); border: 1px solid var(--border); border-radius: 999px; padding: 0 0.4rem; margin-left: 0.3rem; }
.access { font-variant-numeric: tabular-nums; color: var(--text-muted); margin-right: 0.4rem; }
.custom { font-size: 0.7rem; }
.acts { display: flex; gap: 0.4rem; }
.tpl { display: flex; align-items: center; gap: 0.7rem; flex-wrap: wrap; margin-bottom: 0.9rem; }
.tpl .hint { margin: 0; }
.grid th { background: transparent; text-transform: none; letter-spacing: 0; font-size: 0.9rem; color: var(--text); white-space: nowrap; }
.grid, .grid tbody { display: block; }
.grid tr { display: flex; width: 100%; flex-wrap: wrap; align-items: center; padding: 0.35rem 0.5rem; border-top: 1px solid var(--border); }
.grid tr:first-child { border-top: 0; }
.grid th { width: 140px; padding: 0.3rem 0.4rem; }
.grid td { border: 0; padding: 0.3rem 0.6rem; white-space: nowrap; }
.grid tbody tr:hover { background: transparent; }
.all, .act-box { display: inline-flex; align-items: center; gap: 0.4rem; cursor: pointer; font-weight: 600; color: var(--text); }
.act-box { font-weight: 500; color: var(--text-muted); font-size: 0.85rem; }
.grid input[type='checkbox'] { accent-color: var(--primary); width: 16px; height: 16px; padding: 0; }
.locked { opacity: 0.6; }
</style>
