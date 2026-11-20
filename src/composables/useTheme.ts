// src/composables/useTheme.ts
import { computed, ref } from 'vue';
import {
  loadSavedTheme,
  resolveInitialTheme,
  saveTheme,
  type ThemeMode,
} from '../core/explorerPreferences';

const theme = ref<ThemeMode>('light');
const isDark = computed(() => theme.value === 'dark');

function applyThemeToDom(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', mode === 'dark');
  root.style.colorScheme = mode;
}

export function initTheme(allowTechMode: boolean): ThemeMode {
  const initial = resolveInitialTheme(allowTechMode, loadSavedTheme());
  theme.value = initial;
  applyThemeToDom(initial);
  return initial;
}

export function setTheme(mode: ThemeMode): void {
  theme.value = mode;
  applyThemeToDom(mode);
  saveTheme(mode);
}

export function toggleTheme(): ThemeMode {
  const next: ThemeMode = theme.value === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

export function useTheme() {
  return {
    theme,
    isDark,
    setTheme,
    toggleTheme,
  };
}
