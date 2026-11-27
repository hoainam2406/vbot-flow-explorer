<script setup lang="ts">
import { computed, defineAsyncComponent, inject, markRaw, nextTick, watch } from 'vue';
import { ChevronRight, RotateCcw } from 'lucide-vue-next';
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
import { getNodeDisplayLabel } from '../core/graphEngine';
import { buildScenarioTimeline } from '../core/scenarioFlowEngine';
import type { AppTourTrack } from '../core/appTourEngine';
import type { NodeKind, Scenario } from '../data/schema';
import RoutedFlowEdge from './edges/RoutedFlowEdge.vue';
import AppFlowNode from './nodes/AppFlowNode.vue';
import CanvasFloatingDock from './CanvasFloatingDock.vue';
import CanvasGuideOverlay from './CanvasGuideOverlay.vue';
import ExportMenu from './ExportMenu.vue';
import ScenarioBar from './ScenarioBar.vue';
import TelemetryHud from './TelemetryHud.vue';

const emit = defineEmits<{
  openGuide: [];
  startTour: [track?: AppTourTrack];
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
const TechPlatformSwitcher = __ENABLE_TECH_MODE__
  ? defineAsyncComponent(() => import('./TechPlatformSwitcher.vue'))
  : null;
const zoomPercent = computed(() => Math.round((viewport.value?.zoom ?? 1) * 100));

const onBreadcrumbClick = (nodeId: string) => {
  if (nodeId === explorer.dataset.rootNode.id) {
    explorer.setFocusRoot(null);
    explorer.selectedNodeId.value = null;
    return;
  }
  if (explorer.focusRootId.value) {
    explorer.setFocusRoot(nodeId);
  }
  explorer.jumpToNode(nodeId);
};

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
    data-tour="canvas-area"
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
      class="pointer-events-none absolute top-3 left-3 right-[232px] z-20 flex flex-wrap items-start justify-between gap-2"
    >
      <div class="flex min-w-0 flex-1 flex-col items-start gap-1.5">
        <div class="flex flex-wrap items-start gap-1.5">
          <TelemetryHud />
          <component :is="CanvasFilterBar" v-if="CanvasFilterBar && isTechView" />
          <nav
            v-if="explorer.breadcrumbNodes.value.length > 1 || explorer.focusRootId.value"
            aria-label="Breadcrumb"
            class="pointer-events-auto inline-flex max-w-full flex-wrap items-center gap-0.5 rounded-full border border-slate-200/90 bg-white/90 px-2.5 py-0.5 text-[11px] text-slate-500 shadow-sm backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-900/90 dark:text-slate-400"
          >
            <template v-for="(node, idx) in explorer.breadcrumbNodes.value" :key="node.id">
              <ChevronRight v-if="idx > 0" class="h-3 w-3 shrink-0 text-slate-400 dark:text-slate-600" />
              <button
                type="button"
                class="max-w-36 truncate rounded-full px-1.5 py-0.5 font-medium transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                :class="
                  idx === explorer.breadcrumbNodes.value.length - 1
                    ? 'bg-slate-100 text-slate-900 dark:bg-slate-800/90 dark:text-slate-100'
                    : 'text-slate-600 dark:text-slate-400'
                "
                @click="onBreadcrumbClick(node.id)"
              >
                {{ getNodeDisplayLabel(node, explorer.audienceMode.value) }}
              </button>
            </template>

            <button
              v-if="explorer.focusRootId.value"
              type="button"
              class="ml-1 inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-semibold text-amber-800 transition hover:bg-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-1 dark:ring-amber-500/30 dark:hover:bg-amber-500/25"
              @click="explorer.setFocusRoot(null)"
            >
              <RotateCcw class="h-2.5 w-2.5" />
              Xem toàn bộ
            </button>
          </nav>
        </div>

        <CanvasGuideOverlay
          @open-guide="emit('openGuide')"
          @start-tour="emit('startTour', $event)"
        />
      </div>

      <div
        class="pointer-events-auto flex shrink-0 items-center gap-1 rounded-xl border border-slate-200/90 bg-white/90 p-1 shadow-sm backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-900/90"
      >
        <component
          :is="TechPlatformSwitcher"
          v-if="TechPlatformSwitcher && isTechView"
          :show-parity="false"
          :embedded="true"
        />
        <span
          v-if="TechPlatformSwitcher && isTechView"
          class="mx-0.5 h-4 w-px bg-slate-200 dark:bg-slate-700/80"
        />
        <ExportMenu :embedded="true" />
      </div>
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
