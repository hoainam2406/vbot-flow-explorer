// src/core/explorerPreferences.ts
import type { ViewMode } from './graphEngine';
import type { PlatformViewMode } from '../data/schema';

export const EXPLORER_PREFS_STORAGE_KEY = 'vbot-flow-explorer-prefs-v1';
export const ONBOARDING_DISMISSED_KEY = 'vbot-flow-onboarding-dismissed-v1';

export interface SavedExplorerPrefs {
  audienceMode?: ViewMode;
  platformMode?: PlatformViewMode;
  branchId?: string;
}

export interface InitialExplorerStateInput {
  allowTechMode: boolean;
  search: string;
  hash: string;
  savedPrefs?: SavedExplorerPrefs | null;
}

export interface InitialBranchInput {
  allowTechMode: boolean;
  search: string;
  hash: string;
  savedPrefs?: SavedExplorerPrefs | null;
  availableBranchIds: readonly string[];
  defaultBranchId: string;
}

export interface ResolvedInitialExplorerState {
  audienceMode: ViewMode;
  platformMode: PlatformViewMode;
  focusNodeId: string | null;
  selectedNodeId: string | null;
}

function getDefaultStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadSavedExplorerPrefs(
  storage: Pick<Storage, 'getItem'> | null = getDefaultStorage(),
): SavedExplorerPrefs {
  if (!storage) return {};
  try {
    const raw = storage.getItem(EXPLORER_PREFS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const prefs: SavedExplorerPrefs = {};
    if (parsed.audienceMode === 'overview' || parsed.audienceMode === 'tech') {
      prefs.audienceMode = parsed.audienceMode;
    }
    if (
      parsed.platformMode === 'ios' ||
      parsed.platformMode === 'android' ||
      parsed.platformMode === 'compare'
    ) {
      prefs.platformMode = parsed.platformMode;
    }
    if (typeof parsed.branchId === 'string' && parsed.branchId.trim()) {
      prefs.branchId = parsed.branchId.trim();
    }
    return prefs;
  } catch {
    return {};
  }
}

export function saveExplorerPrefs(
  prefs: SavedExplorerPrefs,
  storage: Pick<Storage, 'setItem'> | null = getDefaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(EXPLORER_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Bỏ qua lỗi quota hoặc private mode trên trình duyệt
  }
}

export function loadOnboardingDismissed(
  storage: Pick<Storage, 'getItem'> | null = getDefaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(ONBOARDING_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveOnboardingDismissed(
  dismissed: boolean,
  storage: Pick<Storage, 'setItem' | 'removeItem'> | null = getDefaultStorage(),
): void {
  if (!storage) return;
  try {
    if (dismissed) {
      storage.setItem(ONBOARDING_DISMISSED_KEY, '1');
    } else {
      storage.removeItem(ONBOARDING_DISMISSED_KEY);
    }
  } catch {
    // Bỏ qua lỗi trình duyệt chặn storage
  }
}

export function resolveInitialExplorerState(
  input: InitialExplorerStateInput,
): ResolvedInitialExplorerState {
  const searchParams = new URLSearchParams(input.search);
  const rawHash = input.hash.replace(/^#/, '');
  const hashQuery = rawHash.includes('?') ? rawHash.split('?')[1] : rawHash.replace(/^\/+/, '');
  const hashParams = new URLSearchParams(hashQuery);

  const getParam = (key: string): string | null => hashParams.get(key) ?? searchParams.get(key);

  const focusParam = getParam('focus')?.trim() ?? '';
  const nodeParam = getParam('node')?.trim() ?? '';
  const focusNodeId = focusParam ? focusParam : null;
  const selectedNodeId = nodeParam ? nodeParam : null;

  if (!input.allowTechMode) {
    return {
      audienceMode: 'overview',
      platformMode: 'compare',
      focusNodeId,
      selectedNodeId,
    };
  }

  const rawMode = getParam('mode');
  const audienceMode: ViewMode =
    rawMode === 'tech' || rawMode === 'overview'
      ? rawMode
      : (input.savedPrefs?.audienceMode ?? 'tech');

  const rawPlatform = getParam('platform');
  const platformMode: PlatformViewMode =
    rawPlatform === 'ios' || rawPlatform === 'android' || rawPlatform === 'compare'
      ? rawPlatform
      : (input.savedPrefs?.platformMode ?? 'compare');

  return {
    audienceMode,
    platformMode,
    focusNodeId,
    selectedNodeId,
  };
}

export function resolveInitialBranchId(input: InitialBranchInput): string {
  if (!input.allowTechMode) {
    return input.defaultBranchId;
  }
  const searchParams = new URLSearchParams(input.search);
  const rawHash = input.hash.replace(/^#/, '');
  const hashQuery = rawHash.includes('?') ? rawHash.split('?')[1] : rawHash.replace(/^\/+/, '');
  const hashParams = new URLSearchParams(hashQuery);

  const fromUrl = (hashParams.get('branch') ?? searchParams.get('branch'))?.trim();
  const validSet = new Set(input.availableBranchIds);
  if (fromUrl && validSet.has(fromUrl)) {
    return fromUrl;
  }

  const fromSaved = input.savedPrefs?.branchId?.trim();
  if (fromSaved && validSet.has(fromSaved)) {
    return fromSaved;
  }

  return input.defaultBranchId;
}

export type ThemeMode = 'dark' | 'light';
export type LayoutDirection = 'LR' | 'TB';

export const THEME_STORAGE_KEY = 'vbot-flow-theme-v1';
export const LAYOUT_DIRECTION_STORAGE_KEY = 'vbot-flow-layout-dir-v1';

export function loadSavedTheme(
  storage: Pick<Storage, 'getItem'> | null = getDefaultStorage(),
): ThemeMode | null {
  if (!storage) return null;
  try {
    const val = storage.getItem(THEME_STORAGE_KEY);
    return val === 'dark' || val === 'light' ? val : null;
  } catch {
    return null;
  }
}

export function saveTheme(
  theme: ThemeMode,
  storage: Pick<Storage, 'setItem'> | null = getDefaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Bỏ qua lỗi trình duyệt chặn storage
  }
}

export function resolveInitialTheme(
  allowTechMode: boolean,
  savedTheme: ThemeMode | null,
): ThemeMode {
  if (savedTheme === 'dark' || savedTheme === 'light') {
    return savedTheme;
  }
  return allowTechMode ? 'dark' : 'light';
}

export function loadSavedLayoutDirection(
  storage: Pick<Storage, 'getItem'> | null = getDefaultStorage(),
): LayoutDirection | null {
  if (!storage) return null;
  try {
    const val = storage.getItem(LAYOUT_DIRECTION_STORAGE_KEY);
    return val === 'LR' || val === 'TB' ? val : null;
  } catch {
    return null;
  }
}

export function saveLayoutDirection(
  direction: LayoutDirection,
  storage: Pick<Storage, 'setItem'> | null = getDefaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(LAYOUT_DIRECTION_STORAGE_KEY, direction);
  } catch {
    // Bỏ qua lỗi trình duyệt chặn storage
  }
}
