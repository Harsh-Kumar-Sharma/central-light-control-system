<script setup>
import { computed } from 'vue';

const props = defineProps({
  layout: { type: Object, required: true },
  receivers: { type: Array, required: true },       // all receivers
  tool: { type: String, required: true },
  selection: { type: Object, default: null },
  snap: { type: Boolean, default: true },
  armedReceiverId: { type: Number, default: null },
  canUndo: { type: Boolean, default: false },
  canRedo: { type: Boolean, default: false },
  draftLength: { type: Number, default: 0 },
  roadName: { type: String, default: '' },
});
const emit = defineEmits([
  'update:tool', 'update:snap', 'update:roadName', 'undo', 'redo', 'delete-selected', 'arm-receiver',
  'open-template', 'update-item', 'update-canvas', 'finish-draft', 'cancel-draft', 'delete-road',
]);

const tools = [
  { id: 'select', label: 'Select / move', icon: 'M5 3l14 8-6 2-2 6z' },
  { id: 'road', label: 'Draw road', icon: 'M3 20L21 4M3 20h4M17 4h4' },
  { id: 'light', label: 'Add light', icon: 'M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.5.4.8 1 .8 1.6V16h5.4v-.5c0-.6.3-1.2.8-1.6A6 6 0 0012 3z' },
  { id: 'label', label: 'Add label', icon: 'M4 7V4h16v3M9 20h6M12 4v16' },
];

const placedIds = computed(() => new Set(props.layout.lights.map((l) => l.receiverId)));
const unplaced = computed(() => props.receivers.filter((r) => !placedIds.value.has(r.id)));
const byId = computed(() => Object.fromEntries(props.receivers.map((r) => [r.id, r])));

const segment = computed(() => (props.selection?.type === 'segment' ? props.layout.segments.find((s) => s.id === props.selection.id) : null));
const light = computed(() => (props.selection?.type === 'light' ? props.layout.lights.find((l) => l.id === props.selection.id) : null));
const label = computed(() => (props.selection?.type === 'label' ? props.layout.labels.find((l) => l.id === props.selection.id) : null));
// A light can be re-linked to any receiver that is not already on this road (plus its own).
const relinkChoices = computed(() => props.receivers.filter((r) => !placedIds.value.has(r.id) || r.id === light.value?.receiverId));

const num = (e, fallback) => (Number.isFinite(Number(e.target.value)) && e.target.value !== '' ? Number(e.target.value) : fallback);
</script>

<template>
  <aside class="side">
    <section>
      <label class="lbl">Road name</label>
      <input :value="roadName" maxlength="100" @input="emit('update:roadName', $event.target.value)" />
    </section>

    <section>
      <div class="tools">
        <button
          v-for="t in tools"
          :key="t.id"
          type="button"
          class="tool"
          :class="{ on: tool === t.id }"
          :data-tool="t.id"
          :title="t.label"
          @click="emit('update:tool', t.id)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path :d="t.icon" /></svg>
          <span>{{ t.label }}</span>
        </button>
      </div>
      <div class="row">
        <button class="btn secondary sm" :disabled="!canUndo" title="Undo (Ctrl+Z)" @click="emit('undo')">↶ Undo</button>
        <button class="btn secondary sm" :disabled="!canRedo" title="Redo (Ctrl+Y)" @click="emit('redo')">↷ Redo</button>
        <label class="check"><input type="checkbox" :checked="snap" @change="emit('update:snap', $event.target.checked)" /> Snap to grid</label>
      </div>
      <button class="btn secondary sm wide" @click="emit('open-template')">Start from a template…</button>
    </section>

    <section v-if="tool === 'road'" class="hint-box">
      <strong>Drawing a road</strong>
      <p>Click on the map to add points. Double-click or press <kbd>Enter</kbd> to finish; <kbd>Esc</kbd> cancels.</p>
      <div class="row">
        <button class="btn sm" :disabled="draftLength < 2" @click="emit('finish-draft')">Finish ({{ draftLength }} points)</button>
        <button class="btn secondary sm" :disabled="!draftLength" @click="emit('cancel-draft')">Cancel</button>
      </div>
    </section>

    <section v-if="tool === 'light'">
      <label class="lbl">Receivers not on this road ({{ unplaced.length }})</label>
      <p v-if="armedReceiverId" class="armed">
        Placing <strong>{{ byId[armedReceiverId]?.device_name }}</strong> — now click on the map.
      </p>
      <p v-else class="hint">Pick a receiver, then click on the map to place its light.</p>
      <div class="list">
        <button
          v-for="r in unplaced"
          :key="r.id"
          type="button"
          class="rx"
          :class="{ on: armedReceiverId === r.id }"
          :data-receiver="r.id"
          @click="emit('arm-receiver', r.id)"
        >
          <strong>{{ r.device_name }}</strong>
          <span>addr {{ r.lora_address }} · {{ r.transmitter_name }}</span>
        </button>
        <p v-if="!unplaced.length" class="hint">Every receiver is already on this road.</p>
      </div>
    </section>

    <section v-if="segment" class="props" data-props="segment">
      <h4>Road piece</h4>
      <label class="lbl">Lanes</label>
      <select :value="segment.lanes" @change="emit('update-item', { lanes: Number($event.target.value) })">
        <option v-for="n in 6" :key="n" :value="n">{{ n }} lane{{ n > 1 ? 's' : '' }}</option>
      </select>
      <label class="check"><input type="checkbox" :checked="segment.curved" @change="emit('update-item', { curved: $event.target.checked })" /> Smooth curve</label>
      <p class="hint">{{ segment.points.length }} points. Drag the round handles to reshape, double-click the road to add a point, right-click a handle to remove it.</p>
      <button class="btn danger sm" @click="emit('delete-selected')">Delete this road piece</button>
    </section>

    <section v-if="light" class="props" data-props="light">
      <h4>Light</h4>
      <label class="lbl">Linked receiver</label>
      <select :value="light.receiverId" @change="emit('update-item', { receiverId: Number($event.target.value) })">
        <option v-for="r in relinkChoices" :key="r.id" :value="r.id">{{ r.device_name }} (addr {{ r.lora_address }})</option>
        <option v-if="!byId[light.receiverId]" :value="light.receiverId">Deleted receiver #{{ light.receiverId }}</option>
      </select>
      <label class="lbl">Name on the map (optional)</label>
      <input :value="light.label ?? ''" maxlength="40" placeholder="uses the receiver name" @input="emit('update-item', { label: $event.target.value })" />
      <button class="btn danger sm" @click="emit('delete-selected')">Remove from road</button>
    </section>

    <section v-if="label" class="props" data-props="label">
      <h4>Label</h4>
      <label class="lbl">Text</label>
      <input :value="label.text" maxlength="80" @input="emit('update-item', { text: $event.target.value })" />
      <label class="lbl">Size ({{ label.size }})</label>
      <input type="range" min="10" max="48" :value="label.size" @input="emit('update-item', { size: Number($event.target.value) })" />
      <button class="btn danger sm" @click="emit('delete-selected')">Delete label</button>
    </section>

    <section v-if="!selection && tool === 'select'" class="hint-box">
      <p>Click a road, light or label to edit it. Drag lights, labels and road handles to move them. Drag empty space to pan, scroll to zoom.</p>
    </section>

    <section>
      <label class="lbl">Map size (px)</label>
      <div class="row">
        <input type="number" min="400" max="6000" :value="layout.canvas.width" @change="emit('update-canvas', { width: Math.min(6000, Math.max(400, num($event, layout.canvas.width))) })" />
        <span>×</span>
        <input type="number" min="300" max="6000" :value="layout.canvas.height" @change="emit('update-canvas', { height: Math.min(6000, Math.max(300, num($event, layout.canvas.height))) })" />
      </div>
    </section>

    <section class="danger-zone">
      <button class="btn danger sm wide" @click="emit('delete-road')">Delete this whole road…</button>
    </section>
  </aside>
