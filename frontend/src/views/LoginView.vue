<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import BrandLogo from '../components/BrandLogo.vue';
import ThemeToggle from '../components/ThemeToggle.vue';
import CopyrightLine from '../components/CopyrightLine.vue';

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
      <span class="orb orb-a" aria-hidden="true" />
      <span class="orb orb-b" aria-hidden="true" />

      <div class="hero-body">
        <BrandLogo :height="112" />
        <h1>Highway LED<br />Control &amp; Monitoring</h1>
        <p>Control, group and monitor every highway light from one dashboard — over LoRa and MQTT.</p>
        <ul>
          <li>Live online / offline status</li>
          <li>Brightness &amp; relay control</li>
          <li>Road map with every light on it</li>
          <li>Full command audit trail</li>
        </ul>
      </div>
      <div class="hero-foot"><CopyrightLine /></div>
    </section>

    <section class="panel">
      <div class="panel-top"><ThemeToggle /></div>

      <form class="card" @submit.prevent="onSubmit">
        <h2>Welcome back</h2>
        <p class="hint">Sign in to your account</p>

        <div v-if="error" class="alert error" role="alert">{{ error }}</div>

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

      <div class="panel-foot"><CopyrightLine /></div>
    </section>
  </div>
</template>

<style scoped>
.login-page { min-height: 100vh; display: grid; grid-template-columns: 1.1fr 1fr; background: var(--bg); }

.hero {
  position: relative; overflow: hidden; background: var(--hero-bg); color: #fff;
  display: flex; flex-direction: column; justify-content: space-between; padding: 3rem 4rem 1.6rem;
}
.hero-body { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 1.1rem; margin: auto 0; padding: 2rem 0; }
.hero h1 { font-size: 2.3rem; line-height: 1.15; margin-top: 0.6rem; }
.hero p { margin: 0; max-width: 430px; font-size: 1.05rem; color: #d6dcff; }
.hero ul { list-style: none; padding: 0; margin: 0.4rem 0 0; display: flex; flex-direction: column; gap: 0.55rem; color: #e6eaff; }
.hero li::before {
  content: '✓'; display: inline-grid; place-items: center; width: 22px; height: 22px; margin-right: 0.65rem;
  border-radius: 50%; background: rgba(70, 165, 255, 0.28); color: #bfe0ff; font-size: 0.78rem;
}
.hero-foot { position: relative; font-size: 0.78rem; color: #aab4ee; }
.orb { position: absolute; border-radius: 50%; pointer-events: none; }
.orb-a { width: 420px; height: 420px; right: -140px; top: -120px; background: radial-gradient(circle, rgba(70, 165, 255, 0.35), transparent 68%); }
.orb-b { width: 360px; height: 360px; left: -120px; bottom: -140px; background: radial-gradient(circle, rgba(150, 160, 255, 0.28), transparent 68%); }

.panel { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4.2rem 2rem 4rem; }
.panel-top { position: absolute; top: 1.1rem; right: 1.3rem; }
.panel-foot { display: none; position: absolute; bottom: 1.2rem; left: 0; right: 0; text-align: center; font-size: 0.78rem; color: var(--text-muted); }
form.card { width: 100%; max-width: 390px; display: flex; flex-direction: column; gap: 1rem; padding: 2rem; margin: 0; }
form.card h2 { font-size: 1.35rem; }
form.card .hint { margin: -0.6rem 0 0; }

@media (max-width: 800px) {
  .login-page { grid-template-columns: 1fr; }
  .hero { padding: 1.6rem 1.6rem 1rem; }
  .hero-body { padding: 0.4rem 0; gap: 0.7rem; }
  .hero h1 { font-size: 1.5rem; }
  .hero-body .brand-logo { height: 64px !important; } /* beats the size set on the logo itself */
  form.card { padding: 1.5rem 1.25rem; }
  .hero ul, .hero p { display: none; }
  .hero-foot { display: none; }
  .panel-foot { display: block; }
  .panel { padding: 3.6rem 1.2rem 3.6rem; }
}
</style>
