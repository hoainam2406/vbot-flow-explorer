<script setup lang="ts">
import { computed, defineAsyncComponent, inject, markRaw, nextTick, watch } from 'vue';
import {
  VueFlow,
  getTransformForBounds,
  useVueFlow,
  type EdgeComponent,
  type EdgeTypesObject,
  type GraphNode,
  type NodeComponent,
  type NodeTypesObject,
} from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { MiniMap } from '@vue-flow/minimap';
import { FLOW_EXPLORER_KEY, getCameraTargetNodeIds } from '../composables/useFlowExplorer';
import {
  computeDagreGraphLayout,
  computeNodesBounds,
  toVueFlowEdges,
} from '../composables/useGraphLayout';
import { useTheme } from '../composables/useTheme';
import { buildScenarioTimeline } from '../core/scenarioFlowEngine';
import type { NodeKind, Scenario } from '../data/schema';
import RoutedFlowEdge from './edges/RoutedFlowEdge.vue';
import AppFlowNode from './nodes/AppFlowNode.vue';
import CanvasFloatingDock from './CanvasFloatingDock.vue';
import CanvasGuideOverlay from './CanvasGuideOverlay.vue';
import ScenarioBar from './ScenarioBar.vue';
import TelemetryHud from './TelemetryHud.vue';

const emit = defineEmits<{
  openGuide: [];
  openParity: [];
  editEdge: [edgeId: string];
  createScenario: [];
  editScenario: [scenario: Scenario];
  finishScenarioRecording: [];
}>();

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const { isDark } = useTheme();
const { dimensions, fitView, setViewport, viewport, zoomIn, zoomOut, zoomTo } = useVueFlow();

const isTechView = computed(
  () => __ENABLE_TECH_MODE__ && explorer.audienceMode.value === 'tech',
);
const CanvasFilterBar = __ENABLE_TECH_MODE__
  ? defineAsyncComponent(() => import('./CanvasFilterBar.vue'))
  : null;
const zoomPercent = computed(() => Math.round((viewport.value?.zoom ?? 1) * 100));

const nodeTypes: NodeTypesObject = {
  appFlow: markRaw(AppFlowNode) as NodeComponent,
};

const edgeTypes: EdgeTypesObject = {
  routed: markRaw(RoutedFlowEdge) as EdgeComponent,
};

const activeScenario = computed(() => explorer.activeScenario.value);

const activeScenarioTimeline = computed(() =>
  activeScenario.value
    ? buildScenarioTimeline(
        activeScenario.value,
        explorer.visibleFlow.value,
        explorer.audienceMode.value,
      )
    : null,
);

const edgeHighlightState = computed(() => {
  const sc = activeScenario.value;
  if (!sc) {
    return {
      visitedIds: undefined,
      currentStepEdgeId: null,
      upcomingIds: undefined,
    };
  }

  const timeline = activeScenarioTimeline.value;
  const stepIdx = explorer.activeScenarioStepIndex.value;
  if (!timeline || stepIdx === null || timeline.steps.length === 0) {
    return {
      visitedIds: new Set(sc.edgeIds),
      currentStepEdgeId: null,
      upcomingIds: undefined,
    };
  }

  const visitedIds = new Set<string>();
  const upcomingIds = new Set<string>();
  const currentStepEdgeId = timeline.steps[stepIdx]?.incomingEdgeId ?? null;

  timeline.steps.forEach((step, idx) => {
    if (!step.incomingEdgeId) return;
    if (idx <= stepIdx) {
      visitedIds.add(step.incomingEdgeId);
    } else {
      upcomingIds.add(step.incomingEdgeId);
    }
  });

  for (const edgeId of sc.edgeIds) {
    if (edgeId !== currentStepEdgeId && !visitedIds.has(edgeId)) {
      upcomingIds.add(edgeId);
    }
  }

  return { visitedIds, currentStepEdgeId, upcomingIds };
});

const nodeKindById = computed(() => {
  const map = new Map<string, NodeKind>();
  for (const node of explorer.visibleFlow.value.nodes) {
    map.set(node.id, node.kind);
  }
  return map;
});

const graphLayout = computed(() =>
  computeDagreGraphLayout(explorer.visibleFlow.value.nodes, explorer.visibleFlow.value.edges, {
    direction: explorer.layoutDirection.value,
    showCanvasMedia: explorer.showCanvasMedia.value,
  }),
);

const layoutNodes = computed(() => graphLayout.value.nodes);

const layoutEdges = computed(() =>
  toVueFlowEdges(
    explorer.visibleFlow.value.edges,
    edgeHighlightState.value.visitedIds,
    Boolean(activeScenario.value),
    graphLayout.value.edgeRoutes,
    edgeHighlightState.value.currentStepEdgeId,
    edgeHighlightState.value.upcomingIds,
    {
      isDark: isDark.value,
      nodeKindById: nodeKindById.value,
      lineageEdgeIds: explorer.hoveredLineage.value?.edgeIds ?? null,
    },
  ),
);

