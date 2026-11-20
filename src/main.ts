import { createApp } from 'vue';
import './style.css';
import { initTheme } from './composables/useTheme';
import App from './App.vue';

initTheme(__ENABLE_TECH_MODE__);

createApp(App).mount('#app');
