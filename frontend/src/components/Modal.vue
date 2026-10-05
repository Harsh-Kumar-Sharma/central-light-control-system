<script setup>
import { onBeforeUnmount, onMounted } from 'vue';

defineProps({
  title: { type: String, required: true },
  width: { type: String, default: '560px' },
});
const emit = defineEmits(['close']);

function onKey(e) {
  if (e.key === 'Escape') emit('close');
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="overlay" @mousedown.self="emit('close')">
    <div class="modal" role="dialog" aria-modal="true" :aria-label="title" :style="{ maxWidth: width }">
      <header>
        <h2>{{ title }}</h2>
        <button class="x" aria-label="Close" @click="emit('close')">✕</button>
      </header>
      <div class="body"><slot /></div>
      <footer v-if="$slots.footer"><slot name="footer" /></footer>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; z-index: 50; background: rgba(15, 20, 38, 0.55); backdrop-filter: blur(2px);
  display: grid; place-items: center; padding: 1rem; overflow-y: auto;
}
.modal {
  width: 100%; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35); display: flex; flex-direction: column; max-height: calc(100vh - 2rem);
}
header { display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.25rem; border-bottom: 1px solid var(--border); }
.x { border: 0; background: transparent; color: var(--text-muted); font-size: 1.1rem; cursor: pointer; border-radius: 8px; width: 32px; height: 32px; }
.x:hover { background: var(--surface-2); color: var(--text); }
.body { padding: 1.1rem 1.25rem; overflow-y: auto; }
footer { padding: 0.9rem 1.25rem; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 0.6rem; }
</style>
