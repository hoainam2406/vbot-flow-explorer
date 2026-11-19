// src/composables/useFlowExplorer.ts
import { computed, ref, type InjectionKey } from 'vue';
import {
  buildVisibleTreeFlow,
  countDescendants,
  findNodeById,
  type ViewMode,
} from '../core/graphEngine';
import type { FlowNodeData, MediaItem, MergedFlowDataset } from '../data/schema';

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
  const expandedIds = ref<Set<string>>(new Set());
  const accordionMode = ref(true);
  const focusRootId = ref<string | null>(null);
  const selectedNodeId = ref<string | null>(null);
  const activeScenarioId = ref<string | null>(null);
  const showCanvasMedia = ref(false);

  const parentIndex = buildParentIndex(dataset);

  const setAudienceMode = (next: ViewMode) => {
    audienceMode.value = allowTechMode ? next : 'overview';
    activeScenarioId.value = null;
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

    if (next.has(nodeId)) {
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
  };

  const visibleFlow = computed(() =>
    buildVisibleTreeFlow(
      dataset,
      expandedIds.value,
      audienceMode.value,
      focusRootId.value,
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
    countDescendants(dataset, nodeId, audienceMode.value);

  const hasSubtree = (nodeId: string) => Boolean(dataset.subtreesByParentId[nodeId]);

  const findNode = (nodeId: string) => findNodeById(dataset, nodeId);

  return {
    dataset,
    allowTechMode,
    audienceMode,
    expandedIds,
    accordionMode,
    focusRootId,
    selectedNodeId,
    activeScenarioId,
    showCanvasMedia,
    visibleFlow,
    selectedNode,
    breadcrumbNodes,
    setAudienceMode,
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
