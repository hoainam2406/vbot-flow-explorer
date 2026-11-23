// src/core/graphEngine.ts
import type {
  AppManifest,
  FlowEdgeData,
  FlowModuleFile,
  FlowNodeData,
  MergedFlowDataset,
  Platform,
  PlatformViewMode,
  SubtreeDefinition,
} from '../data/schema';

export type ViewMode = 'overview' | 'tech';

const ALLOW_TECH_RUNTIME =
  typeof __ENABLE_TECH_MODE__ === 'boolean' ? __ENABLE_TECH_MODE__ : true;

export function getNodeDisplayLabel(node: FlowNodeData, mode: ViewMode): string {
  return ALLOW_TECH_RUNTIME && mode === 'tech' && node.techLabel ? node.techLabel : node.label;
}

export function getEdgeDisplayLabel(edge: FlowEdgeData, mode: ViewMode): string | undefined {
  return ALLOW_TECH_RUNTIME && mode === 'tech' ? (edge.techLabel ?? edge.label) : edge.label;
}

function resolveEdgeForMode(edge: FlowEdgeData, mode: ViewMode): FlowEdgeData {
  if (!ALLOW_TECH_RUNTIME) {
    return edge;
  }
  const { techLabel: _techLabel, label: _label, ...rest } = edge;
  const resolvedLabel = getEdgeDisplayLabel(edge, mode);
  return {
    ...rest,
    ...(resolvedLabel ? { label: resolvedLabel } : {}),
  };
}

export function mergeDataset(
  manifest: AppManifest,
  modules: FlowModuleFile[],
): MergedFlowDataset {
  const subtreesByParentId: Record<string, SubtreeDefinition> = {
    ...(manifest.inlineSubtrees ?? {}),
  };
  for (const mod of modules) {
    Object.assign(subtreesByParentId, mod.subtrees);
  }
  return {
    app: manifest.app,
    rootNode: manifest.rootNode,
    branches: manifest.branches,
    branchEdges: manifest.branchEdges,
    subtreesByParentId,
  };
}

export function isVisibleForMode(audience: 'all' | 'tech' | undefined, mode: ViewMode): boolean {
  return mode === 'tech' || (audience ?? 'all') === 'all';
}

export function isVisibleForPlatform(
  platforms: Platform[] | undefined,
  mode: ViewMode,
  platformMode: PlatformViewMode = 'compare',
): boolean {
  if (mode === 'overview' || platformMode === 'compare') return true;
  return !platforms || platforms.includes(platformMode);
}

