<script setup>
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import BrandLogo from '../components/BrandLogo.vue';
import ThemeToggle from '../components/ThemeToggle.vue';
import CopyrightLine from '../components/CopyrightLine.vue';

const username = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);
const showPassword = ref(false);
const capsLock = ref(false);

const auth = useAuthStore();
const router = useRouter();

async function onSubmit() {
  error.value = '';
  loading.value = true;
  try {
    await auth.login(username.value, password.value);
    router.push('/');
  } catch (err) {
    error.value = err.response
      ? err.response.data?.error?.message ?? 'Login failed'
      : 'Cannot reach the server. Check your connection and try again.';
  } finally {
    loading.value = false;
  }
}

// The old error goes away as soon as the user starts correcting their input.
watch([username, password], () => { if (error.value && !loading.value) error.value = ''; });

function checkCaps(e) {
  if (typeof e.getModifierState === 'function') capsLock.value = e.getModifierState('CapsLock');
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
    </section>

    <section class="panel">
      <div class="panel-top"><ThemeToggle /></div>

      <main class="panel-main">
        <form class="card" @submit.prevent="onSubmit">
          <div class="form-head">
            <h2>Welcome back</h2>
            <p class="hint">Sign in to your account to continue</p>
          </div>

          <div v-if="error" id="login-error" class="alert error" role="alert">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></svg>
            <span>{{ error }}</span>
          </div>

          <div class="field">
            <label for="u">Username</label>
            <div class="input-wrap">
              <svg class="lead" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" /></svg>
              <input
                id="u"
                v-model="username"
                type="text"
                name="username"
                autocomplete="username"
                autocapitalize="none"
                autocorrect="off"
                spellcheck="false"
                enterkeyhint="next"
                placeholder="Enter your username"
                :aria-invalid="!!error"
                :aria-describedby="error ? 'login-error' : undefined"
                required
                autofocus
              />
            </div>
          </div>

          <div class="field">
            <label for="p">Password</label>
            <div class="input-wrap">
              <svg class="lead" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 11V7a5 5 0 0110 0v4M5 11h14a1 1 0 011 1v8a1 1 0 01-1 1H5a1 1 0 01-1-1v-8a1 1 0 011-1z" /></svg>
              <input
                id="p"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                name="password"
                autocomplete="current-password"
                autocapitalize="none"
                autocorrect="off"
                spellcheck="false"
                enterkeyhint="go"
                placeholder="Enter your password"
                class="has-trail"
                :aria-invalid="!!error"
                :aria-describedby="[error ? 'login-error' : '', capsLock ? 'caps-warn' : ''].filter(Boolean).join(' ') || undefined"
                required
                @keydown="checkCaps"
                @keyup="checkCaps"
                @blur="capsLock = false"
              />
              <button
                type="button"
                class="reveal"
                :aria-label="showPassword ? 'Hide password' : 'Show password'"
                :aria-pressed="showPassword"
                :title="showPassword ? 'Hide password' : 'Show password'"
                @click="showPassword = !showPassword"
              >
                <svg v-if="!showPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10.8 10.8 0 0112 5c6.4 0 10 7 10 7a17.8 17.8 0 01-3.2 4.1M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a10.6 10.6 0 005.4-1.6M9.9 9.9a3 3 0 004.2 4.2" /></svg>
              </button>
            </div>
            <p v-if="capsLock" id="caps-warn" class="caps" role="status">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4l8 8h-4v4H8v-4H4l8-8zM8 20h8" /></svg>
              Caps Lock is on
            </p>
          </div>

          <button class="btn submit" type="submit" :disabled="loading">
            <span v-if="loading" class="spinner" aria-hidden="true" />
            {{ loading ? 'Signing in…' : 'Sign in' }}
          </button>

          <p class="help">
            Forgot your password or locked out? Ask your system administrator to reset it.
          </p>
        </form>
      </main>

      <footer class="panel-foot">
        <div class="copy"><CopyrightLine /></div>
        <div class="dev-credit">Developed by <strong>Harsh Kumar Sharma</strong></div>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.login-page { min-height: 100vh; min-height: 100dvh; display: grid; grid-template-columns: 1.1fr 1fr; background: var(--bg); }

/* ---------- brand panel ---------- */
.hero {
  position: relative; overflow: hidden; background: var(--hero-bg); color: #fff;
  display: flex; flex-direction: column; justify-content: center; padding: 3rem 4rem;
}
.hero-body { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 1.1rem; padding: 2rem 0; }
.hero h1 { font-size: 2.3rem; line-height: 1.15; margin-top: 0.6rem; }
.hero p { margin: 0; max-width: 430px; font-size: 1.05rem; color: #d6dcff; }
.hero ul { list-style: none; padding: 0; margin: 0.4rem 0 0; display: flex; flex-direction: column; gap: 0.55rem; color: #e6eaff; }
.hero li { display: flex; align-items: center; }
.hero li::before {
  content: '✓'; display: inline-grid; place-items: center; flex: none; width: 22px; height: 22px; margin-right: 0.65rem;
  border-radius: 50%; background: rgba(70, 165, 255, 0.28); color: #bfe0ff; font-size: 0.78rem;
}
.orb { position: absolute; border-radius: 50%; pointer-events: none; }
.orb-a { width: 420px; height: 420px; right: -140px; top: -120px; background: radial-gradient(circle, rgba(70, 165, 255, 0.35), transparent 68%); }
.orb-b { width: 360px; height: 360px; left: -120px; bottom: -140px; background: radial-gradient(circle, rgba(150, 160, 255, 0.28), transparent 68%); }

/* ---------- form panel ---------- */
.panel { position: relative; display: flex; flex-direction: column; min-width: 0; padding: 1.1rem 2rem 0; }
.panel-top { display: flex; justify-content: flex-end; }
.panel-main { flex: 1; display: flex; align-items: center; justify-content: center; padding: 2rem 0; }

form.card { width: 100%; max-width: 400px; display: flex; flex-direction: column; gap: 1.05rem; padding: 2.1rem 2rem; margin: 0; }
.form-head h2 { font-size: 1.45rem; }
.form-head .hint { margin: 0.3rem 0 0; font-size: 0.9rem; }

.alert.error { display: flex; align-items: flex-start; gap: 0.55rem; margin: 0; }
.alert.error svg { width: 18px; height: 18px; flex: none; margin-top: 0.1rem; }

.field label { color: var(--text); }
.input-wrap { position: relative; display: flex; align-items: center; }
.input-wrap input { width: 100%; min-height: 46px; padding-left: 2.6rem; }
.input-wrap input.has-trail { padding-right: 3rem; }
.input-wrap input[aria-invalid='true'] { border-color: var(--red); }
.input-wrap input[aria-invalid='true']:focus { box-shadow: 0 0 0 3px var(--red-soft); }
.lead { position: absolute; left: 0.85rem; width: 18px; height: 18px; color: var(--text-muted); pointer-events: none; }
.input-wrap:focus-within .lead { color: var(--primary); }
.reveal {
  position: absolute; right: 0.3rem; width: 40px; height: 40px; display: grid; place-items: center;
  border: 0; border-radius: 8px; background: transparent; color: var(--text-muted); cursor: pointer;
}
.reveal svg { width: 20px; height: 20px; }
.reveal:hover { color: var(--text); background: var(--surface); }
.caps { display: flex; align-items: center; gap: 0.35rem; margin: 0.15rem 0 0; font-size: 0.8rem; font-weight: 600; color: var(--amber-fg); }
.caps svg { width: 15px; height: 15px; }

.submit { min-height: 46px; margin-top: 0.3rem; font-size: 1rem; }
.spinner { width: 16px; height: 16px; border-radius: 50%; border: 2px solid currentColor; border-right-color: transparent; animation: spin 0.7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 2s; } }

.help { margin: 0; padding-top: 0.95rem; border-top: 1px solid var(--border); font-size: 0.82rem; color: var(--text-muted); text-align: center; }

/* ---------- footer ---------- */
.panel-foot {
  display: flex; flex-direction: column; align-items: center; gap: 0.25rem; text-align: center;
  padding: 1rem 0 calc(1.1rem + env(safe-area-inset-bottom)); border-top: 1px solid var(--border);
  font-size: 0.78rem; color: var(--text-muted);
}
.dev-credit { font-size: 0.74rem; opacity: 0.9; }
.dev-credit strong { color: var(--text); font-weight: 600; }

/* ---------- tablets & phones ---------- */
@media (max-width: 900px) {
  .hero { padding: 2.5rem 2.5rem; }
  .hero h1 { font-size: 1.9rem; }
}
@media (max-width: 800px) {
  .login-page { grid-template-columns: minmax(0, 1fr); }
  .hero { padding: 1.4rem 1.25rem 1.6rem; }
  .hero-body { padding: 0; gap: 0.6rem; }
  .hero-body .brand-logo { height: 56px !important; } /* beats the size set on the logo itself */
  .hero h1 { font-size: 1.45rem; margin-top: 0.2rem; }
  .hero ul, .hero p { display: none; }
  .panel { padding: 0.8rem 1rem 0; }
  .panel-main { align-items: flex-start; padding: 1.25rem 0 1.75rem; }
  form.card { padding: 1.5rem 1.25rem; max-width: 440px; margin: 0 auto; }
}
</style>
