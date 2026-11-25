// tests/explorerPreferences.test.ts
import { describe, expect, it } from 'vitest';
import {
  EXPLORER_PREFS_STORAGE_KEY,
  LAYOUT_DIRECTION_STORAGE_KEY,
  ONBOARDING_DISMISSED_KEY,
  THEME_STORAGE_KEY,
  loadOnboardingDismissed,
  loadSavedExplorerPrefs,
  loadSavedLayoutDirection,
  loadSavedTheme,
  resolveInitialBranchId,
  resolveInitialExplorerState,
  resolveInitialTheme,
  saveExplorerPrefs,
  saveLayoutDirection,
  saveOnboardingDismissed,
  saveTheme,
} from '../src/core/explorerPreferences';

function createMockStorage(initial: Record<string, string> = {}): Storage {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

describe('explorerPreferences', () => {
  it('defaults internal mode to tech + compare when no URL or saved preferences exist', () => {
    const resolved = resolveInitialExplorerState({
      allowTechMode: true,
      search: '',
      hash: '',
      savedPrefs: null,
    });
    expect(resolved).toEqual({
      audienceMode: 'tech',
      platformMode: 'compare',
      focusNodeId: null,
      selectedNodeId: null,
    });
  });

  it('gives URL hash > search > savedPrefs precedence in internal mode and parses focus/node', () => {
    const fromHash = resolveInitialExplorerState({
      allowTechMode: true,
      search: '?mode=overview&platform=ios&focus=mod-auth',
      hash: '#/?mode=tech&platform=android&focus=mod-calling&node=call-incoming',
      savedPrefs: { audienceMode: 'overview', platformMode: 'ios' },
    });
    expect(fromHash).toEqual({
      audienceMode: 'tech',
      platformMode: 'android',
      focusNodeId: 'mod-calling',
      selectedNodeId: 'call-incoming',
    });

    const fromSaved = resolveInitialExplorerState({
      allowTechMode: true,
      search: '',
      hash: '',
      savedPrefs: { audienceMode: 'overview', platformMode: 'ios' },
    });
    expect(fromSaved).toEqual({
      audienceMode: 'overview',
      platformMode: 'ios',
      focusNodeId: null,
      selectedNodeId: null,
    });
  });

  it('locks public mode to overview + compare regardless of URL or savedPrefs while keeping focus/node', () => {
    const resolved = resolveInitialExplorerState({
      allowTechMode: false,
      search: '',
      hash: '#/?mode=tech&platform=android&focus=mod-calling&node=call-incoming',
      savedPrefs: { audienceMode: 'tech', platformMode: 'ios' },
    });
    expect(resolved).toEqual({
      audienceMode: 'overview',
      platformMode: 'compare',
      focusNodeId: 'mod-calling',
      selectedNodeId: 'call-incoming',
    });
  });

  it('loads and saves prefs & onboarding banner dismissal safely with corrupted or throwing storage', () => {
    const storage = createMockStorage();
    saveExplorerPrefs({ audienceMode: 'overview', platformMode: 'android' }, storage);
    expect(loadSavedExplorerPrefs(storage)).toEqual({
      audienceMode: 'overview',
      platformMode: 'android',
    });

    saveOnboardingDismissed(true, storage);
    expect(loadOnboardingDismissed(storage)).toBe(true);
    saveOnboardingDismissed(false, storage);
    expect(loadOnboardingDismissed(storage)).toBe(false);

    const brokenJsonStorage = createMockStorage({
      [EXPLORER_PREFS_STORAGE_KEY]: '{invalid-json',
      [ONBOARDING_DISMISSED_KEY]: '0',
    });
    expect(loadSavedExplorerPrefs(brokenJsonStorage)).toEqual({});
    expect(loadOnboardingDismissed(brokenJsonStorage)).toBe(false);

    const throwingStorage: Storage = {
      length: 0,
      clear() {},
      getItem() {
        throw new Error('Blocked');
      },
      key() {
        return null;
      },
      removeItem() {
        throw new Error('Blocked');
      },
      setItem() {
        throw new Error('Blocked');
      },
    };
    expect(() =>
      saveExplorerPrefs({ audienceMode: 'tech', platformMode: 'ios' }, throwingStorage),
    ).not.toThrow();
    expect(loadSavedExplorerPrefs(throwingStorage)).toEqual({});
    expect(() => saveOnboardingDismissed(true, throwingStorage)).not.toThrow();
    expect(loadOnboardingDismissed(throwingStorage)).toBe(false);
  });

  it('resolves default theme (dark for internal, light for public), respects saved override, and persists layout direction safely', () => {
    expect(resolveInitialTheme(true, null)).toBe('dark');
    expect(resolveInitialTheme(false, null)).toBe('light');
    expect(resolveInitialTheme(true, 'light')).toBe('light');
    expect(resolveInitialTheme(false, 'dark')).toBe('dark');

    const storage = createMockStorage();
    expect(loadSavedTheme(storage)).toBeNull();
    saveTheme('dark', storage);
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(loadSavedTheme(storage)).toBe('dark');

    expect(loadSavedLayoutDirection(storage)).toBeNull();
    saveLayoutDirection('TB', storage);
    expect(storage.getItem(LAYOUT_DIRECTION_STORAGE_KEY)).toBe('TB');
    expect(loadSavedLayoutDirection(storage)).toBe('TB');

    const invalidStorage = createMockStorage({
      [THEME_STORAGE_KEY]: 'sepia',
      [LAYOUT_DIRECTION_STORAGE_KEY]: 'RL',
    });
    expect(loadSavedTheme(invalidStorage)).toBeNull();
    expect(loadSavedLayoutDirection(invalidStorage)).toBeNull();
  });

  it('resolves branchId with URL > savedPrefs > default precedence and persists branchId', () => {
    const storage = createMockStorage();
    saveExplorerPrefs(
      { audienceMode: 'tech', platformMode: 'compare', branchId: 'Nam-dev-SBSI' },
      storage,
    );
    expect(loadSavedExplorerPrefs(storage)).toEqual({
      audienceMode: 'tech',
      platformMode: 'compare',
      branchId: 'Nam-dev-SBSI',
    });

    const available = ['Nam-dev', 'Nam-dev-SBSI'];
    expect(
      resolveInitialBranchId({
        allowTechMode: true,
        search: '?branch=Nam-dev',
        hash: '#/?branch=Nam-dev-SBSI',
        savedPrefs: { branchId: 'Nam-dev' },
        availableBranchIds: available,
        defaultBranchId: 'Nam-dev',
      }),
    ).toBe('Nam-dev-SBSI');

    expect(
      resolveInitialBranchId({
        allowTechMode: true,
        search: '',
        hash: '',
        savedPrefs: { branchId: 'Nam-dev-SBSI' },
        availableBranchIds: available,
        defaultBranchId: 'Nam-dev',
      }),
    ).toBe('Nam-dev-SBSI');

    expect(
      resolveInitialBranchId({
        allowTechMode: true,
        search: '',
        hash: '#/?branch=unknown-branch',
        savedPrefs: { branchId: 'stale-branch' },
        availableBranchIds: available,
        defaultBranchId: 'Nam-dev',
      }),
    ).toBe('Nam-dev');

    expect(
      resolveInitialBranchId({
        allowTechMode: false,
        search: '?branch=Nam-dev-SBSI',
        hash: '#/?branch=Nam-dev-SBSI',
        savedPrefs: { branchId: 'Nam-dev-SBSI' },
        availableBranchIds: available,
        defaultBranchId: 'Nam-dev',
      }),
    ).toBe('Nam-dev');
  });
});
