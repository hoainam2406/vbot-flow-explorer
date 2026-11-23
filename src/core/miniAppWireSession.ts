// src/core/miniAppWireSession.ts
import { z } from 'zod';
import {
  createDefaultHostConfig,
  createInitialHostState,
  executeHostCommand,
  type SandboxFaultId,
  type SandboxHostConfig,
  type SandboxWireLogEntry,
} from './miniAppSandboxEngine';
import {
  createRoleStateFromPreset,
  type RolePresetId,
} from '../data/miniAppPermissionMatrix';

export const MAX_WIRE_SESSION_BYTES = 2 * 1024 * 1024;

export const WireSessionFileSchema = z.object({
  schemaVersion: z.literal('vbot-bridge-session/v1'),
  exportedAt: z.string().min(1),
  appId: z.string().min(1),
  hostConfig: z.object({
    appId: z.string().min(1),
    platform: z.enum(['ios', 'android']),
    rolePreset: z.string().min(1),
    theme: z.enum(['dark', 'light']),
    fault: z.string().min(1),
    apiBaseUrl: z.string(),
    projectCode: z.string(),
    userId: z.string(),
    defaultHotline: z.string(),
    extraData: z.record(z.string(), z.unknown()),
  }),
  wireLogs: z.array(
    z.object({
      id: z.string(),
      timestamp: z.string(),
      direction: z.enum(['miniapp_to_host', 'native_process', 'host_to_miniapp', 'system']),
      channel: z.string(),
      methodOrEvent: z.string(),
      status: z.enum(['ok', 'pending', 'error', 'warning']),
      payload: z.record(z.string(), z.unknown()),
      note: z.string().optional(),
    }),
  ),
  testSummary: z
    .object({
      passed: z.number(),
      warnings: z.number(),
      failed: z.number(),
      total: z.number(),
    })
    .optional(),
});

export type WireSessionFile = z.infer<typeof WireSessionFileSchema>;

export interface WireReplayItem {
  frameId: string;
  method: string;
  recordedStatus: SandboxWireLogEntry['status'];
  replayedStatus: SandboxWireLogEntry['status'];
  matched: boolean;
  replayedPayload: Record<string, unknown>;
  note?: string;
}

export interface WireReplaySummary {
  totalCommands: number;
  matchedCount: number;
  changedCount: number;
  items: WireReplayItem[];
}

const SENSITIVE_KEY_RE = /(token|authorization|secret|password|refresh_key|cookie|session_key)/i;

function maskTokenString(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length <= 8) return '***';
  return `${trimmed.slice(0, 4)}***${trimmed.slice(-4)}`;
}

export function redactSensitivePayload(input: unknown, depth = 0): unknown {
  if (depth > 8 || input === null || input === undefined) return input;
  if (Array.isArray(input)) {
    return input.map((item) => redactSensitivePayload(item, depth + 1));
  }
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (SENSITIVE_KEY_RE.test(k) && typeof v === 'string') {
        out[k] = maskTokenString(v);
      } else if (k.toLowerCase() === 'headers' && v && typeof v === 'object') {
        out[k] = redactSensitivePayload(v, depth + 1);
      } else {
        out[k] = redactSensitivePayload(v, depth + 1);
      }
    }
    return out;
  }
  return input;
}

export function buildWireSessionObject(
  config: SandboxHostConfig,
  logs: readonly SandboxWireLogEntry[],
  testSummary?: WireSessionFile['testSummary'],
): WireSessionFile {
  return {
    schemaVersion: 'vbot-bridge-session/v1',
    exportedAt: new Date().toISOString(),
    appId: config.appId,
    hostConfig: {
      appId: config.appId,
      platform: config.platform,
      rolePreset: config.rolePreset,
      theme: config.theme,
      fault: config.fault,
      apiBaseUrl: config.apiBaseUrl,
      projectCode: config.projectCode,
      userId: config.userId,
      defaultHotline: config.defaultHotline,
      extraData: redactSensitivePayload(config.extraData) as Record<string, unknown>,
    },
    wireLogs: logs.map((entry) => ({
      ...entry,
      payload: redactSensitivePayload(entry.payload) as Record<string, unknown>,
    })),
    ...(testSummary ? { testSummary } : {}),
  };
}