</template>

<style scoped>
.side { display: flex; flex-direction: column; gap: 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem; max-height: calc(66vh + 4rem); overflow-y: auto; }
section { display: flex; flex-direction: column; gap: 0.5rem; }
.lbl { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); font-weight: 700; }
h4 { font-size: 0.95rem; }
.row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
.row input { flex: 1; min-width: 0; }
.wide { width: 100%; }
.tools { display: grid; grid-template-columns: 1fr 1fr; gap: 0.45rem; }
.tool {
  display: flex; align-items: center; gap: 0.45rem; padding: 0.5rem 0.6rem; border-radius: var(--radius-sm);
  border: 1px solid var(--border); background: var(--surface-2); color: var(--text-muted); font: inherit; font-size: 0.82rem; font-weight: 600; cursor: pointer; text-align: left;
}
.tool svg { width: 18px; height: 18px; flex: none; }
.tool:hover { color: var(--text); }
.tool.on { background: var(--primary-soft); border-color: var(--primary); color: var(--primary); }
.check { display: flex; align-items: center; gap: 0.4rem; color: var(--text); font-size: 0.85rem; font-weight: 500; }
.check input { width: 16px; height: 16px; accent-color: var(--primary); }
.hint { color: var(--text-muted); font-size: 0.8rem; margin: 0; }
.hint-box { background: var(--surface-2); border: 1px dashed var(--border); border-radius: var(--radius-sm); padding: 0.7rem; font-size: 0.82rem; }
.hint-box p { margin: 0.3rem 0 0.5rem; color: var(--text-muted); }
kbd { background: var(--surface); border: 1px solid var(--border); border-radius: 4px; padding: 0 0.3rem; font-size: 0.75rem; }
.armed { background: var(--primary-soft); color: var(--primary); padding: 0.5rem 0.7rem; border-radius: var(--radius-sm); margin: 0; font-size: 0.85rem; }
.list { display: flex; flex-direction: column; gap: 0.35rem; max-height: 220px; overflow-y: auto; }
.rx { display: flex; flex-direction: column; text-align: left; padding: 0.45rem 0.65rem; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface-2); color: var(--text); font: inherit; cursor: pointer; }
.rx span { font-size: 0.75rem; color: var(--text-muted); }
.rx:hover { border-color: var(--primary); }
.rx.on { background: var(--primary-soft); border-color: var(--primary); }
.props { border-top: 1px solid var(--border); padding-top: 0.9rem; }
.danger-zone { border-top: 1px solid var(--border); padding-top: 0.9rem; }
</style>
