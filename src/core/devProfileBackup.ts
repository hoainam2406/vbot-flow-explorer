// src/core/devProfileBackup.ts
import { z } from 'zod';
import {
  DevWorkspacePinsStateSchema,
  loadDevWorkspacePins,
  saveDevWorkspacePins,
} from './devWorkspacePins';
import {
  DevWorkboardStateSchema,
  loadDevWorkboard,
  saveDevWorkboard,
} from './devWorkboardStore';
import {
  HOST_FETCH_MOCK_STORAGE_KEY,
  HostFetchMockRuleSchema,
  type HostFetchMockRule,
} from './miniAppHostFetchMock';
import { MINIAPP_URL_PRESETS_STORAGE_KEY } from './miniAppDevPresets';
import { CREATED_TASKS_STORAGE_KEY, loadCreatedVbotWorkTasks } from './vbotWorkClient';
import {
  loadParityTriageMap,
  PARITY_TRIAGE_STORAGE_KEY,
  type ParityTriageStatus,
} from './vbotWorkTemplates';
import {
  DEV_SETTINGS_STORAGE_KEY,
  loadDevWorkspaceSettings,
  saveDevWorkspaceSettings,
  type DevWorkspaceSettings,
} from './workspaceSettings';

export const MAX_DEV_PROFILE_BACKUP_BYTES = 5 * 1024 * 1024;

const ParityTriageStatusSchema = z.enum(['open', 'in_progress', 'synced', 'accepted_diff']);

const DevSettingsBackupSchema = z.object({
  localIosRepoPath: z.string().default(''),
  localAndroidRepoPath: z.string().default(''),
  preferredIde: z.enum(['antigravity-ide', 'antigravity', 'vscode', 'cursor']).default('antigravity-ide'),
  iosRepoWebUrlOverride: z.string().default(''),
  androidRepoWebUrlOverride: z.string().default(''),
  branchOverride: z.string().default(''),
  vbotWorkBaseUrlOverride: z.string().default(''),
});

const CreatedTaskBackupSchema = z.object({
  id: z.string().min(1),
  number: z.number().optional(),
  key: z.string().min(1),
  title: z.string().min(1),
  projectName: z.string().default('vbot-mobile'),
  assigneeName: z.string().default('Hoài Nam'),
  url: z.string().min(1),
  createdAt: z.string().default(''),
});

export const DevProfileBackupSchema = z.object({
  schemaVersion: z.literal('vbot-dev-profile/v1'),
  exportedAt: z.string().min(1),
  data: z.object({
    devSettings: DevSettingsBackupSchema.optional(),
    devPins: DevWorkspacePinsStateSchema.optional(),
    devWorkboard: DevWorkboardStateSchema.optional(),
    parityTriage: z.record(z.string(), ParityTriageStatusSchema).optional(),
    hostFetchMocks: z.record(z.string(), z.array(HostFetchMockRuleSchema)).optional(),
    miniAppUrlPresets: z.record(z.string(), z.array(z.string())).optional(),
    createdVbotTasks: z.record(z.string(), CreatedTaskBackupSchema).optional(),
  }),
});

export type DevProfileBackup = z.infer<typeof DevProfileBackupSchema>;

function readRawJsonRecord<T>(storageKey: string): Record<string, T> {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, T>)
      : {};
  } catch {
    return {};
  }
}

