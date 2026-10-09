<script setup>
// A small floating map that follows you to every page. Pin a plan and keep an eye on the lights
// while you work elsewhere; click a light to control it, or open it full size.
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { plansApi } from '../../api/resources.js';
import { useAuthStore } from '../../stores/auth.js';
import { useMiniPlan } from '../../stores/miniPlan.js';
import { loadGeometry } from '../../utils/planCache.js';
import PlanViewer from './PlanViewer.vue';
import LightControlModal from '../LightControlModal.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const mini = useMiniPlan();
const canControl = computed(() => auth.can('control', 'control'));

const plan = ref(null);
const geometry = shallowRef(null);
const lights = ref([]);
const error = ref('');
const openId = ref(null);
const box = ref(null);
const fs = ref(false);

// Not shown on the page that already shows the same plan in full.
const onSamePage = computed(() => route.name === 'plan' && Number(route.params.id) === mini.planId);
const visible = computed(() => mini.planId != null && !onSamePage.value);
const hidden = computed(() => new Set((plan.value?.layers ?? []).filter((l) => l.hidden).map((l) => l.name)));
const openLight = computed(() => (openId.value != null ? lights.value.find((l) => l.receiverId === openId.value) ?? null : null));

let timer = null;
async function loadLights() {
  if (mini.planId == null) return;
  try { lights.value = (await plansApi.lights(mini.planId)).lights; } catch { /* keep the last picture */ }
}
async function open() {
  plan.value = null; geometry.value = null; lights.value = []; error.value = '';
  if (mini.planId == null) return;
  const id = mini.planId;
  try {
    const [p, g] = await Promise.all([plansApi.get(id), loadGeometry(id)]);
    if (id !== mini.planId) return;
    plan.value = p; geometry.value = g;
    await loadLights();
  } catch (err) {
    if (err.response?.status === 404) { mini.close(); return; } // the plan was deleted
    error.value = err.response?.data?.error?.message ?? 'Could not load the plan';
  }
}
watch(() => [mini.planId, auth.user?.id], open, { immediate: true });
watch(visible, (v) => {
  clearInterval(timer);
  if (v) timer = setInterval(() => { if (!document.hidden && geometry.value && !mini.folded) loadLights(); }, 5000);
}, { immediate: true });
onBeforeUnmount(() => clearInterval(timer));

const SIZES = { s: [320, 210], m: [480, 320], l: [720, 480] };
const dims = computed(() => SIZES[mini.size]);
const goFull = () => router.push(`/plans/${mini.planId}`);
const onFs = (v) => { fs.value = v; };
</script>

<template>
  <section v-if="visible" ref="box" class="mini" :class="{ folded: mini.folded && !fs, fs }" :style="!fs && !mini.folded ? { width: dims[0] + 'px', height: dims[1] + 34 + 'px' } : null" aria-label="Pinned plan">
    <header>
      <b class="ttl" :title="plan?.name">{{ plan?.name ?? 'Plan' }}</b>
      <div class="btns">
        <template v-if="!mini.folded || fs">
          <button v-for="s in ['s', 'm', 'l']" :key="s" type="button" class="sz" :class="{ on: mini.size === s }" :aria-label="'Size ' + s.toUpperCase()" :title="{ s: 'Small', m: 'Medium', l: 'Large' }[s]" @click="mini.setSize(s)">{{ s.toUpperCase() }}</button>
        </template>
        <button type="button" :aria-label="mini.folded ? 'Unfold mini map' : 'Fold mini map away'" :title="mini.folded ? 'Unfold' : 'Fold away'" @click="mini.toggleFold()">{{ mini.folded ? '▴' : '▾' }}</button>
        <button type="button" aria-label="Open the plan full size" title="Open full page" data-action="mini-open" @click="goFull">↗</button>
        <button type="button" aria-label="Close the mini map" title="Close" data-action="mini-close" @click="mini.close()">✕</button>
      </div>
    </header>
    <div v-show="!mini.folded || fs" class="body">
      <PlanViewer
        v-if="geometry"
        :geometry="geometry"
        :hidden-layers="hidden"
        :lights="lights"
        :show-labels="fs"
        :show-text="fs || mini.size !== 's'"
        compact
        :fullscreen-el="box"
        :view-key="'plan-' + mini.planId"
        :selected-id="openId"
        @light-click="openId = $event"
        @fullscreen-change="onFs"
      />
      <p v-else-if="error" class="msg">{{ error }}</p>
      <p v-else class="msg">Loading…</p>
    </div>
    <LightControlModal v-if="openLight" :light="openLight" :can-control="canControl" @close="openId = null" @changed="loadLights" />
  </section>
</template>

<style scoped>
.mini { position: fixed; right: 16px; bottom: 16px; z-index: 40; display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--border); border-radius: 14px; box-shadow: 0 10px 34px rgba(0, 0, 0, 0.35); overflow: hidden; max-width: calc(100vw - 32px); max-height: calc(100vh - 90px); }
.mini.folded { width: auto !important; height: auto !important; }
.mini.fs { position: fixed; inset: 0; z-index: 45; width: auto; height: auto; max-width: none; max-height: none; border-radius: 0; border: 0; }
header { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; height: 34px; padding: 0 0.4rem 0 0.7rem; background: var(--surface-2); border-bottom: 1px solid var(--border); flex: none; }
.mini.folded header { border-bottom: 0; }
.ttl { font-size: 0.82rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 190px; }
.btns { display: flex; gap: 0.2rem; align-items: center; }
.btns button { min-width: 24px; height: 24px; padding: 0 0.3rem; border-radius: 6px; border: 1px solid transparent; background: transparent; color: var(--text-muted); font: inherit; font-size: 0.8rem; font-weight: 700; cursor: pointer; }
.btns button:hover { background: var(--primary-soft); color: var(--primary); }
.btns .sz.on { background: var(--primary); color: var(--on-primary); }
.body { flex: 1; min-height: 0; position: relative; }
.msg { margin: 0; padding: 1rem; color: var(--text-muted); font-size: 0.85rem; text-align: center; }
@media (max-width: 700px) { .mini:not(.fs) { display: none; } }
</style>
