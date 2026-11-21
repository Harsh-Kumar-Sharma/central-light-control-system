<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useAuthStore } from '../stores/auth.js';
import { UI, INTRO, MODULES, OUTRO } from '../guide/content.js';

const auth = useAuthStore();

/* ---------- language (remembered in this browser) ---------- */
const lang = ref('en');
try { const s = localStorage.getItem('guideLang'); if (s === 'hi' || s === 'en') lang.value = s; } catch { /* private mode */ }
watch(lang, (v) => { try { localStorage.setItem('guideLang', v); } catch { /* ignore */ } });
const L = (x) => (x == null ? '' : typeof x === 'string' ? x : x[lang.value] ?? x.en);

/* ---------- search ---------- */
const q = ref('');
const flat = (v) => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(flat).join(' ');
  if (typeof v === 'object') return Object.values(v).map(flat).join(' ');
  return String(v);
};
const matches = (sec) => !q.value.trim() || flat(sec).toLowerCase().includes(q.value.trim().toLowerCase());
const intro = computed(() => INTRO.filter(matches));
const modules = computed(() => MODULES.filter(matches));
const outro = computed(() => OUTRO.filter(matches));
const anyResult = computed(() => intro.value.length + modules.value.length + outro.value.length > 0);

/* ---------- icons (same drawings as the menu) ---------- */
const ICON = {
  dashboard: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  devices: 'M4 6h16M4 12h16M4 18h16',
  control: 'M12 2v10m6.4-6.4a9 9 0 11-12.8 0',
  groups: 'M17 20h5v-2a4 4 0 00-5-3.9M9 11a4 4 0 100-8 4 4 0 000 8zm8 0a3 3 0 100-6M2 20v-2a4 4 0 014-4h6a4 4 0 014 4v2',
  plans: 'M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3V7zM9 4v13M15 7v13',
  sensors: 'M14 14.76V3.5a2.5 2.5 0 00-5 0v11.26a4.5 4.5 0 105 0z',
  tunnels: 'M3 20V12a9 9 0 0118 0v8M7 20v-8a5 5 0 0110 0v8',
  map: 'M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11zM12 12a2 2 0 100-4 2 2 0 000 4z',
  reports: 'M4 20V10m6 10V4m6 16v-7m6 7H2',
  alarms: 'M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0zM12 9v4m0 4h.01',
  schedules: 'M12 7v5l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z',
  status: 'M3 12h4l3-8 4 16 3-8h4',
  config: 'M12 15a3 3 0 100-6 3 3 0 000 6zm7.4-3a7.4 7.4 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 00-2-1.2L14.5 3h-4l-.4 2.6a7.5 7.5 0 00-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 000 2.4l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 002 1.2l.4 2.6h4l.4-2.6a7.5 7.5 0 002-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
  users: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm13 10v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8',
  logs: 'M9 12h6M9 16h6M9 8h2M7 3h7l5 5v13H7z',
  test: 'M5 12.5a10 10 0 0114 0M8.5 16a5 5 0 017 0M12 20h.01M2 9a15 15 0 0120 0',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z',
  bolt: 'M13 2L3 14h8l-1 8 10-12h-8l1-8z',
  trash: 'M3 6h18M8 6V4h8v2m-9 0l1 14h8l1-14M10 11v6M14 11v6',
};