export function serializeWireSession(
  config: SandboxHostConfig,
  logs: readonly SandboxWireLogEntry[],
  testSummary?: WireSessionFile['testSummary'],
): string {
  return JSON.stringify(buildWireSessionObject(config, logs, testSummary), null, 2) + '\n';
}

export function parseWireSessionJson(
  raw: string,
): { ok: true; session: WireSessionFile } | { ok: false; error: string } {
  if (raw.length > MAX_WIRE_SESSION_BYTES) {
    return {
      ok: false,
      error: `File phiên vượt quá giới hạn ${Math.round(MAX_WIRE_SESSION_BYTES / (1024 * 1024))}MB.`,
    };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi cú pháp JSON: ${err instanceof Error ? err.message : 'không đọc được'}`,
    };
  }

  const res = WireSessionFileSchema.safeParse(parsedJson);
  if (!res.success) {
    return {
      ok: false,
      error: 'File không đúng định dạng vbot-bridge-session/v1.',
    };
  }
  return { ok: true, session: res.data };
}

const VALID_ROLE_PRESETS = new Set<RolePresetId>([
  'admin',
  'member_full',
  'member_sales',
  'member_supervisor',
  'member_minimal',
]);

export function restoreHostConfigFromSession(session: WireSessionFile): SandboxHostConfig {
  const base = createDefaultHostConfig(session.hostConfig.appId);
  const rolePreset: RolePresetId = VALID_ROLE_PRESETS.has(
    session.hostConfig.rolePreset as RolePresetId,
  )
    ? (session.hostConfig.rolePreset as RolePresetId)
    : 'member_sales';

  return {
    ...base,
    appId: session.hostConfig.appId,
    platform: session.hostConfig.platform,
    rolePreset,
    roleState: createRoleStateFromPreset(rolePreset),
    theme: session.hostConfig.theme,
    fault: (session.hostConfig.fault as SandboxFaultId) ?? 'none',
    apiBaseUrl: session.hostConfig.apiBaseUrl,
    projectCode: session.hostConfig.projectCode,
    userId: session.hostConfig.userId,
    defaultHotline: session.hostConfig.defaultHotline,
    extraData: session.hostConfig.extraData,
  };
}

export function replayWireSessionOnEngine(session: WireSessionFile): WireReplaySummary {
  const config = restoreHostConfigFromSession(session);
  let state = createInitialHostState(config);
  const items: WireReplayItem[] = [];

  for (let i = 0; i < session.wireLogs.length; i += 1) {
    const frame = session.wireLogs[i];
    if (frame.direction !== 'miniapp_to_host') continue;

    // Tìm frame phản hồi ngay sau lệnh này trong bản ghi gốc
    let recordedOutcome: SandboxWireLogEntry['status'] = frame.status;
    for (let j = i + 1; j < session.wireLogs.length; j += 1) {
      const next = session.wireLogs[j];
      if (next.direction === 'miniapp_to_host') break;
      if (next.direction === 'host_to_miniapp') {
        recordedOutcome = next.status;
        break;
      }
    }

    const commandPayload =
      frame.payload &&
      typeof frame.payload.action === 'string' &&
      frame.payload.action === frame.methodOrEvent &&
      frame.payload.payload &&
      typeof frame.payload.payload === 'object'
        ? (frame.payload.payload as Record<string, unknown>)
        : frame.payload;

    const result = executeHostCommand(frame.methodOrEvent, commandPayload, config, state);
    state = result.nextState;

    items.push({
      frameId: frame.id,
      method: frame.methodOrEvent,
      recordedStatus: recordedOutcome,
      replayedStatus: result.status,
      matched: recordedOutcome === result.status,
      replayedPayload: result.responsePayload,
      note: result.parityAlertNote,
    });
  }

  const matchedCount = items.filter((i) => i.matched).length;
  return {
    totalCommands: items.length,
    matchedCount,
    changedCount: items.length - matchedCount,
    items,
  };
}
