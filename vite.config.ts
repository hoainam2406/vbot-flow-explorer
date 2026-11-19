// vite.config.ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { flowDataPlugin } from './plugins/flowDataPlugin';

const buildTarget = process.env.BUILD_TARGET === 'public' ? 'public' : 'internal';

export default defineConfig({
  plugins: [vue(), tailwindcss(), flowDataPlugin(buildTarget)],
  define: {
    __ENABLE_TECH_MODE__: JSON.stringify(buildTarget === 'internal'),
    __BUILD_TARGET__: JSON.stringify(buildTarget),
  },
});
