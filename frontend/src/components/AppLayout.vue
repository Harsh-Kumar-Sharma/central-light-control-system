<script setup>
import { computed } from 'vue';
import { useAuthStore } from '../stores/auth.js';

const auth = useAuthStore();
const isAdmin = computed(() => auth.role === 'Admin');
const canControl = computed(() => auth.role === 'Admin' || auth.role === 'Operator');
</script>

<template>
  <div class="layout">
    <nav>
      <div class="brand">Highway LED Control</div>
      <router-link to="/">Dashboard</router-link>
      <router-link to="/devices">Devices</router-link>
      <router-link v-if="canControl" to="/control">Control</router-link>
      <router-link v-if="canControl" to="/groups">Groups</router-link>
      <router-link to="/status">Status</router-link>
      <router-link v-if="isAdmin" to="/configuration">Configuration</router-link>
      <router-link v-if="isAdmin" to="/users">Users</router-link>
      <router-link v-if="canControl" to="/logs">Logs</router-link>
      <div class="spacer" />
      <span>{{ auth.user?.username }} ({{ auth.role }})</span>
      <button @click="auth.logout()">Sign out</button>
    </nav>
    <main>
      <router-view />
    </main>
  </div>
</template>

<style scoped>
nav {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #ddd;
  flex-wrap: wrap;
}
.brand { font-weight: 700; margin-right: 0.5rem; }
.spacer { flex: 1; }
main { padding: 1rem; }
a.router-link-active { font-weight: 700; }
</style>
