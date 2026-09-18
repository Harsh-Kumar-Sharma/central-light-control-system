<script setup>
import { onMounted, reactive, ref } from 'vue';
import { usersApi } from '../api/resources.js';

const users = ref([]);
const error = ref('');
const newUser = reactive({ username: '', password: '', role: 'Operator' });

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
    <h1>User Management</h1>
    <p v-if="error" class="error">{{ error }}</p>

    <table>
      <thead><tr><th>Username</th><th>Role</th><th>Status</th><th></th></tr></thead>
      <tbody>
        <tr v-for="u in users" :key="u.id">
          <td>{{ u.username }}</td><td>{{ u.role }}</td><td>{{ u.status }}</td>
          <td><button @click="toggleStatus(u)">{{ u.status === 'active' ? 'Disable' : 'Enable' }}</button></td>
        </tr>
      </tbody>
    </table>

    <form @submit.prevent="createUser" class="inline-form">
      <input v-model="newUser.username" placeholder="Username" required />
      <input v-model="newUser.password" placeholder="Password" type="password" required />
      <select v-model="newUser.role">
        <option value="Admin">Admin</option>
        <option value="Operator">Operator</option>
        <option value="User">User</option>
      </select>
      <button type="submit">Create User</button>
    </form>
  </div>
</template>

<style scoped>
table { border-collapse: collapse; width: 100%; margin-bottom: 0.75rem; }
th, td { border: 1px solid #ddd; padding: 0.4rem 0.6rem; text-align: left; }
.inline-form { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.error { color: #c0392b; }
</style>
