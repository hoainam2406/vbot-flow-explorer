// src/core/datasetDraftStore.ts
import { z } from 'zod';
import { findNodeById, getNodeDisplayLabel } from './graphEngine';
import {
  FlowEdgeDataSchema,
  FlowNodeDataSchema,
  type AppManifest,
  type FlowEdgeData,
  type FlowModuleFile,
  type FlowNodeData,
  type MergedFlowDataset,
  type SubtreeDefinition,
} from '../data/schema';
import { validateDataset } from '../data/validateDataset';

export const DRAFT_PATCHES_STORAGE_KEY = 'vbot-flow:draft-patches:v1';

export const DraftPatchSchema = z.discriminatedUnion('kind', [
  z.object({
    id: z.string().min(1),
    timestamp: z.number(),
    kind: z.literal('update_node'),
    nodeId: z.string().min(1),
    node: FlowNodeDataSchema,
  }),
  z.object({
    id: z.string().min(1),
    timestamp: z.number(),
    kind: z.literal('add_node'),
    parentId: z.string().min(1),
    node: FlowNodeDataSchema,
    connectFromNodeId: z.string().min(1).optional(),
    edgeLabel: z.string().optional(),
    subtreeTitle: z.string().min(1).optional(),
  }),
  z.object({
    id: z.string().min(1),
    timestamp: z.number(),
    kind: z.literal('delete_node'),
    nodeId: z.string().min(1),
  }),
  z.object({
    id: z.string().min(1),
    timestamp: z.number(),
    kind: z.literal('add_edge'),
    parentId: z.string().min(1),
    edge: FlowEdgeDataSchema,
  }),
  z.object({
    id: z.string().min(1),
    timestamp: z.number(),
    kind: z.literal('delete_edge'),
    parentId: z.string().min(1),
    edgeId: z.string().min(1),
  }),
]);

export type DraftPatch = z.infer<typeof DraftPatchSchema>;

function safeClone<T>(val: T): T {
  return JSON.parse(JSON.stringify(val)) as T;
}

export function loadDraftPatches(): DraftPatch[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(DRAFT_PATCHES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const valid: DraftPatch[] = [];
    for (const item of parsed) {
      const res = DraftPatchSchema.safeParse(item);
      if (res.success) valid.push(res.data);
    }
    return valid;
  } catch {
    return [];
  }
}