export function filterAndBridgeSubtree(
  subtree: SubtreeDefinition,
  mode: ViewMode,
  platformMode: PlatformViewMode = 'compare',
): SubtreeDefinition {
  if (mode === 'tech' && platformMode === 'compare') {
    return {
      ...subtree,
      edges: subtree.edges.map((edge) => resolveEdgeForMode(edge, mode)),
    };
  }

  const isNodeVisible = (n: FlowNodeData) =>
    isVisibleForMode(n.audience, mode) && isVisibleForPlatform(n.platforms, mode, platformMode);

  const visibleIds = new Set(subtree.nodes.filter(isNodeVisible).map((n) => n.id));
  const activeEdges = subtree.edges.filter(
    (e) =>
      isVisibleForMode(e.audience, mode) && isVisibleForPlatform(e.platforms, mode, platformMode),
  );

  const outgoing = new Map<string, FlowEdgeData[]>();
  for (const edge of activeEdges) {
    const list = outgoing.get(edge.source) ?? [];
    list.push(edge);
    outgoing.set(edge.source, list);
  }

  // BFS từ mỗi node visible đi xuyên qua các node bị ẩn để nối tắt tới node visible kế tiếp
  const collectVisibleTargets = (
    startId: string,
  ): { target: string; labels: string[]; viaEdgeIds: string[] }[] => {
    const results: { target: string; labels: string[]; viaEdgeIds: string[] }[] = [];
    const queue: { id: string; labels: string[]; viaEdgeIds: string[] }[] = [
      { id: startId, labels: [], viaEdgeIds: [] },
    ];
    const visitedHidden = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const edge of outgoing.get(current.id) ?? []) {
        const edgeLabel = getEdgeDisplayLabel(edge, mode);
        const nextLabels = edgeLabel ? [...current.labels, edgeLabel] : current.labels;
        const nextViaEdgeIds = [...current.viaEdgeIds, edge.id];
        if (visibleIds.has(edge.target)) {
          results.push({ target: edge.target, labels: nextLabels, viaEdgeIds: nextViaEdgeIds });
        } else if (!visitedHidden.has(edge.target)) {
          visitedHidden.add(edge.target);
          queue.push({ id: edge.target, labels: nextLabels, viaEdgeIds: nextViaEdgeIds });
        }
      }
    }
    return results;
  };

  const bridgedEntries: { edge: FlowEdgeData; viaEdgeIds: string[] }[] = [];
  const seenPairs = new Set<string>();

  for (const sourceId of visibleIds) {
    for (const hit of collectVisibleTargets(sourceId)) {
      if (hit.target === sourceId) continue;
      const pairKey = `${sourceId}->${hit.target}`;
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);
      const edgeId =
        hit.viaEdgeIds.length === 1 ? hit.viaEdgeIds[0] : `bridge-${sourceId}-${hit.target}`;
      bridgedEntries.push({
        viaEdgeIds: hit.viaEdgeIds,
        edge: {
          id: edgeId,
          source: sourceId,
          target: hit.target,
          ...(hit.labels[0] ? { label: hit.labels[0] } : {}),
          audience: mode === 'overview' ? 'all' : undefined,
        },
      });
    }
  }

  const bridgedEdges = bridgedEntries.map((entry) => entry.edge);

  // Nếu entryNodeId bị ẩn, dịch chuyển entry sang node visible kế tiếp
  const nextEntries: string[] = [];
  const entrySeen = new Set<string>();
  for (const entryId of subtree.entryNodeIds) {
    if (visibleIds.has(entryId)) {
      if (!entrySeen.has(entryId)) {
        entrySeen.add(entryId);
        nextEntries.push(entryId);
      }
    } else {
      for (const hit of collectVisibleTargets(entryId)) {
        if (!entrySeen.has(hit.target)) {
          entrySeen.add(hit.target);
          nextEntries.push(hit.target);
        }
      }
    }
  }

  const visibleNodes = subtree.nodes.filter((n) => visibleIds.has(n.id));

  return {
    ...subtree,
    entryNodeIds: nextEntries,
    nodes: visibleNodes,
    edges: bridgedEdges,
    scenarios: (subtree.scenarios ?? [])
      .filter(
        (s) =>
          isVisibleForMode(s.audience, mode) &&
          isVisibleForPlatform(s.platforms, mode, platformMode),
      )
      .map((s) => {
        const scenarioEdgeSet = new Set(s.edgeIds);
        const { platforms: scenarioPlatforms, ...rest } = s;
        return {
          ...rest,
          ...(mode === 'tech' && scenarioPlatforms ? { platforms: scenarioPlatforms } : {}),
          nodeIds: s.nodeIds.filter((id) => visibleIds.has(id)),
          edgeIds: bridgedEntries
            .filter((entry) => entry.viaEdgeIds.every((eid) => scenarioEdgeSet.has(eid)))
            .map((entry) => entry.edge.id),
        };
      }),
  };
}

function stripNodeForPublic(node: FlowNodeData, allowedIds: Set<string>): FlowNodeData {
  const publicMedia = (node.media ?? [])
    .filter((m) => (m.audience ?? 'all') === 'all')
    .map((m) => ({
      src: m.src,
      caption: m.caption,
      ...(m.type ? { type: m.type } : {}),
      ...(m.frame ? { frame: m.frame } : {}),
    }));
  const publicRelated = (node.relatedNodeIds ?? []).filter((id) => allowedIds.has(id));

  return {
    id: node.id,
    label: node.label,
    kind: node.kind,
    audience: 'all',
    summary: { overview: node.summary.overview },
    ...(publicMedia.length > 0 ? { media: publicMedia } : {}),
    ...(publicRelated.length > 0 ? { relatedNodeIds: publicRelated } : {}),
  };
}

export function sanitizeForPublic(dataset: MergedFlowDataset): MergedFlowDataset {
  const visibleBranches = dataset.branches.filter((b) => isVisibleForMode(b.audience, 'overview'));
  const filteredSubtrees: Record<string, SubtreeDefinition> = {};
  const allowedIds = new Set<string>([dataset.rootNode.id, ...visibleBranches.map((b) => b.id)]);

  // Chỉ giữ subtree của các parent tồn tại và không bị ẩn
  const collectAllowed = (parentId: string, visited = new Set<string>()) => {
    if (visited.has(parentId)) return;
    visited.add(parentId);
    const sub = dataset.subtreesByParentId[parentId];
    if (!sub) return;
    const bridged = filterAndBridgeSubtree(sub, 'overview');
    if (bridged.nodes.length === 0) return;
    filteredSubtrees[parentId] = bridged;
    for (const node of bridged.nodes) {
      allowedIds.add(node.id);
      collectAllowed(node.id, visited);
    }
  };

  for (const branch of visibleBranches) {
    collectAllowed(branch.id);
  }

  for (const key of Object.keys(filteredSubtrees)) {
    filteredSubtrees[key] = {
      ...filteredSubtrees[key],
      nodes: filteredSubtrees[key].nodes.map((n) => stripNodeForPublic(n, allowedIds)),
      edges: filteredSubtrees[key].edges.map(({ techLabel: _techLabel, ...edge }) => edge),
    };
  }

  const { techBranch: _techBranch, repoConfig: _repoConfig, ...publicApp } = dataset.app;

  return {
    app: publicApp,
    rootNode: stripNodeForPublic(dataset.rootNode, allowedIds),
    branches: visibleBranches.map((b) => stripNodeForPublic(b, allowedIds)),
    branchEdges: dataset.branchEdges
      .filter(
        (e) =>
          isVisibleForMode(e.audience, 'overview') &&
          allowedIds.has(e.source) &&
          allowedIds.has(e.target),
      )
      .map(({ platforms: _platforms, techLabel: _techLabel, ...edge }) => edge),
    subtreesByParentId: filteredSubtrees,
  };
}

