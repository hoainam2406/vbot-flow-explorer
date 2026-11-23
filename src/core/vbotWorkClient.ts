// src/core/vbotWorkClient.ts
import type { VbotWorkPriority } from './vbotWorkTemplates';
import { isSafeExternalUrl } from './workspaceSettings';

export interface VbotWorkDevStatus {
  available: boolean;
  configured: boolean;
  projectName: string;
  projectSlug: string;
  assigneeName: string;
}

export interface CreatedVbotWorkTask {
  id: string;
  number?: number;
  key: string;
  title: string;
  projectName: string;
  assigneeName: string;
  url: string;
  createdAt: string;
}

export const CREATED_TASKS_STORAGE_KEY = 'vbot-flow:created-vbot-tasks:v1';

const DEFAULT_STATUS: VbotWorkDevStatus = {
  available: false,
  configured: false,
  projectName: 'vbot-mobile',
  projectSlug: 'VbM',
  assigneeName: 'Hoài Nam',
};

export function loadCreatedVbotWorkTasks(): Record<string, CreatedVbotWorkTask> {
  if (typeof window === 'undefined' || !window.localStorage) {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(CREATED_TASKS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<CreatedVbotWorkTask>>;
    if (!parsed || typeof parsed !== 'object') return {};

    const clean: Record<string, CreatedVbotWorkTask> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (
        v &&
        typeof v.id === 'string' &&
        typeof v.key === 'string' &&
        typeof v.title === 'string' &&
        typeof v.url === 'string' &&
        isSafeExternalUrl(v.url)
      ) {
        clean[k] = {
          id: v.id,
          ...(typeof v.number === 'number' ? { number: v.number } : {}),
          key: v.key,
          title: v.title,
          projectName: typeof v.projectName === 'string' ? v.projectName : 'vbot-mobile',
          assigneeName: typeof v.assigneeName === 'string' ? v.assigneeName : 'Hoài Nam',
          url: v.url,
          createdAt: typeof v.createdAt === 'string' ? v.createdAt : '',
        };
      }
    }
    return clean;
  } catch {
    return {};
  }
}

export function saveCreatedVbotWorkTask(
  itemKey: string,
  task: CreatedVbotWorkTask,
): Record<string, CreatedVbotWorkTask> {
  const current = loadCreatedVbotWorkTasks();
  const next = { ...current, [itemKey]: task };
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(CREATED_TASKS_STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

export async function probeVbotWorkDevStatus(): Promise<VbotWorkDevStatus> {
  if (!__ENABLE_TECH_MODE__ || !import.meta.env.DEV || typeof fetch === 'undefined') {
    return { ...DEFAULT_STATUS };
  }
  try {
    const resp = await fetch('/__vbot-dev/status');
    if (!resp.ok) return { ...DEFAULT_STATUS };
    const data = (await resp.json()) as {
      writable?: boolean;
      vbotWork?: {
        configured?: boolean;
        projectName?: string;
        projectSlug?: string;
        assigneeName?: string;
      };
    };
    return {
      available: Boolean(data.writable),
      configured: Boolean(data.vbotWork?.configured),
      projectName: data.vbotWork?.projectName || DEFAULT_STATUS.projectName,
      projectSlug: data.vbotWork?.projectSlug || DEFAULT_STATUS.projectSlug,
      assigneeName: data.vbotWork?.assigneeName || DEFAULT_STATUS.assigneeName,
    };
  } catch {
    return { ...DEFAULT_STATUS };
  }
}

export async function createVbotWorkTaskApi(payload: {
  title: string;
  description: string;
  priority: VbotWorkPriority;
}): Promise<{ ok: true; task: CreatedVbotWorkTask } | { ok: false; error: string; notConfigured?: boolean }> {
  if (!__ENABLE_TECH_MODE__ || !import.meta.env.DEV) {
    return {
      ok: false,
      error: 'Chỉ hỗ trợ tạo task trực tiếp khi chạy server local (pnpm dev).',
    };
  }

  try {
    const resp = await fetch('/__vbot-dev/vbot-work/create-task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: payload.title,
        description: payload.description,
        priority: payload.priority,
        status: 'to-do',
      }),
    });

    const data = (await resp.json()) as {
      ok?: boolean;
      error?: string;
      task?: {
        id?: string;
        number?: number;
        key?: string;
        title?: string;
        projectName?: string;
        assigneeName?: string;
        url?: string;
      };
    };

    if (!resp.ok || !data.ok || !data.task?.url || !isSafeExternalUrl(data.task.url)) {
      return {
        ok: false,
        error: data.error || `Không thể tạo task (HTTP ${resp.status}).`,
        notConfigured: resp.status === 503,
      };
    }

    return {
      ok: true,
      task: {
        id: data.task.id || '',
        ...(typeof data.task.number === 'number' ? { number: data.task.number } : {}),
        key: data.task.key || 'VbM',
        title: data.task.title || payload.title,
        projectName: data.task.projectName || 'vbot-mobile',
        assigneeName: data.task.assigneeName || 'Hoài Nam',
        url: data.task.url,
        createdAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : 'Không thể kết nối local proxy tạo task VBot Work.',
    };
  }
}
