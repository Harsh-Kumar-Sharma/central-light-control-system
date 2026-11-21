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
/* minmax(0, 1fr): the dialog is never wider than the screen, whatever its content (long labels, wide tables). */
.overlay {
  position: fixed; inset: 0; z-index: 50; background: rgba(15, 20, 38, 0.55); backdrop-filter: blur(2px);
  display: grid; grid-template-columns: minmax(0, 1fr); place-items: center; padding: 1rem; overflow-y: auto;
  overscroll-behavior: contain;
}
.modal {
  width: 100%; min-width: 0; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35); display: flex; flex-direction: column;
  max-height: calc(100vh - 2rem); max-height: calc(100dvh - 2rem);
}
header { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 1rem 1.25rem; border-bottom: 1px solid var(--border); }
header h2 { min-width: 0; overflow-wrap: anywhere; }
.x { flex: none; border: 0; background: transparent; color: var(--text-muted); font-size: 1.1rem; cursor: pointer; border-radius: 8px; width: 36px; height: 36px; }
.x:hover { background: var(--surface-2); color: var(--text); }
.body { padding: 1.1rem 1.25rem; overflow-y: auto; overflow-x: hidden; min-height: 0; }
footer { flex: none; padding: 0.9rem 1.25rem; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 0.6rem; flex-wrap: wrap; }

/* Phones: a bottom sheet that uses the full width; the action buttons stay in reach of the thumb. */
@media (max-width: 600px) {
  .overlay { padding: 0.75rem 0 0; place-items: end stretch; }
  .modal {
    max-width: none !important; border-radius: 18px 18px 0 0; border-bottom: 0;
    max-height: calc(100vh - 0.75rem); max-height: calc(100dvh - 0.75rem);
  }
  header { padding: 0.85rem 1rem; }
  .body { padding: 1rem; }
  footer { padding: 0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom)); }
  footer :slotted(.btn) { flex: 1 1 auto; min-height: 42px; }
}
</style>
