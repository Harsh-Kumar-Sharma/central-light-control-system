import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router/index.js';
import './styles/theme.css';
import { applyTheme } from './utils/theme.js';

applyTheme(); // the inline script in index.html already set it before first paint; this wires up live updates

createApp(App).use(createPinia()).use(router).mount('#app');
