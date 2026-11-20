// vite.config.ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { flowDataPlugin } from './plugins/flowDataPlugin';

export function normalizeBasePath(raw?: string): string {
  const value = raw?.trim();
  if (!value || value === '/') return '/';
  if (value === './') return './';
  const trimmed = value.replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}/` : '/';
}

const buildTarget = process.env.BUILD_TARGET === 'public' ? 'public' : 'internal';

export default defineConfig({
  base: normalizeBasePath(process.env.VITE_BASE_PATH),
  plugins: [vue(), tailwindcss(), flowDataPlugin(buildTarget)],
  define: {
    __ENABLE_TECH_MODE__: JSON.stringify(buildTarget === 'internal'),
    __BUILD_TARGET__: JSON.stringify(buildTarget),
  },
});
