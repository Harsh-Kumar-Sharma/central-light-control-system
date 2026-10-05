<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';

const username = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

const auth = useAuthStore();
const router = useRouter();

async function onSubmit() {
  error.value = '';
  loading.value = true;
  try {
    await auth.login(username.value, password.value);
    router.push('/');
  } catch (err) {
    error.value = err.response?.data?.error?.message ?? 'Login failed';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <section class="hero">
      <div class="logo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 22h4M12 2a7 7 0 00-4 12.7c.6.5 1 1.2 1 2V17h6v-.3c0-.8.4-1.5 1-2A7 7 0 0012 2z" /></svg>
      </div>
      <h1>Highway LED<br />Control &amp; Monitoring</h1>
      <p>Control, group and monitor every highway light from one dashboard — over LoRa and MQTT.</p>
      <ul>
        <li>Live online / offline status</li>
        <li>Brightness &amp; relay control</li>
        <li>Full command audit trail</li>
      </ul>
    </section>

    <section class="panel">
      <form class="card" @submit.prevent="onSubmit">
        <h2>Welcome back</h2>
        <p class="hint">Sign in to your account</p>

        <div v-if="error" class="alert error">{{ error }}</div>

        <div class="field">
          <label for="u">Username</label>
          <input id="u" v-model="username" type="text" autocomplete="username" required autofocus />
        </div>
        <div class="field">
          <label for="p">Password</label>
          <input id="p" v-model="password" type="password" autocomplete="current-password" required />
        </div>
        <button class="btn" type="submit" :disabled="loading">{{ loading ? 'Signing in…' : 'Sign in' }}</button>
      </form>
    </section>
  </div>
</template>

<style scoped>
.login-page { min-height: 100vh; display: grid; grid-template-columns: 1.1fr 1fr; background: var(--bg); }
.hero {
  background: linear-gradient(145deg, #1e1b4b 0%, #4338ca 55%, #0ea5a4 130%); color: #fff;
  display: flex; flex-direction: column; justify-content: center; padding: 3rem 4rem; gap: 1rem;
}
.logo {
  width: 62px; height: 62px; border-radius: 18px; display: grid; place-items: center;
  background: linear-gradient(135deg, #f59e0b, #ef4444 60%, #ec4899); box-shadow: 0 10px 28px rgba(239, 68, 68, 0.45);
}
.logo svg { width: 34px; height: 34px; }
.hero h1 { font-size: 2.3rem; line-height: 1.15; }
.hero p { opacity: 0.85; max-width: 420px; margin: 0; font-size: 1.05rem; }
.hero ul { list-style: none; padding: 0; margin: 0.6rem 0 0; display: flex; flex-direction: column; gap: 0.5rem; }
.hero li::before { content: '✓'; display: inline-grid; place-items: center; width: 22px; height: 22px; margin-right: 0.6rem; border-radius: 50%; background: rgba(255, 255, 255, 0.2); font-size: 0.8rem; }
.panel { display: grid; place-items: center; padding: 2rem; }
form.card { width: 100%; max-width: 380px; display: flex; flex-direction: column; gap: 1rem; padding: 2rem; margin: 0; }
form.card .hint { margin: -0.6rem 0 0; }
@media (max-width: 800px) {
  .login-page { grid-template-columns: 1fr; }
  .hero { padding: 2rem; }
  .hero ul { display: none; }
}
</style>
