// src/core/miniAppHostFetchMock.ts
import { z } from 'zod';

export const HostFetchMockMethodSchema = z.enum(['ANY', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
export type HostFetchMockMethod = z.infer<typeof HostFetchMockMethodSchema>;

export const HostFetchMockRuleSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean().default(true),
  name: z.string().min(1),
  method: HostFetchMockMethodSchema.default('ANY'),
  urlPattern: z.string().min(1),
  status: z.number().int().min(100).max(599).default(200),
  delayMs: z.number().int().min(0).max(30000).default(0),
  responseJson: z.string().default('{}'),
  headers: z.record(z.string(), z.string()).optional(),
});

export type HostFetchMockRule = z.infer<typeof HostFetchMockRuleSchema>;

export const HOST_FETCH_MOCK_STORAGE_KEY = 'vbot-flow:host-fetch-mocks:v1';

export interface HostFetchMockPreset {
  id: string;
  label: string;
  rule: Omit<HostFetchMockRule, 'id'>;
}

export const HOST_FETCH_MOCK_PRESETS: readonly HostFetchMockPreset[] = [
  {
    id: 'empty_200',
    label: 'Danh sách rỗng (200)',
    rule: {
      enabled: true,
      name: 'Danh sách rỗng 200 OK',
      method: 'GET',
      urlPattern: '*/customers*',
      status: 200,
      delayMs: 0,
      responseJson: JSON.stringify({ items: [], total: 0 }, null, 2),
    },
  },
  {
    id: 'expired_401',
    label: 'Token hết hạn (401)',
    rule: {
      enabled: true,
      name: 'Giả lập 401 Unauthorized',
      method: 'ANY',
      urlPattern: '*',
      status: 401,
      delayMs: 0,
      responseJson: JSON.stringify(
        { error_code: 'TOKEN_EXPIRED', message: 'Access token đã hết hạn' },
        null,
        2,
      ),
    },
  },
  {
    id: 'server_500',
    label: 'Lỗi Server (500)',
    rule: {
      enabled: true,
      name: 'Giả lập lỗi 500 Internal Error',
      method: 'POST',
      urlPattern: '*',
      status: 500,
      delayMs: 0,
      responseJson: JSON.stringify(
        { error_code: 'INTERNAL_SERVER_ERROR', message: 'Backend tạm thời gián đoạn' },
        null,
        2,
      ),
    },
  },
  {
    id: 'slow_1500ms',
    label: 'Mạng chậm (1500ms)',
    rule: {
      enabled: true,
      name: 'Mạng chậm 1500ms + 200 OK',
      method: 'GET',
      urlPattern: '*',
      status: 200,
      delayMs: 1500,
      responseJson: JSON.stringify({ ok: true, slow_simulated: true, items: [] }, null, 2),
    },
  },
];

function readStoreMap(): Record<string, HostFetchMockRule[]> {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(HOST_FETCH_MOCK_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, HostFetchMockRule[]> = {};
    for (const [appId, arr] of Object.entries(parsed)) {
      if (!Array.isArray(arr)) continue;
      const valid: HostFetchMockRule[] = [];
      for (const item of arr) {
        const res = HostFetchMockRuleSchema.safeParse(item);
        if (res.success) valid.push(res.data);
      }
      out[appId] = valid;
    }
    return out;
  } catch {
    return {};
  }
}

export function loadHostFetchMockRules(appId: string): HostFetchMockRule[] {
  const store = readStoreMap();
  return store[appId] ?? [];
}

export function saveHostFetchMockRules(
  appId: string,
  rules: readonly HostFetchMockRule[],
): HostFetchMockRule[] {
  const normalized = rules
    .map((r) => HostFetchMockRuleSchema.safeParse(r))
    .filter((r): r is { success: true; data: HostFetchMockRule } => r.success)
    .map((r) => r.data);

  if (typeof window !== 'undefined' && window.localStorage) {
    const store = readStoreMap();
    if (normalized.length === 0) {
      delete store[appId];
    } else {
      store[appId] = normalized;
    }
    try {
      window.localStorage.setItem(HOST_FETCH_MOCK_STORAGE_KEY, JSON.stringify(store));
    } catch {
      // ignore storage quota errors
    }
  }
  return normalized;
}

function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

export function matchHostFetchMockRule(
  rules: readonly HostFetchMockRule[],
  method: string,
  url: string,
): HostFetchMockRule | null {
  const cleanMethod = method.trim().toUpperCase() || 'GET';
  const cleanUrl = url.trim();
  if (!cleanUrl) return null;

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.method !== 'ANY' && rule.method.toUpperCase() !== cleanMethod) continue;

    const pattern = rule.urlPattern.trim();
    if (!pattern) continue;
    if (pattern.includes('*')) {
      if (wildcardToRegExp(pattern).test(cleanUrl)) {
        return rule;
      }
    } else if (cleanUrl.toLowerCase().includes(pattern.toLowerCase())) {
      return rule;
    }
  }
  return null;
}

export function evaluateHostFetchMockRule(rule: HostFetchMockRule): {
  ok: boolean;
  status: number;
  data: unknown;
  error?: string;
} {
  const ok = rule.status >= 200 && rule.status < 400;
  const trimmed = rule.responseJson.trim();
  if (!trimmed) {
    return { ok, status: rule.status, data: {} };
  }
  try {
    const data: unknown = JSON.parse(trimmed);
    return { ok, status: rule.status, data };
  } catch (err) {
    return {
      ok,
      status: rule.status,
      data: trimmed,
      error: err instanceof Error ? err.message : 'Response JSON không hợp lệ',
    };
  }
}

export async function callLocalHostFetchProxy(params: {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  allowedOrigins?: string[];
}): Promise<{ ok: true; status: number; data: unknown } | { ok: false; error: string }> {
  if (!import.meta.env.DEV || typeof fetch === 'undefined') {
    return {
      ok: false,
      error: 'Proxy Staging chỉ khả dụng khi chạy server local (pnpm dev).',
    };
  }
  try {
    const resp = await fetch('/__vbot-dev/host-fetch-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: params.url,
        method: (params.method ?? 'GET').toUpperCase(),
        headers: params.headers ?? {},
        ...(params.body !== undefined ? { body: params.body } : {}),
        allowedOrigins: params.allowedOrigins ?? [],
      }),
    });
    const parsed = (await resp.json()) as {
      ok?: boolean;
      status?: number;
      data?: unknown;
      error?: string;
    };
    if (!resp.ok || !parsed.ok) {
      return { ok: false, error: parsed.error || `Proxy lỗi HTTP ${resp.status}` };
    }
    return {
      ok: true,
      status: parsed.status ?? 200,
      data: parsed.data,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Không thể kết nối local Staging Proxy.',
    };
  }
}
