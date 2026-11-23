// src/core/datasetDraftStore.ts
import { z } from 'zod';
import { findNodeById, getNodeDisplayLabel } from './graphEngine';
import {
  FlowEdgeDataSchema,
  FlowNodeDataSchema,
  ScenarioSchema,
  type AppManifest,
  type FlowEdgeData,
  type FlowModuleFile,
  type FlowNodeData,
  type MergedFlowDataset,
  type Scenario,
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
  z.object({
    id: z.string().min(1),
    timestamp: z.number(),
    kind: z.literal('update_edge'),
    parentId: z.string().min(1),
    edgeId: z.string().min(1),
    edge: FlowEdgeDataSchema,
  }),
  z.object({
    id: z.string().min(1),
    timestamp: z.number(),
    kind: z.literal('upsert_scenario'),
    parentId: z.string().min(1),
    scenario: ScenarioSchema,
  }),
  z.object({
    id: z.string().min(1),
    timestamp: z.number(),
    kind: z.literal('delete_scenario'),
    parentId: z.string().min(1),
    scenarioId: z.string().min(1),
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
    } else if (patch.kind === 'update_edge') {
      const parsedEdge = FlowEdgeDataSchema.safeParse(patch.edge);
      if (!parsedEdge.success) {
        errors.push(`Cạnh "${patch.edgeId}" không hợp lệ.`);
        continue;
      }
      const nextEdge: FlowEdgeData = { ...parsedEdge.data, id: patch.edgeId };
      if (patch.parentId === next.rootNode.id) {
        const idx = next.branchEdges.findIndex((e) => e.id === patch.edgeId);
        if (idx >= 0) next.branchEdges[idx] = nextEdge;
        else errors.push(`Không tìm thấy cạnh "${patch.edgeId}" ở gốc.`);
      } else {
        const sub = next.subtreesByParentId[patch.parentId];
        const idx = sub ? sub.edges.findIndex((e) => e.id === patch.edgeId) : -1;
        if (sub && idx >= 0) sub.edges[idx] = nextEdge;
        else errors.push(`Không tìm thấy cạnh "${patch.edgeId}" trong "${patch.parentId}".`);
      }
    } else if (patch.kind === 'upsert_scenario') {
      const parsedSc = ScenarioSchema.safeParse(patch.scenario);
      if (!parsedSc.success) {
        errors.push(`Kịch bản "${patch.scenario.id}" không hợp lệ: ${parsedSc.error.message}`);
        continue;
      }
      const sub = next.subtreesByParentId[patch.parentId];
      if (!sub) {
        errors.push(`Không tìm thấy subtree "${patch.parentId}" để lưu kịch bản.`);
        continue;
      }
      sub.scenarios = sub.scenarios ?? [];
      const idx = sub.scenarios.findIndex((s) => s.id === parsedSc.data.id);
      if (idx >= 0) sub.scenarios[idx] = parsedSc.data;
      else sub.scenarios.push(parsedSc.data);
    } else if (patch.kind === 'delete_scenario') {
      const sub = next.subtreesByParentId[patch.parentId];
      if (sub?.scenarios) {
        sub.scenarios = sub.scenarios.filter((s) => s.id !== patch.scenarioId);
        if (sub.scenarios.length === 0) delete sub.scenarios;
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
    } else if (patch.kind === 'update_edge') {
      const nextEdge: FlowEdgeData = { ...patch.edge, id: patch.edgeId };
      if (patch.parentId === manifest.rootNode.id) {
        const idx = manifest.branchEdges.findIndex((e) => e.id === patch.edgeId);
        if (idx >= 0) {
          manifest.branchEdges[idx] = nextEdge;
          changed.add('app.json');
        } else {
          errors.push(`Không tìm thấy cạnh "${patch.edgeId}" trong app.json.`);
        }
      } else if (manifest.inlineSubtrees?.[patch.parentId]) {
        const idx = manifest.inlineSubtrees[patch.parentId].edges.findIndex(
          (e) => e.id === patch.edgeId,
        );
        if (idx >= 0) {
          manifest.inlineSubtrees[patch.parentId].edges[idx] = nextEdge;
          changed.add('app.json');
        } else {
          errors.push(`Không tìm thấy cạnh "${patch.edgeId}" trong "${patch.parentId}".`);
        }
      } else {
        let updated = false;
        for (const [fileName, mod] of Object.entries(modulesByFile)) {
          const sub = mod.subtrees[patch.parentId];
          if (sub) {
            const idx = sub.edges.findIndex((e) => e.id === patch.edgeId);
            if (idx >= 0) {
              sub.edges[idx] = nextEdge;
              changed.add(`modules/${fileName}.json`);
              updated = true;
            }
            break;
          }
        }
        if (!updated) errors.push(`Không tìm thấy cạnh "${patch.edgeId}" trong "${patch.parentId}".`);
      }
    } else if (patch.kind === 'upsert_scenario') {
      if (manifest.inlineSubtrees?.[patch.parentId]) {
        const sub = manifest.inlineSubtrees[patch.parentId];
        sub.scenarios = sub.scenarios ?? [];
        const idx = sub.scenarios.findIndex((s) => s.id === patch.scenario.id);
        if (idx >= 0) sub.scenarios[idx] = patch.scenario;
        else sub.scenarios.push(patch.scenario);
        changed.add('app.json');
      } else {
        let saved = false;
        for (const [fileName, mod] of Object.entries(modulesByFile)) {
          const sub = mod.subtrees[patch.parentId];
          if (sub) {
            sub.scenarios = sub.scenarios ?? [];
            const idx = sub.scenarios.findIndex((s) => s.id === patch.scenario.id);
            if (idx >= 0) sub.scenarios[idx] = patch.scenario;
            else sub.scenarios.push(patch.scenario);
            changed.add(`modules/${fileName}.json`);
            saved = true;
            break;
          }
        }
        if (!saved) errors.push(`Không tìm thấy subtree "${patch.parentId}" để lưu kịch bản.`);
      }
    } else if (patch.kind === 'delete_scenario') {
      if (manifest.inlineSubtrees?.[patch.parentId]?.scenarios) {
        const sub = manifest.inlineSubtrees[patch.parentId];
        sub.scenarios = sub.scenarios!.filter((s) => s.id !== patch.scenarioId);
        if (sub.scenarios.length === 0) delete sub.scenarios;
        changed.add('app.json');
      } else {
        for (const [fileName, mod] of Object.entries(modulesByFile)) {
          const sub = mod.subtrees[patch.parentId];
          if (sub?.scenarios) {
            sub.scenarios = sub.scenarios.filter((s) => s.id !== patch.scenarioId);
            if (sub.scenarios.length === 0) delete sub.scenarios;
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
    case 'update_edge':
      return `Sửa cạnh ${patch.edge.source} → ${patch.edge.target}`;
    case 'upsert_scenario':
      return `Lưu kịch bản "${patch.scenario.name}" (${patch.scenario.id})`;
    case 'delete_scenario':
      return `Xóa kịch bản "${patch.scenarioId}"`;
  }
}

export const MAX_IMPORT_PATCH_BYTES = 5 * 1024 * 1024;

export function parseImportedPatchesJson(
  raw: string,
): { ok: true; patches: DraftPatch[] } | { ok: false; error: string } {
  if (raw.length > MAX_IMPORT_PATCH_BYTES) {
    return { ok: false, error: 'File Patch JSON vượt quá giới hạn 5MB.' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi cú pháp JSON: ${err instanceof Error ? err.message : 'không đọc được'}`,
    };
  }
  const listCandidate = Array.isArray(parsed)
    ? parsed
    : (parsed as { patches?: unknown } | null)?.patches;
  if (!Array.isArray(listCandidate) || listCandidate.length === 0) {
    return { ok: false, error: 'File không chứa mảng patches hợp lệ.' };
  }
  const out: DraftPatch[] = [];
  for (let i = 0; i < listCandidate.length; i += 1) {
    const res = DraftPatchSchema.safeParse(listCandidate[i]);
    if (!res.success) {
      return {
        ok: false,
        error: `Patch thứ ${i + 1} không hợp lệ: ${res.error.issues[0]?.message ?? 'sai schema'}`,
      };
    }
    out.push(res.data);
  }
  return { ok: true, patches: out };
}

export interface DraftDiffItem {
  kind: 'node' | 'edge' | 'scenario';
  change: 'added' | 'modified' | 'removed';
  id: string;
  label: string;
  changedFields: string[];
}

export interface DraftDiffSummary {
  nodesAdded: number;
  nodesModified: number;
  nodesRemoved: number;
  edgesChanged: number;
  scenariosChanged: number;
  items: DraftDiffItem[];
}

function flattenNodes(dataset: MergedFlowDataset): Map<string, FlowNodeData> {
  const map = new Map<string, FlowNodeData>();
  map.set(dataset.rootNode.id, dataset.rootNode);
  for (const b of dataset.branches) map.set(b.id, b);
  for (const sub of Object.values(dataset.subtreesByParentId)) {
    for (const n of sub.nodes) map.set(n.id, n);
  }
  return map;
}

function flattenEdges(dataset: MergedFlowDataset): Map<string, FlowEdgeData> {
  const map = new Map<string, FlowEdgeData>();
  for (const e of dataset.branchEdges) map.set(e.id, e);
  for (const sub of Object.values(dataset.subtreesByParentId)) {
    for (const e of sub.edges) map.set(e.id, e);
  }
  return map;
}

function flattenScenarios(dataset: MergedFlowDataset): Map<string, Scenario> {
  const map = new Map<string, Scenario>();
  for (const sub of Object.values(dataset.subtreesByParentId)) {
    for (const s of sub.scenarios ?? []) map.set(s.id, s);
  }
  return map;
}

function diffNodeFields(a: FlowNodeData, b: FlowNodeData): string[] {
  const fields: string[] = [];
  const check = (name: string, va: unknown, vb: unknown) => {
    if (JSON.stringify(va) !== JSON.stringify(vb)) fields.push(name);
  };
  check('label', a.label, b.label);
  check('techLabel', a.techLabel, b.techLabel);
  check('kind', a.kind, b.kind);
  check('audience', a.audience, b.audience);
  check('platforms', a.platforms, b.platforms);
  check('summary', a.summary, b.summary);
  check('meta', a.meta, b.meta);
  check('techDetail.parityAssessment', a.techDetail?.parityAssessment, b.techDetail?.parityAssessment);
  check('techDetail.platformDiffNote', a.techDetail?.platformDiffNote, b.techDetail?.platformDiffNote);
  check('techDetail.miniAppBridge', a.techDetail?.miniAppBridge, b.techDetail?.miniAppBridge);
  check('techDetail.codeRefs', a.techDetail?.codeRefs, b.techDetail?.codeRefs);
  check('techDetail.byPlatform', a.techDetail?.byPlatform, b.techDetail?.byPlatform);
  check('techDetail.apisOrEvents', a.techDetail?.apisOrEvents, b.techDetail?.apisOrEvents);
  check('techDetail.edgeCases', a.techDetail?.edgeCases, b.techDetail?.edgeCases);
  check('relatedNodeIds', a.relatedNodeIds, b.relatedNodeIds);
  check('media', a.media, b.media);
  return fields;
}

export function buildDraftDiffSummary(
  base: MergedFlowDataset,
  patched: MergedFlowDataset,
): DraftDiffSummary {
  const items: DraftDiffItem[] = [];
  const baseNodes = flattenNodes(base);
  const nextNodes = flattenNodes(patched);

  for (const [id, n] of nextNodes.entries()) {
    const prev = baseNodes.get(id);
    if (!prev) {
      items.push({ kind: 'node', change: 'added', id, label: n.label, changedFields: [] });
    } else if (JSON.stringify(prev) !== JSON.stringify(n)) {
      items.push({
        kind: 'node',
        change: 'modified',
        id,
        label: n.label,
        changedFields: diffNodeFields(prev, n),
      });
    }
  }
  for (const [id, prev] of baseNodes.entries()) {
    if (!nextNodes.has(id)) {
      items.push({ kind: 'node', change: 'removed', id, label: prev.label, changedFields: [] });
    }
  }

  let edgesChanged = 0;
  const baseEdges = flattenEdges(base);
  const nextEdges = flattenEdges(patched);
  for (const [id, e] of nextEdges.entries()) {
    const prev = baseEdges.get(id);
    if (!prev) {
      edgesChanged += 1;
      items.push({
        kind: 'edge',
        change: 'added',
        id,
        label: `${e.source} → ${e.target}`,
        changedFields: [],
      });
    } else if (JSON.stringify(prev) !== JSON.stringify(e)) {
      edgesChanged += 1;
      items.push({
        kind: 'edge',
        change: 'modified',
        id,
        label: `${e.source} → ${e.target}`,
        changedFields: ['label/properties'],
      });
    }
  }
  for (const [id, prev] of baseEdges.entries()) {
    if (!nextEdges.has(id)) {
      edgesChanged += 1;
      items.push({
        kind: 'edge',
        change: 'removed',
        id,
        label: `${prev.source} → ${prev.target}`,
        changedFields: [],
      });
    }
  }

  let scenariosChanged = 0;
  const baseSc = flattenScenarios(base);
  const nextSc = flattenScenarios(patched);
  for (const [id, s] of nextSc.entries()) {
    const prev = baseSc.get(id);
    if (!prev) {
      scenariosChanged += 1;
      items.push({ kind: 'scenario', change: 'added', id, label: s.name, changedFields: [] });
    } else if (JSON.stringify(prev) !== JSON.stringify(s)) {
      scenariosChanged += 1;
      items.push({
        kind: 'scenario',
        change: 'modified',
        id,
        label: s.name,
        changedFields: ['steps/metadata'],
      });
    }
  }
  for (const [id, prev] of baseSc.entries()) {
    if (!nextSc.has(id)) {
      scenariosChanged += 1;
      items.push({ kind: 'scenario', change: 'removed', id, label: prev.name, changedFields: [] });
    }
  }

  return {
    nodesAdded: items.filter((i) => i.kind === 'node' && i.change === 'added').length,
    nodesModified: items.filter((i) => i.kind === 'node' && i.change === 'modified').length,
    nodesRemoved: items.filter((i) => i.kind === 'node' && i.change === 'removed').length,
    edgesChanged,
    scenariosChanged,
    items,
  };
}
