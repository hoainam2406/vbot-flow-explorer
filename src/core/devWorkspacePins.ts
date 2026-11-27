// src/core/devWorkspacePins.ts
import { z } from 'zod';

export const DEV_PINS_STORAGE_KEY = 'vbot-flow:dev-pins:v1';

export const DevWorkspacePinsStateSchema = z.object({
  pinnedNodeIds: z.array(z.string()).default([]),
  notesByNodeId: z.record(z.string(), z.string()).default({}),
  updatedAt: z.number().default(0),
});

export type DevWorkspacePinsState = z.infer<typeof DevWorkspacePinsStateSchema>;

export function createEmptyPinsState(): DevWorkspacePinsState {
  return {
    pinnedNodeIds: [],
    notesByNodeId: {},
    updatedAt: 0,
  };
}

export function loadDevWorkspacePins(): DevWorkspacePinsState {
  if (typeof window === 'undefined' || !window.localStorage) {
    return createEmptyPinsState();
  }
  try {
    const raw = window.localStorage.getItem(DEV_PINS_STORAGE_KEY);
    if (!raw) return createEmptyPinsState();
    const parsed = DevWorkspacePinsStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : createEmptyPinsState();
  } catch {
    return createEmptyPinsState();
  }
}

export function saveDevWorkspacePins(state: DevWorkspacePinsState): DevWorkspacePinsState {
  const next: DevWorkspacePinsState = {
    pinnedNodeIds: [...new Set(state.pinnedNodeIds.map((id) => id.trim()).filter(Boolean))].slice(0, 20),
    notesByNodeId: state.notesByNodeId,
    updatedAt: Date.now(),
  };
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(DEV_PINS_STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

export function togglePinNode(nodeId: string): DevWorkspacePinsState {
  const current = loadDevWorkspacePins();
  const exists = current.pinnedNodeIds.includes(nodeId);
  const pinnedNodeIds = exists
    ? current.pinnedNodeIds.filter((id) => id !== nodeId)
    : [nodeId, ...current.pinnedNodeIds];
  return saveDevWorkspacePins({ ...current, pinnedNodeIds });
}

export function setNodeDevNote(nodeId: string, note: string): DevWorkspacePinsState {
  const current = loadDevWorkspacePins();
  const notesByNodeId = { ...current.notesByNodeId };
  if (!note.trim()) {
    delete notesByNodeId[nodeId];
  } else {
    notesByNodeId[nodeId] = note;
  }
  return saveDevWorkspacePins({ ...current, notesByNodeId });
}

export function removeNodeDevNote(nodeId: string): DevWorkspacePinsState {
  return setNodeDevNote(nodeId, '');
}
