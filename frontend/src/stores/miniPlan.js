import { defineStore } from 'pinia';

// The floating mini map: which plan is pinned, how big it is, whether it is folded away.
// Remembered per browser so it is still there after a reload.
const KEY = 'miniPlan';
const load = () => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? {}; } catch { return {}; }
};

export const useMiniPlan = defineStore('miniPlan', {
  state: () => {
    const s = load();
    return {
      planId: Number.isInteger(s.planId) ? s.planId : null,
      size: ['s', 'm', 'l'].includes(s.size) ? s.size : 'm',
      folded: Boolean(s.folded),
    };
  },
  actions: {
    save() {
      try { localStorage.setItem(KEY, JSON.stringify({ planId: this.planId, size: this.size, folded: this.folded })); } catch { /* storage blocked: not remembered */ }
    },
    pin(id) { this.planId = Number(id); this.folded = false; this.save(); },
    close() { this.planId = null; this.save(); },
    setSize(size) { this.size = size; this.folded = false; this.save(); },
    toggleFold() { this.folded = !this.folded; this.save(); },
  },
});
