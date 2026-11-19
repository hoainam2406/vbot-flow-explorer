// src/composables/useFlowExplorer.ts
import { computed, ref, type InjectionKey } from 'vue';
import {
  buildVisibleTreeFlow,
  countDescendants,
  findNodeById,
  isVisibleForMode,
  isVisibleForPlatform,
  type ViewMode,
  type VisibleFlowResult,
} from '../core/graphEngine';
import type {
  FlowNodeData,
  MediaItem,
  MergedFlowDataset,
  PlatformViewMode,
} from '../data/schema';

export interface CameraTarget {
  kind: 'all' | 'subtree' | 'node';
  nodeId?: string;
  seq: number;
}

export function getCameraTargetNodeIds(
  visibleFlow: VisibleFlowResult,
  target: CameraTarget,
): string[] | null {
  if (target.kind === 'all' || !target.nodeId) return null;

  const visibleIds = new Set(visibleFlow.nodes.map((n) => n.id));
  if (!visibleIds.has(target.nodeId)) return null;

  if (target.kind === 'subtree') {
    const result: string[] = [target.nodeId];
    const seen = new Set<string>([target.nodeId]);
    const isDescendant = (id: string): boolean => {
      let cursor: string | undefined = visibleFlow.nodeParentMap[id];
      const guard = new Set<string>();
      while (cursor && !guard.has(cursor)) {
        if (cursor === target.nodeId) return true;
        guard.add(cursor);
        cursor = visibleFlow.nodeParentMap[cursor];
      }
      return false;
    };
    for (const node of visibleFlow.nodes) {
      if (!seen.has(node.id) && isDescendant(node.id)) {
        seen.add(node.id);
        result.push(node.id);
      }
    }
    return result;
  }

  const result: string[] = [];
  const seen = new Set<string>();
  const addIfVisible = (id: string | undefined) => {
    if (id && visibleIds.has(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  };

  addIfVisible(visibleFlow.nodeParentMap[target.nodeId]);
  addIfVisible(target.nodeId);
  for (const node of visibleFlow.nodes) {
    if (visibleFlow.nodeParentMap[node.id] === target.nodeId) {
      addIfVisible(node.id);
    }
  }
  return result;
}

export function buildParentIndex(dataset: MergedFlowDataset): Record<string, string> {
  const parentOf: Record<string, string> = {};
  for (const branch of dataset.branches) {
    parentOf[branch.id] = dataset.rootNode.id;
  }
  for (const [parentId, sub] of Object.entries(dataset.subtreesByParentId)) {
    for (const node of sub.nodes) {
      parentOf[node.id] = parentId;
    }
  }
  return parentOf;
}

export function getVisibleMedia(node: FlowNodeData, mode: ViewMode): MediaItem[] {
  const items = node.media ?? [];
  if (__ENABLE_TECH_MODE__ && mode === 'tech') {
    return items;
  }
  return items.filter((m) => (m.audience ?? 'all') === 'all');
}

export function createFlowExplorerState(
  dataset: MergedFlowDataset,
  allowTechMode: boolean,
) {
  const audienceMode = ref<ViewMode>('overview');
  const platformMode = ref<PlatformViewMode>('compare');
  const expandedIds = ref<Set<string>>(new Set());
  const accordionMode = ref(true);
  const focusRootId = ref<string | null>(null);
  const selectedNodeId = ref<string | null>(null);
  const activeScenarioId = ref<string | null>(null);
  const showCanvasMedia = ref(false);
  let cameraSeq = 0;
  const cameraTarget = ref<CameraTarget>({ kind: 'all', seq: 0 });

  const setCameraTarget = (kind: CameraTarget['kind'], nodeId?: string) => {
    cameraTarget.value = {
      kind,
      ...(nodeId ? { nodeId } : {}),
      seq: ++cameraSeq,
    };
  };

  const parentIndex = buildParentIndex(dataset);

  const setAudienceMode = (next: ViewMode) => {
    audienceMode.value = allowTechMode ? next : 'overview';
    activeScenarioId.value = null;
    if (selectedNodeId.value) {
      const sel = findNodeById(dataset, selectedNodeId.value);
      if (
        sel &&
        (!isVisibleForMode(sel.audience, audienceMode.value) ||
          !isVisibleForPlatform(sel.platforms, audienceMode.value, platformMode.value))
      ) {
        selectedNodeId.value = null;
      }
    }
    if (cameraTarget.value.kind === 'subtree' && cameraTarget.value.nodeId) {
      setCameraTarget('subtree', cameraTarget.value.nodeId);
    } else {
      setCameraTarget('all');
    }
  };

  const setPlatformMode = (next: PlatformViewMode) => {
    if (!allowTechMode) return;
    platformMode.value = next;
    activeScenarioId.value = null;
    if (selectedNodeId.value) {
      const sel = findNodeById(dataset, selectedNodeId.value);
      if (sel && !isVisibleForPlatform(sel.platforms, audienceMode.value, next)) {
        selectedNodeId.value = null;
      }
    }
    if (focusRootId.value) {
      const focusNode = findNodeById(dataset, focusRootId.value);
      if (focusNode && !isVisibleForPlatform(focusNode.platforms, audienceMode.value, next)) {
        focusRootId.value = null;
      }
    }
    if (cameraTarget.value.kind === 'subtree' && cameraTarget.value.nodeId) {
      const subNode = findNodeById(dataset, cameraTarget.value.nodeId);
      if (subNode && isVisibleForPlatform(subNode.platforms, audienceMode.value, next)) {
        setCameraTarget('subtree', cameraTarget.value.nodeId);
        return;
      }
    }
    setCameraTarget('all');
  };

  const getAncestorChain = (nodeId: string): string[] => {
    const chain: string[] = [];
    let cursor: string | undefined = nodeId;
    const guard = new Set<string>();
    while (cursor && !guard.has(cursor)) {
      guard.add(cursor);
      chain.unshift(cursor);
      cursor = parentIndex[cursor];
    }
    return chain;
  };

  const toggleExpand = (nodeId: string) => {
    if (!dataset.subtreesByParentId[nodeId]) return;
    const next = new Set(expandedIds.value);
    const wasExpanded = next.has(nodeId);

    if (wasExpanded) {
      next.delete(nodeId);
    } else {
      if (accordionMode.value) {
        const parent = parentIndex[nodeId];
        const collapsedSiblings = new Set<string>();
        for (const id of next) {
          if (id !== nodeId && parentIndex[id] === parent) {
            collapsedSiblings.add(id);
          }
        }
        // Thu gọn các nhánh anh em cùng cha và toàn bộ con cháu đang mở của chúng
        if (collapsedSiblings.size > 0) {
          for (const id of [...next]) {
            if (
              collapsedSiblings.has(id) ||
              getAncestorChain(id).some((ancId) => collapsedSiblings.has(ancId))
            ) {
              next.delete(id);
            }
          }
        }
      }
      next.add(nodeId);
    }
    expandedIds.value = next;
    activeScenarioId.value = null;

    if (!wasExpanded) {
      setCameraTarget('subtree', nodeId);
    } else if (next.size === 0 && !focusRootId.value) {
      setCameraTarget('all');
    } else if (parentIndex[nodeId] && parentIndex[nodeId] !== dataset.rootNode.id) {
      setCameraTarget('subtree', parentIndex[nodeId]);
    } else {
      setCameraTarget('all');
    }
  };

  const jumpToNode = (nodeId: string) => {
    const ancestors = getAncestorChain(nodeId);
    const next = new Set(accordionMode.value ? [] : expandedIds.value);
    for (const ancId of ancestors.slice(0, -1)) {
      if (dataset.subtreesByParentId[ancId]) {
        next.add(ancId);
      }
    }
    expandedIds.value = next;
    selectedNodeId.value = nodeId;
    if (focusRootId.value && !ancestors.includes(focusRootId.value)) {
      focusRootId.value = null;
    }
    setCameraTarget('node', nodeId);
  };

  const setFocusRoot = (nodeId: string | null) => {
    const nextFocus = nodeId && nodeId !== dataset.rootNode.id ? nodeId : null;
    focusRootId.value = nextFocus;
    if (nextFocus && dataset.subtreesByParentId[nextFocus]) {
      const next = new Set(expandedIds.value);
      next.add(nextFocus);
      expandedIds.value = next;
    }
    activeScenarioId.value = null;
    setCameraTarget('all');
  };

  const visibleFlow = computed(() =>
    buildVisibleTreeFlow(
      dataset,
      expandedIds.value,
      audienceMode.value,
      focusRootId.value,
      platformMode.value,
    ),
  );

  const selectedNode = computed<FlowNodeData | null>(() =>
    selectedNodeId.value ? findNodeById(dataset, selectedNodeId.value) ?? null : null,
  );

  const breadcrumbNodes = computed<FlowNodeData[]>(() => {
    const anchor = focusRootId.value ?? selectedNodeId.value ?? dataset.rootNode.id;
    return getAncestorChain(anchor)
      .map((id) => findNodeById(dataset, id))
      .filter((n): n is FlowNodeData => Boolean(n));
  });

  const getChildCount = (nodeId: string) =>
    countDescendants(dataset, nodeId, audienceMode.value, new Set(), platformMode.value);

  const hasSubtree = (nodeId: string) => Boolean(dataset.subtreesByParentId[nodeId]);

  const findNode = (nodeId: string) => findNodeById(dataset, nodeId);

  return {
    dataset,
    allowTechMode,
    audienceMode,
    platformMode,
    expandedIds,
    accordionMode,
    focusRootId,
    selectedNodeId,
    activeScenarioId,
    showCanvasMedia,
    cameraTarget,
    visibleFlow,
    selectedNode,
    breadcrumbNodes,
    setAudienceMode,
    setPlatformMode,
    toggleExpand,
    jumpToNode,
    setFocusRoot,
    getChildCount,
    hasSubtree,
    findNode,
  };
}

export type FlowExplorerState = ReturnType<typeof createFlowExplorerState>;
export const FLOW_EXPLORER_KEY: InjectionKey<FlowExplorerState> = Symbol('vbot-flow-explorer');
