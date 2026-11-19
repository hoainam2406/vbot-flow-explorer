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
  Scenario,
} from '../data/schema';

export interface CameraTarget {
  kind: 'all' | 'subtree' | 'node' | 'scenario_step';
  nodeId?: string;
  nodeIds?: string[];
  seq: number;
}

export function getCameraTargetNodeIds(
  visibleFlow: VisibleFlowResult,
  target: CameraTarget,
): string[] | null {
  if (target.kind === 'all') return null;

  const visibleIds = new Set(visibleFlow.nodes.map((n) => n.id));
  if (target.kind === 'scenario_step') {
    const candidates = (target.nodeIds ?? (target.nodeId ? [target.nodeId] : []))
      .filter((id) => visibleIds.has(id));
    return candidates.length > 0 ? candidates : null;
  }

  if (!target.nodeId || !visibleIds.has(target.nodeId)) return null;

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
  const MAX_NAV_HISTORY = 25;
  const audienceMode = ref<ViewMode>('overview');
  const platformMode = ref<PlatformViewMode>('compare');
  const expandedIds = ref<Set<string>>(new Set());
  const accordionMode = ref(true);
  const focusRootId = ref<string | null>(null);
  const selectedNodeId = ref<string | null>(null);
  const navigationHistory = ref<string[]>([]);
  const activeScenarioId = ref<string | null>(null);
  const activeScenarioStepIndex = ref<number | null>(null);
  const scenarioDialogOpen = ref(false);
  const showCanvasMedia = ref(false);
  let cameraSeq = 0;
  const cameraTarget = ref<CameraTarget>({ kind: 'all', seq: 0 });

  const isNodeCurrentlyVisible = (nodeId: string): boolean => {
    const found = findNodeById(dataset, nodeId);
    if (!found) return false;
    return (
      isVisibleForMode(found.audience, audienceMode.value) &&
      isVisibleForPlatform(found.platforms, audienceMode.value, platformMode.value)
    );
  };

  const pushHistory = (prevId: string | null, nextId: string | null) => {
    if (!prevId || !nextId || prevId === nextId) return;
    const current = navigationHistory.value;
    if (current[current.length - 1] === prevId) return;
    const next = [...current, prevId];
    navigationHistory.value =
      next.length > MAX_NAV_HISTORY ? next.slice(next.length - MAX_NAV_HISTORY) : next;
  };

  const selectNode = (nodeId: string | null, options?: { recordHistory?: boolean }) => {
    if (options?.recordHistory !== false) {
      pushHistory(selectedNodeId.value, nodeId);
    }
    selectedNodeId.value = nodeId;
  };

  const setCameraTarget = (
    kind: CameraTarget['kind'],
    nodeId?: string,
    nodeIds?: string[],
  ) => {
    cameraTarget.value = {
      kind,
      ...(nodeId ? { nodeId } : {}),
      ...(nodeIds ? { nodeIds } : {}),
      seq: ++cameraSeq,
    };
  };

  const clearScenarioState = () => {
    activeScenarioId.value = null;
    activeScenarioStepIndex.value = null;
    scenarioDialogOpen.value = false;
  };

  const parentIndex = buildParentIndex(dataset);

  const visibleFlow = computed(() =>
    buildVisibleTreeFlow(
      dataset,
      expandedIds.value,
      audienceMode.value,
      focusRootId.value,
      platformMode.value,
    ),
  );

  const getVisibleScenarioStepIds = (scenario: Scenario): string[] => {
    const visibleIds = new Set(visibleFlow.value.nodes.map((n) => n.id));
    return scenario.nodeIds.filter((id) => visibleIds.has(id));
  };

  const setAudienceMode = (next: ViewMode) => {
    audienceMode.value = allowTechMode ? next : 'overview';
    clearScenarioState();
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
    if (activeScenarioId.value) {
      const matchingScenario = visibleFlow.value.activeScenarios.find(
        (s) => s.id === activeScenarioId.value,
      );
      if (!matchingScenario) {
        clearScenarioState();
      } else {
        const stepIds = getVisibleScenarioStepIds(matchingScenario);
        if (stepIds.length === 0) {
          activeScenarioStepIndex.value = null;
        } else {
          const clamped = Math.max(
            0,
            Math.min(activeScenarioStepIndex.value ?? 0, stepIds.length - 1),
          );
          activeScenarioStepIndex.value = clamped;
          const focusIds = [
            stepIds[clamped - 1],
            stepIds[clamped],
            stepIds[clamped + 1],
          ].filter((id): id is string => Boolean(id));
          setCameraTarget('scenario_step', stepIds[clamped], focusIds);
          return;
        }
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
    clearScenarioState();

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

  const jumpToNode = (nodeId: string, options?: { recordHistory?: boolean }) => {
    const ancestors = getAncestorChain(nodeId);
    const next = new Set(accordionMode.value ? [] : expandedIds.value);
    for (const ancId of ancestors.slice(0, -1)) {
      if (dataset.subtreesByParentId[ancId]) {
        next.add(ancId);
      }
    }
    expandedIds.value = next;
    selectNode(nodeId, options);
    if (focusRootId.value && !ancestors.includes(focusRootId.value)) {
      focusRootId.value = null;
    }
    setCameraTarget('node', nodeId);
  };

  const previousNode = computed<FlowNodeData | null>(() => {
    const curId = selectedNodeId.value;
    for (let i = navigationHistory.value.length - 1; i >= 0; i -= 1) {
      const candidateId = navigationHistory.value[i];
      if (candidateId === curId) continue;
      if (isNodeCurrentlyVisible(candidateId)) {
        return findNodeById(dataset, candidateId) ?? null;
      }
    }
    return null;
  });

  const goBack = (): boolean => {
    const curId = selectedNodeId.value;
    const remaining = [...navigationHistory.value];
    while (remaining.length > 0) {
      const candidateId = remaining.pop()!;
      if (candidateId !== curId && isNodeCurrentlyVisible(candidateId)) {
        navigationHistory.value = remaining;
        jumpToNode(candidateId, { recordHistory: false });
        return true;
      }
    }
    navigationHistory.value = [];
    return false;
  };

  const setFocusRoot = (nodeId: string | null) => {
    const nextFocus = nodeId && nodeId !== dataset.rootNode.id ? nodeId : null;
    focusRootId.value = nextFocus;
    if (nextFocus && dataset.subtreesByParentId[nextFocus]) {
      const next = new Set(expandedIds.value);
      next.add(nextFocus);
      expandedIds.value = next;
    }
    clearScenarioState();
    setCameraTarget('all');
  };

  const activeScenario = computed<Scenario | null>(() => {
    const scId = activeScenarioId.value;
    if (!scId) return null;
    return visibleFlow.value.activeScenarios.find((s) => s.id === scId) ?? null;
  });

  const activeScenarioStepNodeId = computed<string | null>(() => {
    const sc = activeScenario.value;
    const idx = activeScenarioStepIndex.value;
    if (!sc || idx === null) return null;
    const stepIds = getVisibleScenarioStepIds(sc);
    return stepIds[idx] ?? null;
  });

  const setScenarioStep = (
    index: number | null,
    options?: { focusCamera?: boolean },
  ) => {
    const sc = activeScenario.value;
    if (!sc || index === null) {
      activeScenarioStepIndex.value = null;
      return;
    }
    const stepIds = getVisibleScenarioStepIds(sc);
    if (stepIds.length === 0) {
      activeScenarioStepIndex.value = null;
      return;
    }
    const clamped = Math.max(0, Math.min(index, stepIds.length - 1));
    activeScenarioStepIndex.value = clamped;
    if (options?.focusCamera !== false) {
      const focusIds = [
        stepIds[clamped - 1],
        stepIds[clamped],
        stepIds[clamped + 1],
      ].filter((id): id is string => Boolean(id));
      setCameraTarget('scenario_step', stepIds[clamped], focusIds);
    }
  };

  const selectScenario = (scenarioId: string | null) => {
    if (!scenarioId || activeScenarioId.value === scenarioId) {
      clearScenarioState();
      return;
    }
    const target = visibleFlow.value.activeScenarios.find((s) => s.id === scenarioId);
    if (!target) {
      clearScenarioState();
      return;
    }
    activeScenarioId.value = target.id;
    const stepIds = getVisibleScenarioStepIds(target);
    if (stepIds.length > 0) {
      activeScenarioStepIndex.value = 0;
      const focusIds = [stepIds[0], stepIds[1]].filter((id): id is string => Boolean(id));
      setCameraTarget('scenario_step', stepIds[0], focusIds);
    } else {
      activeScenarioStepIndex.value = null;
    }
  };

  const stepScenario = (delta: 1 | -1) => {
    const sc = activeScenario.value;
    if (!sc) return;
    const stepIds = getVisibleScenarioStepIds(sc);
    if (stepIds.length === 0) return;
    const cur = activeScenarioStepIndex.value;
    const next =
      cur === null
        ? delta > 0
          ? 0
          : stepIds.length - 1
        : Math.max(0, Math.min(cur + delta, stepIds.length - 1));
    setScenarioStep(next);
  };

  const openScenarioDialog = (scenarioId?: string) => {
    if (scenarioId && activeScenarioId.value !== scenarioId) {
      selectScenario(scenarioId);
    }
    if (!activeScenario.value) {
      const first = visibleFlow.value.activeScenarios[0];
      if (!first) return;
      selectScenario(first.id);
    }
    if (
      activeScenario.value &&
      activeScenarioStepIndex.value === null &&
      getVisibleScenarioStepIds(activeScenario.value).length > 0
    ) {
      setScenarioStep(0, { focusCamera: false });
    }
    scenarioDialogOpen.value = true;
  };

  const closeScenarioDialog = () => {
    scenarioDialogOpen.value = false;
  };

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
    navigationHistory,
    previousNode,
    activeScenarioId,
    activeScenario,
    activeScenarioStepIndex,
    activeScenarioStepNodeId,
    scenarioDialogOpen,
    showCanvasMedia,
    cameraTarget,
    visibleFlow,
    selectedNode,
    breadcrumbNodes,
    setAudienceMode,
    setPlatformMode,
    toggleExpand,
    selectNode,
    jumpToNode,
    goBack,
    setFocusRoot,
    selectScenario,
    setScenarioStep,
    stepScenario,
    openScenarioDialog,
    closeScenarioDialog,
    getChildCount,
    hasSubtree,
    findNode,
  };
}

export type FlowExplorerState = ReturnType<typeof createFlowExplorerState>;
export const FLOW_EXPLORER_KEY: InjectionKey<FlowExplorerState> = Symbol('vbot-flow-explorer');
