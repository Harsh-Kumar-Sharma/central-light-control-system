// Light / dark / system theme. The page always carries the RESOLVED theme in
// <html data-theme="light|dark">; the user's CHOICE ("light" | "dark" | "system")
// is what gets saved. "system" follows the OS and updates live when it changes.
const KEY = 'theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set();

export function getPreference() {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}

export const resolve = (pref) => (pref === 'system' ? (media.matches ? 'dark' : 'light') : pref);

export function applyTheme(pref = getPreference()) {
  const theme = resolve(pref);
  document.documentElement.dataset.theme = theme;
  listeners.forEach((fn) => fn(pref, theme));
}

export function setPreference(pref) {
  try {
    if (pref === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch { /* storage blocked: the choice just won't survive a reload */ }
  applyTheme(pref);
}

export function onThemeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Following the OS: react when the user flips their system between light and dark.
media.addEventListener('change', () => {
  if (getPreference() === 'system') applyTheme('system');
});

// Safety net: a tab that sat in the background (or a browser that skips the
// event) can miss the OS switch, so re-check whenever the user comes back.
const resync = () => { if (!document.hidden && getPreference() === 'system') applyTheme('system'); };
document.addEventListener('visibilitychange', resync);
window.addEventListener('focus', resync);