export function getDevProfileCountsSummary(): {
  pinnedCount: number;
  notesCount: number;
  workboardTaskCount: number;
  triageCount: number;
  mockRuleCount: number;
  urlPresetCount: number;
  createdTaskCount: number;
} {
  const pins = loadDevWorkspacePins();
  const workboard = loadDevWorkboard();
  const triage = loadParityTriageMap();
  const mocks = readRawJsonRecord<HostFetchMockRule[]>(HOST_FETCH_MOCK_STORAGE_KEY);
  const presets = readRawJsonRecord<string[]>(MINIAPP_URL_PRESETS_STORAGE_KEY);
  const created = loadCreatedVbotWorkTasks();

  const mockRuleCount = Object.values(mocks).reduce(
    (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
    0,
  );
  const urlPresetCount = Object.values(presets).reduce(
    (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
    0,
  );

  return {
    pinnedCount: pins.pinnedNodeIds.length,
    notesCount: Object.keys(pins.notesByNodeId).length,
    workboardTaskCount: workboard.tasks.length,
    triageCount: Object.keys(triage).length,
    mockRuleCount,
    urlPresetCount,
    createdTaskCount: Object.keys(created).length,
  };
}

export function exportDevProfileBackup(): DevProfileBackup {
  const settings = loadDevWorkspaceSettings();
  const pins = loadDevWorkspacePins();
  const workboard = loadDevWorkboard();
  const parityTriage = loadParityTriageMap();
  const hostFetchMocks = readRawJsonRecord<HostFetchMockRule[]>(HOST_FETCH_MOCK_STORAGE_KEY);
  const miniAppUrlPresets = readRawJsonRecord<string[]>(MINIAPP_URL_PRESETS_STORAGE_KEY);
  const createdVbotTasks = loadCreatedVbotWorkTasks();

  return {
    schemaVersion: 'vbot-dev-profile/v1',
    exportedAt: new Date().toISOString(),
    data: {
      devSettings: settings,
      devPins: pins,
      devWorkboard: workboard,
      parityTriage,
      hostFetchMocks,
      miniAppUrlPresets,
      createdVbotTasks,
    },
  };
}

export function parseDevProfileBackupJson(
  raw: string,
): { ok: true; backup: DevProfileBackup } | { ok: false; error: string } {
  if (raw.length > MAX_DEV_PROFILE_BACKUP_BYTES) {
    return { ok: false, error: 'File Dev Profile vượt quá giới hạn 5MB.' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'File JSON không hợp lệ.',
    };
  }
  const validated = DevProfileBackupSchema.safeParse(parsed);
  if (!validated.success) {
    return {
      ok: false,
      error: `Sai định dạng vbot-dev-profile/v1: ${validated.error.issues[0]?.message ?? 'invalid schema'}`,
    };
  }
  return { ok: true, backup: validated.data };
}

export function applyDevProfileBackup(
  backup: DevProfileBackup,
  mode: 'merge' | 'replace',
): { restoredSections: string[] } {
  const restoredSections: string[] = [];
  const d = backup.data;

  if (d.devSettings) {
    if (mode === 'replace') {
      saveDevWorkspaceSettings(d.devSettings as DevWorkspaceSettings);
    } else {
      const cur = loadDevWorkspaceSettings();
      saveDevWorkspaceSettings({
        localIosRepoPath: cur.localIosRepoPath || d.devSettings.localIosRepoPath,
        localAndroidRepoPath: cur.localAndroidRepoPath || d.devSettings.localAndroidRepoPath,
        preferredIde: cur.preferredIde || d.devSettings.preferredIde,
        iosRepoWebUrlOverride: cur.iosRepoWebUrlOverride || d.devSettings.iosRepoWebUrlOverride,
        androidRepoWebUrlOverride: cur.androidRepoWebUrlOverride || d.devSettings.androidRepoWebUrlOverride,
        branchOverride: cur.branchOverride || d.devSettings.branchOverride,
        vbotWorkBaseUrlOverride: cur.vbotWorkBaseUrlOverride || d.devSettings.vbotWorkBaseUrlOverride,
      });
    }
    restoredSections.push('Cài đặt Workspace');
  }

  if (d.devPins) {
    if (mode === 'replace') {
      saveDevWorkspacePins(d.devPins);
    } else {
      const cur = loadDevWorkspacePins();
      saveDevWorkspacePins({
        pinnedNodeIds: [...new Set([...cur.pinnedNodeIds, ...d.devPins.pinnedNodeIds])],
        notesByNodeId: { ...d.devPins.notesByNodeId, ...cur.notesByNodeId },
        updatedAt: Date.now(),
      });
    }
    restoredSections.push('Working Pins & Ghi chú');
  }

  if (d.devWorkboard) {
    if (mode === 'replace') {
      saveDevWorkboard(d.devWorkboard);
    } else {
      const cur = loadDevWorkboard();
      const seenIds = new Set(cur.tasks.map((t) => t.id));
      const merged = [
        ...cur.tasks,
        ...d.devWorkboard.tasks.filter((t) => !seenIds.has(t.id)),
      ];
      saveDevWorkboard({ tasks: merged, updatedAt: Date.now() });
    }
    restoredSections.push('Dev Workboard');
  }

  if (d.parityTriage && typeof window !== 'undefined' && window.localStorage) {
    const nextTriage: Record<string, ParityTriageStatus> =
      mode === 'replace'
        ? { ...d.parityTriage }
        : { ...d.parityTriage, ...loadParityTriageMap() };
    window.localStorage.setItem(PARITY_TRIAGE_STORAGE_KEY, JSON.stringify(nextTriage));
    restoredSections.push('Parity Triage');
  }

  if (d.hostFetchMocks && typeof window !== 'undefined' && window.localStorage) {
    if (mode === 'replace') {
      window.localStorage.setItem(HOST_FETCH_MOCK_STORAGE_KEY, JSON.stringify(d.hostFetchMocks));
    } else {
      const cur = readRawJsonRecord<HostFetchMockRule[]>(HOST_FETCH_MOCK_STORAGE_KEY);
      const next: Record<string, HostFetchMockRule[]> = { ...cur };
      for (const [appId, rules] of Object.entries(d.hostFetchMocks)) {
        const existing = Array.isArray(next[appId]) ? next[appId] : [];
        const seenIds = new Set(existing.map((r) => r.id));
        next[appId] = [...existing, ...rules.filter((r) => !seenIds.has(r.id))];
      }
      window.localStorage.setItem(HOST_FETCH_MOCK_STORAGE_KEY, JSON.stringify(next));
    }
    restoredSections.push('Mock Rules');
  }

  if (d.miniAppUrlPresets && typeof window !== 'undefined' && window.localStorage) {
    if (mode === 'replace') {
      window.localStorage.setItem(
        MINIAPP_URL_PRESETS_STORAGE_KEY,
        JSON.stringify(d.miniAppUrlPresets),
      );
    } else {
      const cur = readRawJsonRecord<string[]>(MINIAPP_URL_PRESETS_STORAGE_KEY);
      const next: Record<string, string[]> = { ...cur };
      for (const [appId, urls] of Object.entries(d.miniAppUrlPresets)) {
        const existing = Array.isArray(next[appId]) ? next[appId] : [];
        next[appId] = [...new Set([...existing, ...urls])].slice(0, 8);
      }
      window.localStorage.setItem(MINIAPP_URL_PRESETS_STORAGE_KEY, JSON.stringify(next));
    }
    restoredSections.push('URL Presets');
  }

  if (d.createdVbotTasks && typeof window !== 'undefined' && window.localStorage) {
    const nextCreated =
      mode === 'replace'
        ? d.createdVbotTasks
        : { ...d.createdVbotTasks, ...loadCreatedVbotWorkTasks() };
    window.localStorage.setItem(CREATED_TASKS_STORAGE_KEY, JSON.stringify(nextCreated));
    restoredSections.push('Task đã tạo');
  }

  // Đảm bảo key settings tồn tại nếu chưa lưu trước đó
  if (typeof window !== 'undefined' && window.localStorage && !window.localStorage.getItem(DEV_SETTINGS_STORAGE_KEY)) {
    saveDevWorkspaceSettings(loadDevWorkspaceSettings());
  }

  return { restoredSections };
}
