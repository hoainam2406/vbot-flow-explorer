// src/core/miniAppDevPresets.ts
import type { HostFetchMockMethod, HostFetchMockRule } from './miniAppHostFetchMock';
import type { SandboxWireLogEntry } from './miniAppSandboxEngine';

export const MINIAPP_URL_PRESETS_STORAGE_KEY = 'vbot-flow:miniapp-url-presets:v1';

export const DEFAULT_LOCALHOST_PRESETS: readonly string[] = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:8080',
];

function readPresetStore(): Record<string, string[]> {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(MINIAPP_URL_PRESETS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (Array.isArray(v)) {
        out[k] = v.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()));
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function loadMiniAppUrlPresets(appId: string): string[] {
  const saved = readPresetStore()[appId] ?? [];
  const merged = new Set<string>([...saved, ...DEFAULT_LOCALHOST_PRESETS]);
  return [...merged];
}

export function saveMiniAppUrlPreset(appId: string, rawUrl: string): string[] {
  const clean = rawUrl.trim();
  if (!clean) return loadMiniAppUrlPresets(appId);
  const store = readPresetStore();
  const existing = store[appId] ?? [];
  const next = [clean, ...existing.filter((u) => u !== clean)].slice(0, 8);
  store[appId] = next;
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(MINIAPP_URL_PRESETS_STORAGE_KEY, JSON.stringify(store));
  }
  return loadMiniAppUrlPresets(appId);
}

function normalizeMethod(raw: unknown): HostFetchMockMethod {
  if (typeof raw !== 'string') return 'ANY';
  const upper = raw.toUpperCase();
  if (
    upper === 'GET' ||
    upper === 'POST' ||
    upper === 'PUT' ||
    upper === 'PATCH' ||
    upper === 'DELETE'
  ) {
    return upper;
  }
  return 'ANY';
}

function buildPatternFromUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return `*${parsed.pathname}*`;
  } catch {
    return rawUrl.trim() || '*';
  }
}

/**
 * Chuyển một frame kết quả `host_fetch` trong Live Wire thành HostFetchMockRule dùng ngay.
 */
export function buildMockRuleFromWireFrame(
  frame: SandboxWireLogEntry,
  requestFrame?: SandboxWireLogEntry,
): HostFetchMockRule | null {
  if (!frame || frame.methodOrEvent.toLowerCase().indexOf('host_fetch') < 0) {
    return null;
  }

  const payload = frame.payload ?? {};
  const reqPayload = requestFrame?.payload ?? {};
  const urlCandidate =
    (typeof payload.url === 'string' && payload.url) ||
    (typeof reqPayload.url === 'string' && reqPayload.url) ||
    '';

  const statusNum =
    typeof payload.status === 'number' && payload.status >= 100 && payload.status <= 599
      ? Math.trunc(payload.status)
      : frame.status === 'error'
        ? 500
        : 200;

  const responseBody = payload.data !== undefined ? payload.data : payload;
  const urlPattern = urlCandidate ? buildPatternFromUrl(urlCandidate) : '*';
  const method = normalizeMethod(reqPayload.method ?? payload.method);

  return {
    id: `mock-rec-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    enabled: true,
    name: `Recorded ${method} ${urlPattern}`.slice(0, 80),
    method,
    urlPattern,
    status: statusNum,
    delayMs: 0,
    responseJson: JSON.stringify(responseBody, null, 2),
  };
}