/* ---------- navigation ---------- */
const active = ref('');
function go(id) {
  const el = document.getElementById('g-' + id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  active.value = id;
}
const toc = computed(() => [
  ...intro.value.map((s) => ({ id: s.id, icon: s.icon, label: L(s.title) })),
  ...modules.value.map((m) => ({ id: m.id, icon: m.icon, label: L(m.title) })),
  ...outro.value.map((s) => ({ id: s.id, icon: s.icon, label: L(s.title) })),
]);
let io = null;
onMounted(() => {
  io = new IntersectionObserver((entries) => {
    const v = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    if (v) active.value = v.target.id.replace(/^g-/, '');
  }, { rootMargin: '-90px 0px -65% 0px' });
  watch([q, lang], () => requestAnimationFrame(() => {
    io.disconnect();
    document.querySelectorAll('.g-sec').forEach((el) => io.observe(el));
  }), { immediate: true });
});

const canOpen = (m) => auth.can(m.perm.split(/[ ·.]/)[0], 'view') || m.id === 'map' && auth.can('control');
const hideImg = (e) => { e.target.closest('figure').style.display = 'none'; };
const print = () => window.print();
</script>

<template>
  <div class="guide">
    <header class="g-head card">
      <div class="g-head-text">
        <h2>{{ L(UI.title) }}</h2>
        <p>{{ L(UI.subtitle) }}</p>
      </div>
      <div class="g-tools">
        <div class="lang" role="group" :aria-label="L(UI.langLabel)">
          <button type="button" :class="{ on: lang === 'en' }" @click="lang = 'en'">English</button>
          <button type="button" :class="{ on: lang === 'hi' }" lang="hi" @click="lang = 'hi'">हिन्दी</button>
        </div>
        <button class="btn secondary sm" type="button" @click="print">{{ L(UI.print) }}</button>
      </div>
    </header>

    <div class="g-body">
      <aside class="g-toc card">
        <input v-model="q" class="g-search" type="search" :placeholder="L(UI.search)" :aria-label="L(UI.search)" />
        <div class="toc-title">{{ L(UI.contents) }}</div>
        <nav>
          <a v-for="s in toc" :key="s.id" :href="'#g-' + s.id" class="toc-link" :class="{ on: active === s.id }" @click.prevent="go(s.id)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path :d="ICON[s.icon]" /></svg>
            <span>{{ s.label }}</span>
          </a>
        </nav>
      </aside>

      <main class="g-main" :lang="lang === 'hi' ? 'hi' : 'en'">
        <div v-if="!anyResult" class="card empty">{{ L(UI.noResult) }}</div>

        <!-- ===== general chapters ===== -->
        <section v-for="s in intro" :id="'g-' + s.id" :key="s.id" class="g-sec card">
          <h3 class="sec-title"><span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path :d="ICON[s.icon]" /></svg></span>{{ L(s.title) }}</h3>
          <p v-for="(b, i) in s.body" :key="i" class="lead">{{ L(b) }}</p>
          <div v-if="s.cards" class="cards">
            <div v-for="(c, i) in s.cards" :key="i" class="mini"><h5>{{ L(c.h) }}</h5><p>{{ L(c.p) }}</p></div>
          </div>
          <ol v-if="s.steps" class="steps">
            <li v-for="(st, i) in s.steps" :key="i">{{ L(st) }}</li>
          </ol>
          <div v-if="s.tips" class="tips">
            <ul><li v-for="(tp, i) in s.tips" :key="i">{{ L(tp) }}</li></ul>
          </div>
        </section>

        <!-- ===== modules ===== -->
        <h3 class="part">{{ lang === 'hi' ? 'मॉड्यूल-वार गाइड' : 'Module-by-module guide' }}</h3>
        <section v-for="m in modules" :id="'g-' + m.id" :key="m.id" class="g-sec card module">
          <div class="mod-head">
            <h3 class="sec-title">
              <span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path :d="ICON[m.icon]" /></svg></span>
              {{ L(m.title) }}
            </h3>
            <router-link v-if="canOpen(m)" :to="m.route" class="btn secondary sm">{{ L(UI.openPage) }} →</router-link>
          </div>
          <p class="tagline">{{ L(m.tagline) }}</p>

          <div class="meta"><b>{{ L(UI.whoCan) }}:</b> <code>{{ m.perm }}</code></div>

          <h4>{{ L(UI.what) }}</h4>
          <p class="lead">{{ L(m.what) }}</p>

          <figure v-if="m.shot" class="shot">
            <img :src="'/guide/' + m.shot" :alt="L(m.title)" loading="lazy" @error="hideImg" />
            <figcaption>{{ L(UI.shotNote) }} — {{ L(m.title) }}</figcaption>
          </figure>

          <template v-if="m.tasks">
            <h4>{{ L(UI.howTo) }}</h4>
            <div v-for="(tk, i) in m.tasks" :key="i" class="task">
              <h5>{{ L(tk.title) }}</h5>
              <ol class="steps"><li v-for="(st, j) in tk.steps" :key="j">{{ L(st) }}</li></ol>
            </div>
          </template>

          <figure v-for="x in m.extraShots ?? []" :key="x.file" class="shot">
            <img :src="'/guide/' + x.file" :alt="L(x.cap)" loading="lazy" @error="hideImg" />
            <figcaption>{{ L(x.cap) }}</figcaption>
          </figure>

          <template v-if="m.buttons">
            <h4>{{ L(UI.buttons) }}</h4>
            <div class="table-wrap">
              <table class="gt">
                <tbody>
                  <tr v-for="(b, i) in m.buttons" :key="i">
                    <td class="bcell">
                      <span v-if="b.ic" class="ibtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path :d="ICON[b.ic]" /></svg></span>
                      <span class="chip">{{ b.ic ? b.label : L(b.btn) }}</span>
                    </td>
                    <td>{{ L(b.does) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>

          <template v-if="m.fields">
            <h4>{{ m.fieldsTitle ? L(m.fieldsTitle) : L(UI.config) }}</h4>
            <div class="table-wrap">
              <table class="gt">
                <thead><tr><th>{{ L(UI.field) }}</th><th>{{ L(UI.meaning) }}</th></tr></thead>
                <tbody><tr v-for="(f, i) in m.fields" :key="i"><td class="fname">{{ L(f.name) }}</td><td>{{ L(f.meaning) }}</td></tr></tbody>
              </table>
            </div>
          </template>
          <template v-if="m.fields2">
            <h4>{{ L(m.fields2Title) }}</h4>
            <div class="table-wrap">
              <table class="gt">
                <thead><tr><th>{{ L(UI.field) }}</th><th>{{ L(UI.meaning) }}</th></tr></thead>
                <tbody><tr v-for="(f, i) in m.fields2" :key="i"><td class="fname">{{ L(f.name) }}</td><td>{{ L(f.meaning) }}</td></tr></tbody>
              </table>
            </div>
          </template>

          <div v-if="m.tips" class="tips">
            <h4>💡 {{ L(UI.tips) }}</h4>
            <ul><li v-for="(tp, i) in m.tips" :key="i">{{ L(tp) }}</li></ul>
          </div>
        </section>

        <!-- ===== closing chapters ===== -->
        <section v-for="s in outro" :id="'g-' + s.id" :key="s.id" class="g-sec card">
          <h3 class="sec-title"><span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path :d="ICON[s.icon]" /></svg></span>{{ L(s.title) }}</h3>
          <div class="table-wrap">
            <table class="gt">
              <tbody><tr v-for="(r, i) in s.table" :key="i"><td class="fname">{{ L(r[0]) }}</td><td>{{ L(r[1]) }}</td></tr></tbody>
            </table>
          </div>
        </section>

        <a href="#" class="top" @click.prevent="go('overview')">↑ {{ L(UI.back) }}</a>
      </main>
    </div>
  </div>
</template>

<style scoped>
.g-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.1rem; background: var(--hero-bg); color: #fff; border: 0; }
.g-head h2 { color: #fff; font-size: 1.6rem; }
.g-head p { margin: 0.3rem 0 0; max-width: 60ch; color: rgba(255, 255, 255, 0.86); }
.g-tools { display: flex; align-items: center; gap: 0.7rem; flex-wrap: wrap; }
.g-head .btn.secondary { background: rgba(255, 255, 255, 0.16); color: #fff; }
.lang { display: inline-flex; background: rgba(255, 255, 255, 0.16); border-radius: 999px; padding: 3px; }
.lang button { border: 0; background: transparent; color: #fff; font: inherit; font-weight: 700; padding: 0.38rem 0.95rem; border-radius: 999px; cursor: pointer; }
.lang button.on { background: #fff; color: #192496; }

.g-body { display: grid; grid-template-columns: 270px minmax(0, 1fr); gap: 1.2rem; align-items: start; }
.g-toc { position: sticky; top: 76px; max-height: calc(100vh - 96px); overflow-y: auto; padding: 0.9rem; }
.g-search { width: 100%; margin-bottom: 0.8rem; }
.toc-title { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); font-weight: 700; margin-bottom: 0.4rem; }
.toc-link { display: flex; align-items: center; gap: 0.6rem; padding: 0.45rem 0.6rem; border-radius: 9px; color: var(--text); font-size: 0.9rem; font-weight: 600; }
.toc-link svg { width: 17px; height: 17px; flex: none; color: var(--text-muted); }
.toc-link:hover { background: var(--primary-soft); text-decoration: none; }
.toc-link.on { background: var(--primary-soft); color: var(--primary); box-shadow: inset 3px 0 0 var(--primary); }
.toc-link.on svg { color: var(--primary); }

.g-main { min-width: 0; display: flex; flex-direction: column; gap: 1.1rem; font-size: 0.97rem; line-height: 1.65; }
.g-sec { scroll-margin-top: 84px; }
.part { margin: 0.6rem 0 0; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); }
.sec-title { display: flex; align-items: center; gap: 0.7rem; font-size: 1.35rem; margin: 0; }
.ico { width: 40px; height: 40px; border-radius: 12px; background: var(--primary-soft); color: var(--primary); display: grid; place-items: center; flex: none; }
.ico svg { width: 22px; height: 22px; }
.mod-head { display: flex; align-items: center; justify-content: space-between; gap: 0.8rem; flex-wrap: wrap; }
.tagline { margin: 0.5rem 0 0.2rem; color: var(--text-muted); font-size: 1.02rem; }
.meta { display: inline-block; margin: 0.4rem 0 0.2rem; font-size: 0.82rem; color: var(--text-muted); background: var(--surface-2); padding: 0.25rem 0.6rem; border-radius: 8px; }
.meta code { background: transparent; }
h4 { margin: 1.3rem 0 0.5rem; font-size: 1.02rem; color: var(--primary); }
h5 { margin: 0 0 0.35rem; font-size: 0.98rem; }
.lead { margin: 0.5rem 0; }

.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 0.8rem; margin: 0.9rem 0; }
.mini { background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0.8rem 0.9rem; }
.mini p { margin: 0.2rem 0 0; font-size: 0.9rem; color: var(--text-muted); }

.task { background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0.85rem 1rem; margin-bottom: 0.75rem; }
.steps { list-style: none; counter-reset: s; margin: 0.6rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
.steps li { counter-increment: s; position: relative; padding-left: 2.3rem; min-height: 1.7rem; }
.steps li::before {
  content: counter(s); position: absolute; left: 0; top: 0.05rem; width: 1.6rem; height: 1.6rem; border-radius: 50%;
  background: var(--primary); color: var(--on-primary); font-size: 0.78rem; font-weight: 800; display: grid; place-items: center;
}
.task .steps { margin-top: 0.3rem; }

.table-wrap { margin: 0.4rem 0; }
.gt td, .gt th { white-space: normal; vertical-align: top; }
.gt .bcell { width: 34%; }
.gt .fname { width: 34%; font-weight: 700; }
.chip { display: inline-block; background: var(--primary-soft); color: var(--primary); font-weight: 700; font-size: 0.85rem; padding: 0.15rem 0.6rem; border-radius: 7px; }
.ibtn { display: inline-grid; place-items: center; width: 32px; height: 32px; margin-right: 0.45rem; vertical-align: middle; border-radius: 9px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text-muted); }
.ibtn svg { width: 17px; height: 17px; }

.tips { margin-top: 1.1rem; background: var(--amber-soft); color: var(--text); border-radius: var(--radius-sm); padding: 0.7rem 1rem; }
.tips h4 { margin: 0 0 0.2rem; color: var(--amber-fg); }
.tips ul { margin: 0; padding-left: 1.1rem; }
.tips li { margin: 0.25rem 0; }

.shot { margin: 1rem 0; }
.shot img { width: 100%; height: auto; border: 1px solid var(--border); border-radius: var(--radius-sm); box-shadow: var(--shadow); display: block; }
.shot figcaption { margin-top: 0.35rem; font-size: 0.78rem; color: var(--text-muted); text-align: center; }
code { background: var(--surface-2); padding: 0.05rem 0.35rem; border-radius: 5px; font-size: 0.85em; }
.top { align-self: flex-end; font-weight: 700; }

@media (max-width: 960px) {
  .g-body { grid-template-columns: minmax(0, 1fr); }
  .g-toc { position: static; max-height: 260px; }
}
@media print {
  .g-toc, .g-tools, .top, .mod-head .btn { display: none !important; }
  .g-body { display: block; }
  .g-head { background: none; color: #000; border: 1px solid #ccc; }
  .g-head h2, .g-head p { color: #000; }
  .g-sec { break-inside: auto; box-shadow: none; margin-bottom: 1rem; }
  .task, .tips, .shot { break-inside: avoid; }
}
</style>
