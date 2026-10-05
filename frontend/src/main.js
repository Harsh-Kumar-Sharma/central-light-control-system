import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router/index.js';
import './styles/theme.css';

try {
  const saved = localStorage.getItem('theme');
  if (saved) document.documentElement.dataset.theme = saved;
} catch {
  // storage unavailable: fall back to the default light theme
}

createApp(App).use(createPinia()).use(router).mount('#app');