const MINIMAP_COLORS: Record<NodeKind, string> = {
  module: '#6366f1',
  miniapp: '#06b6d4',
  action: '#3b82f6',
  process: '#8b5cf6',
  decision: '#f59e0b',
  external: '#10b981',
  error: '#f43f5e',
};

const minimapNodeColor = (node: GraphNode): string => {
  const kind = (node.data as { kind?: NodeKind } | undefined)?.kind;
  return kind ? (MINIMAP_COLORS[kind] ?? '#64748b') : '#64748b';
};

const nextFrame = () =>
  new Promise<void>((resolve) => {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => resolve());
    } else {
      resolve();
    }
  });

const runCameraFocus = async (duration = 350) => {
  await nextTick();
  await nextFrame();
  const targetIds = getCameraTargetNodeIds(
    explorer.visibleFlow.value,
    explorer.cameraTarget.value,
  );
  const bounds = computeNodesBounds(layoutNodes.value, targetIds);
  if (bounds && dimensions.value.width > 0 && dimensions.value.height > 0) {
    const maxZoom = targetIds ? 1.05 : 1.0;
    const transform = getTransformForBounds(
      bounds,
      dimensions.value.width,
      dimensions.value.height,
      0.2,
      maxZoom,
      0.18,
    );
    await setViewport(transform, { duration });
    return;
  }
  await fitView({ padding: 0.22, duration });
};

watch(
  [
    () => explorer.cameraTarget.value,
    () => explorer.showCanvasMedia.value,
  ],
  () => {
    void runCameraFocus(350);
  },
);

watch(
  () => explorer.fitRequestSeq.value,
  () => {
    void fitView({ padding: 0.22, duration: 350 });
  },
);

const onPaneReady = () => {
  void runCameraFocus(0);
};

const onEdgeClick = ({ edge }: { edge: { id: string } }) => {
  if (!__ENABLE_TECH_MODE__ || !isTechView.value) return;
  emit('editEdge', edge.id);
};
</script>

<template>
  <div
    class="vbot-canvas-surface relative h-full w-full"
    :class="isTechView ? 'vbot-canvas-surface--tech' : ''"
  >
    <VueFlow
      :nodes="layoutNodes"
      :edges="layoutEdges"
      :node-types="nodeTypes"
      :edge-types="edgeTypes"
      :nodes-draggable="false"
      :nodes-connectable="false"
      :elements-selectable="true"
      :min-zoom="0.2"
      :max-zoom="1.8"
      class="h-full w-full"
      @pane-ready="onPaneReady"
      @pane-click="explorer.selectedNodeId.value = null"
      @edge-click="onEdgeClick"
    >
      <Background :color="isDark ? '#1e293b' : '#cbd5e1'" :gap="22" :size="1.2" />
      <MiniMap
        v-if="!explorer.zenMode.value"
        position="top-right"
        pannable
        zoomable
        :node-color="minimapNodeColor"
        :mask-color="isDark ? 'rgba(9, 13, 22, 0.72)' : 'rgba(241, 245, 249, 0.72)'"
        class="!rounded-xl !border !border-slate-200/90 !bg-white/85 !shadow-md !backdrop-blur-md dark:!border-slate-700/80 dark:!bg-slate-900/85"
      />
    </VueFlow>

    <div
      v-if="!explorer.zenMode.value"
      class="pointer-events-none absolute top-3 left-3 z-10 flex max-w-2xl flex-col items-start gap-2"
    >
      <TelemetryHud @open-parity="emit('openParity')" />
      <component :is="CanvasFilterBar" v-if="CanvasFilterBar && isTechView" />
      <CanvasGuideOverlay @open-guide="emit('openGuide')" />
    </div>

    <ScenarioBar
      v-if="!explorer.zenMode.value"
      @create-scenario="emit('createScenario')"
      @edit-scenario="emit('editScenario', $event)"
    />
    <div
      v-if="isTechView && explorer.scenarioRecordingParentId.value"
      class="pointer-events-auto absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full border border-emerald-400 bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xl"
    >
      <span>Đang chọn bước cho kịch bản ({{ explorer.scenarioRecordingNodeIds.value.length }} bước) — click node trên sơ đồ</span>
      <button
        type="button"
        class="rounded-full bg-white px-3 py-1 text-[11px] font-extrabold text-emerald-700 hover:bg-emerald-50"
        @click="emit('finishScenarioRecording')"
      >
        Hoàn tất chọn bước
      </button>
    </div>
    <CanvasFloatingDock
      :zoom-percent="zoomPercent"
      @zoom-in="void zoomIn({ duration: 180 })"
      @zoom-out="void zoomOut({ duration: 180 })"
      @reset-zoom="void zoomTo(1, { duration: 220 })"
      @fit-view="void runCameraFocus(350)"
    />
  </div>
</template>