export function saveDraftPatches(patches: readonly DraftPatch[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  if (patches.length === 0) {
    window.localStorage.removeItem(DRAFT_PATCHES_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(DRAFT_PATCHES_STORAGE_KEY, JSON.stringify(patches));
}

export function clearDraftPatches(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.removeItem(DRAFT_PATCHES_STORAGE_KEY);
}

function collectCascadeNodeIds(
  subtrees: Record<string, SubtreeDefinition>,
  startNodeId: string,
): Set<string> {
  const deleted = new Set<string>([startNodeId]);
  const queue = [startNodeId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const sub = subtrees[cur];
    if (!sub) continue;
    for (const child of sub.nodes) {
      if (!deleted.has(child.id)) {
        deleted.add(child.id);
        queue.push(child.id);
      }
    }
  }
  return deleted;
}

function cleanupSubtreesAfterDelete(
  subtrees: Record<string, SubtreeDefinition>,
  deletedIds: Set<string>,
): boolean {
  let mutated = false;
  for (const parentId of Object.keys(subtrees)) {
    if (deletedIds.has(parentId)) {
      delete subtrees[parentId];
      mutated = true;
      continue;
    }
    const sub = subtrees[parentId];
    const beforeNodes = sub.nodes.length;
    sub.nodes = sub.nodes.filter((n) => !deletedIds.has(n.id));
    if (sub.nodes.length !== beforeNodes) mutated = true;

    if (sub.nodes.length === 0) {
      delete subtrees[parentId];
      mutated = true;
      continue;
    }

    const removedEdgeIds = new Set<string>();
    const nextEdges: FlowEdgeData[] = [];
    for (const e of sub.edges) {
      if (deletedIds.has(e.source) || deletedIds.has(e.target)) {
        removedEdgeIds.add(e.id);
        mutated = true;
      } else {
        nextEdges.push(e);
      }
    }
    sub.edges = nextEdges;

    sub.entryNodeIds = sub.entryNodeIds.filter((id) => !deletedIds.has(id));
    if (sub.entryNodeIds.length === 0 && sub.nodes.length > 0) {
      sub.entryNodeIds = [sub.nodes[0].id];
    }

    if (sub.scenarios) {
      sub.scenarios = sub.scenarios.map((sc) => ({
        ...sc,
        nodeIds: sc.nodeIds.filter((id) => !deletedIds.has(id)),
        edgeIds: sc.edgeIds.filter((eid) => !removedEdgeIds.has(eid)),
      }));
    }

    for (const n of sub.nodes) {
      if (n.relatedNodeIds?.some((id) => deletedIds.has(id))) {
        n.relatedNodeIds = n.relatedNodeIds.filter((id) => !deletedIds.has(id));
        if (n.relatedNodeIds.length === 0) delete n.relatedNodeIds;
        mutated = true;
      }
    }
  }
  return mutated;
}

function cleanupNodeRelatedIds(nodes: FlowNodeData[], deletedIds: Set<string>): boolean {
  let mutated = false;
  for (const n of nodes) {
    if (n.relatedNodeIds?.some((id) => deletedIds.has(id))) {
      n.relatedNodeIds = n.relatedNodeIds.filter((id) => !deletedIds.has(id));
      if (n.relatedNodeIds.length === 0) delete n.relatedNodeIds;
      mutated = true;
    }
  }
  return mutated;
}

export function applyDraftPatchesToDataset(
  base: MergedFlowDataset,
  patches: readonly DraftPatch[],
): { dataset: MergedFlowDataset; errors: string[] } {
  const next = safeClone(base);
  const errors: string[] = [];

  for (const patch of patches) {
    if (patch.kind === 'update_node') {
      const parsed = FlowNodeDataSchema.safeParse(patch.node);
      if (!parsed.success) {
        errors.push(`Node "${patch.nodeId}" không hợp lệ: ${parsed.error.message}`);
        continue;
      }
      const updatedNode: FlowNodeData = { ...parsed.data, id: patch.nodeId };
      if (next.rootNode.id === patch.nodeId) {
        next.rootNode = updatedNode;
        continue;
      }
      const branchIdx = next.branches.findIndex((b) => b.id === patch.nodeId);
      if (branchIdx >= 0) {
        next.branches[branchIdx] = updatedNode;
        continue;
      }
      let replaced = false;
      for (const sub of Object.values(next.subtreesByParentId)) {
        const idx = sub.nodes.findIndex((n) => n.id === patch.nodeId);
        if (idx >= 0) {
          sub.nodes[idx] = updatedNode;
          replaced = true;
          break;
        }
      }
      if (!replaced) {
        errors.push(`Không tìm thấy node "${patch.nodeId}" để cập nhật.`);
      }
    } else if (patch.kind === 'add_node') {
      const parsed = FlowNodeDataSchema.safeParse(patch.node);
      if (!parsed.success) {
        errors.push(`Node mới "${patch.node.id}" không hợp lệ: ${parsed.error.message}`);
        continue;
      }
      if (findNodeById(next, parsed.data.id)) {
        errors.push(`ID node "${parsed.data.id}" đã tồn tại.`);
        continue;
      }
      const parentNode = findNodeById(next, patch.parentId);
      if (!parentNode) {
        errors.push(`Node cha "${patch.parentId}" không tồn tại.`);
        continue;
      }

      if (patch.parentId === next.rootNode.id) {
        next.branches.push(parsed.data);
        next.branchEdges.push({
          id: `e-${next.rootNode.id}-${parsed.data.id}`,
          source: next.rootNode.id,
          target: parsed.data.id,
          ...(patch.edgeLabel ? { label: patch.edgeLabel } : {}),
        });
        continue;
      }

      let sub = next.subtreesByParentId[patch.parentId];
      if (!sub) {
        sub = {
          title: patch.subtreeTitle || getNodeDisplayLabel(parentNode, 'overview'),
          layoutHint: 'flow',
          direction: 'LR',
          entryNodeIds: [],
          nodes: [],
          edges: [],
        };
        next.subtreesByParentId[patch.parentId] = sub;
      }
      sub.nodes.push(parsed.data);
      const fromInSubtree =
        patch.connectFromNodeId && sub.nodes.some((n) => n.id === patch.connectFromNodeId);
      if (fromInSubtree && patch.connectFromNodeId !== parsed.data.id) {
        sub.edges.push({
          id: `e-${patch.connectFromNodeId}-${parsed.data.id}`,
          source: patch.connectFromNodeId!,
          target: parsed.data.id,
          ...(patch.edgeLabel ? { label: patch.edgeLabel } : {}),
        });
      } else {
        sub.entryNodeIds.push(parsed.data.id);
      }
    } else if (patch.kind === 'delete_node') {
      if (patch.nodeId === next.rootNode.id) {
        errors.push('Không thể xóa node gốc của ứng dụng.');
        continue;
      }
      const deletedIds = collectCascadeNodeIds(next.subtreesByParentId, patch.nodeId);
      next.branches = next.branches.filter((b) => !deletedIds.has(b.id));
      next.branchEdges = next.branchEdges.filter(
        (e) => !deletedIds.has(e.source) && !deletedIds.has(e.target),
      );
      cleanupNodeRelatedIds([next.rootNode, ...next.branches], deletedIds);
      cleanupSubtreesAfterDelete(next.subtreesByParentId, deletedIds);
    } else if (patch.kind === 'add_edge') {
      const parsedEdge = FlowEdgeDataSchema.safeParse(patch.edge);
      if (!parsedEdge.success) {
        errors.push(`Cạnh "${patch.edge.id}" không hợp lệ.`);
        continue;
      }
      if (patch.parentId === next.rootNode.id) {
        next.branchEdges.push(parsedEdge.data);
      } else {
        const sub = next.subtreesByParentId[patch.parentId];
        if (!sub) {
          errors.push(`Không tìm thấy subtree "${patch.parentId}" để thêm cạnh.`);
          continue;
        }
        sub.edges.push(parsedEdge.data);
      }
    } else if (patch.kind === 'delete_edge') {
      if (patch.parentId === next.rootNode.id) {
        next.branchEdges = next.branchEdges.filter((e) => e.id !== patch.edgeId);
      } else {
        const sub = next.subtreesByParentId[patch.parentId];
        if (sub) {
          sub.edges = sub.edges.filter((e) => e.id !== patch.edgeId);
        }
      }
    }
  }

  return { dataset: next, errors };
}

export function applyDraftPatchesToRawFiles(
  rawManifest: AppManifest,
  rawModulesByFile: Record<string, FlowModuleFile>,
  patches: readonly DraftPatch[],
): {
  manifest: AppManifest;
  modulesByFile: Record<string, FlowModuleFile>;
  changedFiles: string[];
  errors: string[];
} {
  const manifest = safeClone(rawManifest);
  const modulesByFile = safeClone(rawModulesByFile);
  const changed = new Set<string>();
  const errors: string[] = [];

  const getAllSubtrees = (): Record<string, SubtreeDefinition> => {
    const merged: Record<string, SubtreeDefinition> = {
      ...(manifest.inlineSubtrees ?? {}),
    };
    for (const mod of Object.values(modulesByFile)) {
      Object.assign(merged, mod.subtrees);
    }
    return merged;
  };

  const findModuleFileOwningNode = (nodeId: string): string | null => {
    for (const [fileName, mod] of Object.entries(modulesByFile)) {
      if (mod.moduleId === nodeId) return fileName;
      for (const sub of Object.values(mod.subtrees)) {
        if (sub.nodes.some((n) => n.id === nodeId)) {
          return fileName;
        }
      }
    }
    return null;
  };

  for (const patch of patches) {
    if (patch.kind === 'update_node') {
      const updated: FlowNodeData = { ...patch.node, id: patch.nodeId };
      if (manifest.rootNode.id === patch.nodeId) {
        manifest.rootNode = updated;
        changed.add('app.json');
        continue;
      }
      const bIdx = manifest.branches.findIndex((b) => b.id === patch.nodeId);
      if (bIdx >= 0) {
        manifest.branches[bIdx] = updated;
        changed.add('app.json');
        continue;
      }
      let done = false;
      for (const sub of Object.values(manifest.inlineSubtrees ?? {})) {
        const idx = sub.nodes.findIndex((n) => n.id === patch.nodeId);
        if (idx >= 0) {
          sub.nodes[idx] = updated;
          changed.add('app.json');
          done = true;
          break;
        }
      }
      if (done) continue;

      for (const [fileName, mod] of Object.entries(modulesByFile)) {
        for (const sub of Object.values(mod.subtrees)) {
          const idx = sub.nodes.findIndex((n) => n.id === patch.nodeId);
          if (idx >= 0) {
            sub.nodes[idx] = updated;
            changed.add(`modules/${fileName}.json`);
            done = true;
            break;
          }
        }
        if (done) break;
      }
      if (!done) {
        errors.push(`Không tìm thấy node "${patch.nodeId}" trong dữ liệu gốc.`);
      }
    } else if (patch.kind === 'add_node') {
      if (patch.parentId === manifest.rootNode.id) {
        manifest.branches.push(patch.node);
        manifest.branchEdges.push({
          id: `e-${manifest.rootNode.id}-${patch.node.id}`,
          source: manifest.rootNode.id,
          target: patch.node.id,
          ...(patch.edgeLabel ? { label: patch.edgeLabel } : {}),
        });
        changed.add('app.json');
        continue;
      }

      // Check existing subtree in inlineSubtrees or modules
      let targetSubtree: SubtreeDefinition | undefined =
        manifest.inlineSubtrees?.[patch.parentId];
      let targetFile = targetSubtree ? 'app.json' : '';

      if (!targetSubtree) {
        for (const [fileName, mod] of Object.entries(modulesByFile)) {
          if (mod.subtrees[patch.parentId]) {
            targetSubtree = mod.subtrees[patch.parentId];
            targetFile = `modules/${fileName}.json`;
            break;
          }
        }
      }

      if (!targetSubtree) {
        const ownerFile = findModuleFileOwningNode(patch.parentId);
        const newSub: SubtreeDefinition = {
          title: patch.subtreeTitle || patch.node.label,
          layoutHint: 'flow',
          direction: 'LR',
          entryNodeIds: [],
          nodes: [],
          edges: [],
        };
        if (ownerFile && modulesByFile[ownerFile]) {
          modulesByFile[ownerFile].subtrees[patch.parentId] = newSub;
          targetSubtree = newSub;
          targetFile = `modules/${ownerFile}.json`;
        } else {
          manifest.inlineSubtrees = manifest.inlineSubtrees ?? {};
          manifest.inlineSubtrees[patch.parentId] = newSub;
          targetSubtree = newSub;
          targetFile = 'app.json';
        }
      }

      targetSubtree.nodes.push(patch.node);
      const hasSource =
        patch.connectFromNodeId &&
        targetSubtree.nodes.some((n) => n.id === patch.connectFromNodeId);
      if (hasSource && patch.connectFromNodeId !== patch.node.id) {
        targetSubtree.edges.push({
          id: `e-${patch.connectFromNodeId}-${patch.node.id}`,
          source: patch.connectFromNodeId!,
          target: patch.node.id,
          ...(patch.edgeLabel ? { label: patch.edgeLabel } : {}),
        });
      } else {
        targetSubtree.entryNodeIds.push(patch.node.id);
      }
      changed.add(targetFile);
    } else if (patch.kind === 'delete_node') {
      if (patch.nodeId === manifest.rootNode.id) {
        errors.push('Không thể xóa node gốc của ứng dụng.');
        continue;
      }
      const deletedIds = collectCascadeNodeIds(getAllSubtrees(), patch.nodeId);
      const prevBranches = manifest.branches.length;
      const prevBranchEdges = manifest.branchEdges.length;
      manifest.branches = manifest.branches.filter((b) => !deletedIds.has(b.id));
      manifest.branchEdges = manifest.branchEdges.filter(
        (e) => !deletedIds.has(e.source) && !deletedIds.has(e.target),
      );
      if (
        manifest.branches.length !== prevBranches ||
        manifest.branchEdges.length !== prevBranchEdges ||
        cleanupNodeRelatedIds([manifest.rootNode, ...manifest.branches], deletedIds)
      ) {
        changed.add('app.json');
      }
      if (
        manifest.inlineSubtrees &&
        cleanupSubtreesAfterDelete(manifest.inlineSubtrees, deletedIds)
      ) {
        changed.add('app.json');
      }
      for (const [fileName, mod] of Object.entries(modulesByFile)) {
        if (cleanupSubtreesAfterDelete(mod.subtrees, deletedIds)) {
          changed.add(`modules/${fileName}.json`);
        }
      }
    } else if (patch.kind === 'add_edge') {
      if (patch.parentId === manifest.rootNode.id) {
        manifest.branchEdges.push(patch.edge);
        changed.add('app.json');
      } else if (manifest.inlineSubtrees?.[patch.parentId]) {
        manifest.inlineSubtrees[patch.parentId].edges.push(patch.edge);
        changed.add('app.json');
      } else {
        let added = false;
        for (const [fileName, mod] of Object.entries(modulesByFile)) {
          if (mod.subtrees[patch.parentId]) {
            mod.subtrees[patch.parentId].edges.push(patch.edge);
            changed.add(`modules/${fileName}.json`);
            added = true;
            break;
          }
        }
        if (!added) errors.push(`Không tìm thấy subtree "${patch.parentId}" để thêm cạnh.`);
      }
    } else if (patch.kind === 'delete_edge') {
      if (patch.parentId === manifest.rootNode.id) {
        manifest.branchEdges = manifest.branchEdges.filter((e) => e.id !== patch.edgeId);
        changed.add('app.json');
      } else if (manifest.inlineSubtrees?.[patch.parentId]) {
        manifest.inlineSubtrees[patch.parentId].edges = manifest.inlineSubtrees[
          patch.parentId
        ].edges.filter((e) => e.id !== patch.edgeId);
        changed.add('app.json');
      } else {
        for (const [fileName, mod] of Object.entries(modulesByFile)) {
          if (mod.subtrees[patch.parentId]) {
            mod.subtrees[patch.parentId].edges = mod.subtrees[patch.parentId].edges.filter(
              (e) => e.id !== patch.edgeId,
            );
            changed.add(`modules/${fileName}.json`);
            break;
          }
        }
      }
    }
  }

  const orderedModules = manifest.moduleFiles
    .map((name) => modulesByFile[name])
    .filter((m): m is FlowModuleFile => Boolean(m));
  const validationErrors = validateDataset(manifest, orderedModules);

  return {
    manifest,
    modulesByFile,
    changedFiles: [...changed],
    errors: [...errors, ...validationErrors],
  };
}

export function summarizeDraftPatch(patch: DraftPatch): string {
  switch (patch.kind) {
    case 'update_node':
      return `Sửa node "${patch.node.label}" (${patch.nodeId})`;
    case 'add_node':
      return `Thêm "${patch.node.label}" (${patch.node.id}) vào "${patch.parentId}"`;
    case 'delete_node':
      return `Xóa node "${patch.nodeId}"`;
    case 'add_edge':
      return `Nối cạnh ${patch.edge.source} → ${patch.edge.target}`;
    case 'delete_edge':
      return `Xóa cạnh ${patch.edgeId}`;
  }
}
