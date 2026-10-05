<script setup>
import { onMounted, reactive, ref } from 'vue';
import { usersApi } from '../api/resources.js';
import { badgeClass } from '../utils/status.js';

const users = ref([]);
const error = ref('');
const newUser = reactive({ username: '', password: '', role: 'Operator' });

const roleColor = { Admin: 'blue', Operator: 'amber', User: 'gray' };

async function load() {
  users.value = await usersApi.list();
}

async function createUser() {
  error.value = '';
  try {
    await usersApi.create({ ...newUser });
    Object.assign(newUser, { username: '', password: '', role: 'Operator' });
    await load();
  } catch (err) {
    error.value = err.response?.data?.error?.message ?? 'Failed to create user';
  }
}

async function toggleStatus(user) {
  error.value = '';
  try {
    await usersApi.update(user.id, { status: user.status === 'active' ? 'disabled' : 'active' });
    await load();
  } catch (err) {
    error.value = err.response?.data?.error?.message ?? 'Failed to update user';
  }
}

onMounted(load);
</script>

<template>
  <div>
    <div v-if="error" class="alert error">{{ error }}</div>

    <div class="card">
      <div class="card-title"><h2>Users</h2></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Username</th><th>Role</th><th>Status</th><th></th></tr></thead>
          <tbody>
            <tr v-for="u in users" :key="u.id">
              <td><strong>{{ u.username }}</strong></td>
              <td><span class="badge" :class="roleColor[u.role] ?? 'gray'">{{ u.role }}</span></td>
              <td><span class="badge" :class="badgeClass(u.status)">{{ u.status }}</span></td>
              <td>
                <button class="btn sm" :class="u.status === 'active' ? 'danger' : 'success'" @click="toggleStatus(u)">
                  {{ u.status === 'active' ? 'Disable' : 'Enable' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <form class="form-row" @submit.prevent="createUser">
        <input v-model="newUser.username" placeholder="Username" required />
        <input v-model="newUser.password" placeholder="Password" type="password" required />
        <select v-model="newUser.role">
          <option value="Admin">Admin</option>
          <option value="Operator">Operator</option>
          <option value="User">User</option>
        </select>
        <button class="btn" type="submit">+ Create user</button>
      </form>
    </div>
  </div>
</template>
