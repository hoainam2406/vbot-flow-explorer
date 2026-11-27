// src/core/workspaceSettings.ts
import type { AppRepoConfig } from '../data/schema';

export type PreferredIde = 'antigravity-ide' | 'antigravity' | 'vscode' | 'cursor';

export interface DevWorkspaceSettings {
  localIosRepoPath: string;
  localAndroidRepoPath: string;
  preferredIde: PreferredIde;
  iosRepoWebUrlOverride: string;
  androidRepoWebUrlOverride: string;
  branchOverride: string;
  vbotWorkBaseUrlOverride: string;
}

export const DEV_SETTINGS_STORAGE_KEY = 'vbot-flow:dev-settings:v1';

const SAFE_EXTERNAL_SCHEMES = new Set([
  'http:',
  'https:',
  'antigravity-ide:',
  'antigravity:',
  'vscode:',
  'cursor:',
]);

const SUPPORTED_IDES: ReadonlySet<string> = new Set<PreferredIde>([
  'antigravity-ide',
  'antigravity',
  'vscode',
  'cursor',
]);

function normalizePreferredIde(value: unknown): PreferredIde {
  return typeof value === 'string' && SUPPORTED_IDES.has(value)
    ? (value as PreferredIde)
    : 'antigravity-ide';
}

export function createDefaultDevSettings(): DevWorkspaceSettings {
  return {
    localIosRepoPath: '',
    localAndroidRepoPath: '',
    preferredIde: 'antigravity-ide',
    iosRepoWebUrlOverride: '',
    androidRepoWebUrlOverride: '',
    branchOverride: '',
    vbotWorkBaseUrlOverride: '',
  };
}

export function isSafeExternalUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return SAFE_EXTERNAL_SCHEMES.has(parsed.protocol.toLowerCase());
  } catch {
    return false;
  }
}

export function loadDevWorkspaceSettings(): DevWorkspaceSettings {
  const defaults = createDefaultDevSettings();
  if (typeof window === 'undefined' || !window.localStorage) {
    return defaults;
  }
  try {
    const raw = window.localStorage.getItem(DEV_SETTINGS_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<DevWorkspaceSettings>;
    if (!parsed || typeof parsed !== 'object') return defaults;
    return {
      localIosRepoPath: typeof parsed.localIosRepoPath === 'string' ? parsed.localIosRepoPath : '',
      localAndroidRepoPath:
        typeof parsed.localAndroidRepoPath === 'string' ? parsed.localAndroidRepoPath : '',
      preferredIde: normalizePreferredIde(parsed.preferredIde),
      iosRepoWebUrlOverride:
        typeof parsed.iosRepoWebUrlOverride === 'string' ? parsed.iosRepoWebUrlOverride : '',
      androidRepoWebUrlOverride:
        typeof parsed.androidRepoWebUrlOverride === 'string' ? parsed.androidRepoWebUrlOverride : '',
      branchOverride: typeof parsed.branchOverride === 'string' ? parsed.branchOverride : '',
      vbotWorkBaseUrlOverride:
        typeof parsed.vbotWorkBaseUrlOverride === 'string' ? parsed.vbotWorkBaseUrlOverride : '',
    };
  } catch {
    return defaults;
  }
}

export function saveDevWorkspaceSettings(settings: DevWorkspaceSettings): DevWorkspaceSettings {
  const normalized: DevWorkspaceSettings = {
    localIosRepoPath: settings.localIosRepoPath.trim(),
    localAndroidRepoPath: settings.localAndroidRepoPath.trim(),
    preferredIde: normalizePreferredIde(settings.preferredIde),
    iosRepoWebUrlOverride: settings.iosRepoWebUrlOverride.trim(),
    androidRepoWebUrlOverride: settings.androidRepoWebUrlOverride.trim(),
    branchOverride: settings.branchOverride.trim(),
    vbotWorkBaseUrlOverride: settings.vbotWorkBaseUrlOverride.trim(),
  };
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(DEV_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
  }
  return normalized;
}

export function resetDevWorkspaceSettings(): DevWorkspaceSettings {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(DEV_SETTINGS_STORAGE_KEY);
  }
  return createDefaultDevSettings();
}

export function detectCodeRefPlatform(codeRef: string): 'ios' | 'android' {
  const trimmed = codeRef.trim();
  if (
    trimmed.startsWith('VBot-Android/') ||
    trimmed.startsWith('vb-ma-android-sdk/') ||
    /\.(kt|java|xml|gradle)(\b|$)/i.test(trimmed)
  ) {
    return 'android';
  }
  return 'ios';
}

function normalizeRelativeRepoRef(codeRef: string, platform: 'ios' | 'android'): string {
  const clean = codeRef.trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (platform === 'android') {
    return clean.replace(/^VBot-Android\//, '');
  }
  return clean.replace(/^VBot-iOS\//, '');
}

export function buildIdeFileUrl(
  codeRef: string,
  settings: DevWorkspaceSettings,
  line?: number,
): string | null {
  const trimmedRef = codeRef.trim();
  if (!trimmedRef) return null;
  const platform = detectCodeRefPlatform(trimmedRef);
  const rawBase =
    platform === 'ios' ? settings.localIosRepoPath : settings.localAndroidRepoPath;
  const cleanBase = rawBase.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  if (!cleanBase) return null;

  let rel = trimmedRef.replace(/\\/g, '/').replace(/^\/+/, '');
  if (platform === 'android' && cleanBase.endsWith('/VBot-Android')) {
    rel = rel.replace(/^VBot-Android\//, '');
  } else if (platform === 'ios' && cleanBase.endsWith('/VBot-iOS')) {
    rel = rel.replace(/^VBot-iOS\//, '');
  }

  const joined = `${cleanBase}/${rel}`;
  const lineSuffix =
    typeof line === 'number' && Number.isInteger(line) && line > 0 ? `:${line}` : '';
  const url = `${settings.preferredIde}://file/${joined.replace(/^\/+/, '')}${lineSuffix}`;
  return isSafeExternalUrl(url) ? url : null;
}

export function buildGitWebFileUrl(
  codeRef: string,
  settings: DevWorkspaceSettings,
  repoConfig?: AppRepoConfig,
  techBranch?: string,
): string | null {
  const trimmedRef = codeRef.trim();
  if (!trimmedRef) return null;
  const platform = detectCodeRefPlatform(trimmedRef);
  const rawBase =
    platform === 'ios'
      ? settings.iosRepoWebUrlOverride.trim() || repoConfig?.iosRepoWebUrl?.trim() || ''
      : settings.androidRepoWebUrlOverride.trim() || repoConfig?.androidRepoWebUrl?.trim() || '';

  if (!rawBase || !/^https?:\/\//i.test(rawBase)) {
    return null;
  }

  const cleanBase = rawBase.replace(/\/+$/, '');
  const branch = encodeURIComponent(
    settings.branchOverride.trim() || techBranch?.trim() || 'main',
  );
  const rel = normalizeRelativeRepoRef(trimmedRef, platform)
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');

  const blobSegment = cleanBase.toLowerCase().includes('gitlab') ? '-/blob' : 'blob';
  const url = `${cleanBase}/${blobSegment}/${branch}/${rel}`;
  return isSafeExternalUrl(url) ? url : null;
}