export function countDescendants(
  dataset: MergedFlowDataset,
  parentId: string,
  mode: ViewMode,
  visited = new Set<string>(),
  platformMode: PlatformViewMode = 'compare',
): number {
  if (visited.has(parentId)) return 0;
  visited.add(parentId);
  const raw = dataset.subtreesByParentId[parentId];
  if (!raw) return 0;
  const sub = filterAndBridgeSubtree(raw, mode, platformMode);
  let total = sub.nodes.length;
  for (const node of sub.nodes) {
    total += countDescendants(dataset, node.id, mode, visited, platformMode);
  }
  return total;
}

export interface VisibleFlowResult {
  nodes: FlowNodeData[];
  edges: FlowEdgeData[];
  nodeParentMap: Record<string, string>;
  activeScenarios: NonNullable<SubtreeDefinition['scenarios']>;
}

export function buildVisibleTreeFlow(
  dataset: MergedFlowDataset,
  expandedIds: Set<string>,
  mode: ViewMode,
  focusRootId?: string | null,
  platformMode: PlatformViewMode = 'compare',
): VisibleFlowResult {
  const nodes: FlowNodeData[] = [];
  const edges: FlowEdgeData[] = [];
  const nodeParentMap: Record<string, string> = {};
  const addedNodes = new Set<string>();
  const activeScenarios: NonNullable<SubtreeDefinition['scenarios']> = [];

  const pushNode = (node: FlowNodeData, parentId?: string) => {
    if (addedNodes.has(node.id)) return;
    addedNodes.add(node.id);
    nodes.push(node);
    if (parentId) nodeParentMap[node.id] = parentId;
  };

  const expandSubtree = (parentId: string, visited = new Set<string>()) => {
    if (visited.has(parentId) || !expandedIds.has(parentId)) return;
    visited.add(parentId);
    const raw = dataset.subtreesByParentId[parentId];
    if (!raw) return;
    const sub = filterAndBridgeSubtree(raw, mode, platformMode);
    if (sub.scenarios?.length) activeScenarios.push(...sub.scenarios);

    for (const node of sub.nodes) {
      pushNode(node, parentId);
    }
    for (const entryId of sub.entryNodeIds) {
      edges.push({
        id: `expand-${parentId}-${entryId}`,
        source: parentId,
        target: entryId,
      });
    }
    edges.push(...sub.edges);

    for (const node of sub.nodes) {
      expandSubtree(node.id, visited);
    }
  };

  if (focusRootId && focusRootId !== dataset.rootNode.id) {
    const focusNode = findNodeById(dataset, focusRootId);
    if (
      focusNode &&
      isVisibleForMode(focusNode.audience, mode) &&
      isVisibleForPlatform(focusNode.platforms, mode, platformMode)
    ) {
      pushNode(focusNode);
      expandSubtree(focusNode.id);
      return { nodes, edges, nodeParentMap, activeScenarios };
    }
  }

  pushNode(dataset.rootNode);
  for (const branch of dataset.branches) {
    if (
      !isVisibleForMode(branch.audience, mode) ||
      !isVisibleForPlatform(branch.platforms, mode, platformMode)
    ) {
      continue;
    }
    pushNode(branch, dataset.rootNode.id);
    expandSubtree(branch.id);
  }
  for (const edge of dataset.branchEdges) {
    if (
      addedNodes.has(edge.source) &&
      addedNodes.has(edge.target) &&
      isVisibleForMode(edge.audience, mode) &&
      isVisibleForPlatform(edge.platforms, mode, platformMode)
    ) {
      edges.push(resolveEdgeForMode(edge, mode));
    }
  }

  return { nodes, edges, nodeParentMap, activeScenarios };
}

export function findNodeById(
  dataset: MergedFlowDataset,
  nodeId: string,
): FlowNodeData | undefined {
  if (dataset.rootNode.id === nodeId) return dataset.rootNode;
  const branch = dataset.branches.find((b) => b.id === nodeId);
  if (branch) return branch;
  for (const sub of Object.values(dataset.subtreesByParentId)) {
    const found = sub.nodes.find((n) => n.id === nodeId);
    if (found) return found;
  }
  return undefined;
}
