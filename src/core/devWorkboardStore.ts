// src/core/devWorkboardStore.ts
import { z } from 'zod';
import type { FlowNodeData, MergedFlowDataset } from '../data/schema';

export const DEV_WORKBOARD_STORAGE_KEY = 'vbot-flow:dev-workboard:v1';

export const WorkboardStatusSchema = z.enum(['todo', 'doing', 'review', 'done']);
export const WorkboardPlatformSchema = z.enum(['ios', 'android', 'both']);
export const WorkboardPrioritySchema = z.enum(['high', 'medium', 'low']);

export type WorkboardStatus = z.infer<typeof WorkboardStatusSchema>;
export type WorkboardPlatform = z.infer<typeof WorkboardPlatformSchema>;
export type WorkboardPriority = z.infer<typeof WorkboardPrioritySchema>;

export const DevWorkboardTaskSchema = z.object({
  id: z.string().min(1),
  key: z.string().optional(),
  title: z.string().min(1),
  url: z.string().optional(),
  status: WorkboardStatusSchema.default('todo'),
  platform: WorkboardPlatformSchema.default('both'),
  priority: WorkboardPrioritySchema.default('medium'),
  nodeId: z.string().optional(),
  note: z.string().optional(),
  createdAt: z.string().default(''),
  updatedAt: z.string().default(''),
});

export type DevWorkboardTask = z.infer<typeof DevWorkboardTaskSchema>;

export const DevWorkboardStateSchema = z.object({
  tasks: z.array(DevWorkboardTaskSchema).default([]),
  updatedAt: z.number().default(0),
});

export type DevWorkboardState = z.infer<typeof DevWorkboardStateSchema>;

export interface NodeTaskBadgeInfo {
  label: string;
  status?: WorkboardStatus;
  url?: string;
}

const TASK_KEY_RE = /\b([A-Z][A-Za-z0-9]{1,7}-\d{1,5})\b/;

export function extractVbotTaskKey(textOrUrl: string | undefined): string | null {
  if (!textOrUrl) return null;
  const m = TASK_KEY_RE.exec(textOrUrl.trim());
  return m?.[1] ?? null;
}

export function createEmptyWorkboardState(): DevWorkboardState {
  return { tasks: [], updatedAt: 0 };
}

export function loadDevWorkboard(): DevWorkboardState {
  if (typeof window === 'undefined' || !window.localStorage) {
    return createEmptyWorkboardState();
  }
  try {
    const raw = window.localStorage.getItem(DEV_WORKBOARD_STORAGE_KEY);
    if (!raw) return createEmptyWorkboardState();
    const parsed = DevWorkboardStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : createEmptyWorkboardState();
  } catch {
    return createEmptyWorkboardState();
  }
}

export function saveDevWorkboard(state: DevWorkboardState): DevWorkboardState {
  const next: DevWorkboardState = {
    tasks: state.tasks,
    updatedAt: Date.now(),
  };
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(DEV_WORKBOARD_STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

export function upsertWorkboardTask(
  input: Omit<DevWorkboardTask, 'id' | 'createdAt' | 'updatedAt'> & {
    id?: string;
    createdAt?: string;
  },
): DevWorkboardState {
  const current = loadDevWorkboard();
  const now = new Date().toISOString();
  const derivedKey =
    input.key?.trim() ||
    extractVbotTaskKey(input.url) ||
    extractVbotTaskKey(input.title) ||
    undefined;

  const taskId = input.id?.trim() || `wb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const existingIdx = current.tasks.findIndex((t) => t.id === taskId);

  const normalized: DevWorkboardTask = {
    id: taskId,
    ...(derivedKey ? { key: derivedKey } : {}),
    title: input.title.trim(),
    ...(input.url?.trim() ? { url: input.url.trim() } : {}),
    status: input.status,
    platform: input.platform,
    priority: input.priority,
    ...(input.nodeId?.trim() ? { nodeId: input.nodeId.trim() } : {}),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    createdAt:
      existingIdx >= 0
        ? current.tasks[existingIdx]!.createdAt || now
        : input.createdAt || now,
    updatedAt: now,
  };

  const tasks =
    existingIdx >= 0
      ? current.tasks.map((t, idx) => (idx === existingIdx ? normalized : t))
      : [normalized, ...current.tasks];

  return saveDevWorkboard({ tasks, updatedAt: Date.now() });
}

export function updateWorkboardTaskStatus(
  taskId: string,
  status: WorkboardStatus,
): DevWorkboardState {
  const current = loadDevWorkboard();
  const now = new Date().toISOString();
  const tasks = current.tasks.map((t) =>
    t.id === taskId ? { ...t, status, updatedAt: now } : t,
  );
  return saveDevWorkboard({ tasks, updatedAt: Date.now() });
}

export function deleteWorkboardTask(taskId: string): DevWorkboardState {
  const current = loadDevWorkboard();
  const tasks = current.tasks.filter((t) => t.id !== taskId);
  return saveDevWorkboard({ tasks, updatedAt: Date.now() });
}

function collectAllNodes(dataset: MergedFlowDataset): FlowNodeData[] {
  const out: FlowNodeData[] = [dataset.rootNode, ...dataset.branches];
  const seen = new Set<string>(out.map((n) => n.id));
  for (const sub of Object.values(dataset.subtreesByParentId)) {
    for (const node of sub.nodes) {
      if (!seen.has(node.id)) {
        seen.add(node.id);
        out.push(node);
      }
    }
  }
  return out;
}

/**
 * Gom badge Task (mã VbM-* hoặc "Task") cho từng node từ cả `meta.workTaskUrl` và `workboard`.
 */
export function collectNodeTaskBadges(
  dataset: MergedFlowDataset,
  workboard: Pick<DevWorkboardState, 'tasks'>,
): Record<string, NodeTaskBadgeInfo> {
  const map: Record<string, NodeTaskBadgeInfo> = {};

  for (const node of collectAllNodes(dataset)) {
    const url = node.meta?.workTaskUrl?.trim();
    if (!url) continue;
    const key = extractVbotTaskKey(url);
    map[node.id] = {
      label: key ?? 'Task',
      url,
    };
  }

  // Ưu tiên task trên Workboard cá nhân nếu gắn vào node (sắp xếp task chưa Done lên trước)
  const sortedTasks = [...workboard.tasks].sort((a, b) => {
    const aDone = a.status === 'done' ? 1 : 0;
    const bDone = b.status === 'done' ? 1 : 0;
    return aDone - bDone;
  });

  for (const task of sortedTasks) {
    if (!task.nodeId) continue;
    const existing = map[task.nodeId];
    if (existing && existing.status && existing.status !== 'done') continue;
    const label =
      task.key?.trim() ||
      extractVbotTaskKey(task.url) ||
      extractVbotTaskKey(task.title) ||
      existing?.label ||
      'Task';
    map[task.nodeId] = {
      label,
      status: task.status,
      url: task.url ?? existing?.url,
    };
  }

  return map;
}
