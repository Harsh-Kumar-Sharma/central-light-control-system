<script setup>
// One row of tabs to switch between the GPS map and every uploaded plan (drawing).
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { plansApi } from '../../api/resources.js';
import { useAuthStore } from '../../stores/auth.js';

const route = useRoute();
const auth = useAuthStore();
const plans = ref([]);

const showGps = computed(() => auth.can('control'));
const showPlans = computed(() => auth.can('plans'));

async function load() {
  if (!showPlans.value) return;
  try { plans.value = (await plansApi.list()).plans; } catch { /* the tabs just show the GPS map */ }
}
onMounted(load);
watch(() => route.fullPath, load); // a plan uploaded or deleted meanwhile shows up when you move around

const currentPlan = computed(() => (route.name === 'plan' ? Number(route.params.id) : null));
</script>

<template>
  <nav v-if="(showGps && showPlans) || plans.length" class="map-tabs" aria-label="Where to see the lights">
    <router-link v-if="showGps" to="/map" class="tab" :class="{ on: route.name === 'map' }" data-tab="gps">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11zM12 12a2 2 0 100-4 2 2 0 000 4z" /></svg>
      GPS map
    </router-link>
    <router-link v-for="p in plans" :key="p.id" :to="`/plans/${p.id}`" class="tab" :class="{ on: currentPlan === p.id }" :data-tab="`plan-${p.id}`" :title="p.source_name">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3V7zM9 4v13M15 7v13" /></svg>
      {{ p.name }}
    </router-link>
    <router-link v-if="showPlans" to="/plans" class="tab more" :class="{ on: route.name === 'plans' }" title="Upload or manage drawings">+ Drawings</router-link>
  </nav>
</template>

<style scoped>
.map-tabs { display: flex; gap: 0.25rem; padding: 0.25rem; margin-bottom: 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow-x: auto; max-width: 100%; width: fit-content; }
.tab { display: inline-flex; align-items: center; gap: 0.45rem; padding: 0.45rem 0.95rem; border-radius: 9px; color: var(--text-muted); font-weight: 700; white-space: nowrap; text-decoration: none; }
.tab:hover { color: var(--text); text-decoration: none; background: var(--surface-2); }
.tab.on { background: var(--primary); color: var(--on-primary); }
.tab svg { width: 16px; height: 16px; flex: none; }
.tab.more { font-weight: 600; font-size: 0.85rem; }
.tab.more.on { background: var(--primary-soft); color: var(--primary); }
</style>
