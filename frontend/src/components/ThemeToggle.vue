<script setup>
import { ref } from 'vue';
import { getPreference, setPreference } from '../utils/theme.js';

const pref = ref(getPreference());
const options = [
  { id: 'light', label: 'Light theme', icon: 'M12 4V2m0 20v-2M4.9 4.9L3.5 3.5m17 17l-1.4-1.4M4 12H2m20 0h-2M4.9 19.1l-1.4 1.4m17-17l-1.4 1.4M12 17a5 5 0 100-10 5 5 0 000 10z' },
  { id: 'system', label: 'Match system', icon: 'M3 5h18v11H3zM8 20h8M12 16v4' },
  { id: 'dark', label: 'Dark theme', icon: 'M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z' },
];

function choose(id) {
  pref.value = id;
  setPreference(id);
}
</script>

<template>
  <div class="toggle" role="group" aria-label="Colour theme">
    <button
      v-for="o in options"
      :key="o.id"
      type="button"
      :class="{ on: pref === o.id }"
      :aria-pressed="pref === o.id"
      :aria-label="o.label"
      :title="o.label"
      :data-theme-choice="o.id"
      @click="choose(o.id)"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path :d="o.icon" /></svg>
    </button>
  </div>
</template>

<style scoped>
.toggle { display: inline-flex; padding: 3px; gap: 2px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 11px; }
.toggle button {
  width: 32px; height: 30px; display: grid; place-items: center; border: 0; border-radius: 8px;
  background: transparent; color: var(--text-muted); cursor: pointer; transition: background 0.15s, color 0.15s;
}
.toggle button svg { width: 17px; height: 17px; }
.toggle button:hover { color: var(--text); }
@media (max-width: 860px) {
  .toggle button { width: 28px; height: 28px; }
  .toggle button svg { width: 15px; height: 15px; }
}
.toggle button.on { background: var(--primary); color: var(--on-primary); box-shadow: 0 2px 8px var(--primary-glow); }
</style>
