<script setup lang="ts">
import { computed, inject, markRaw, nextTick, watch } from 'vue';
import {
  VueFlow,
  getTransformForBounds,
  useVueFlow,
  type EdgeComponent,
  type EdgeTypesObject,
  type NodeComponent,
  type NodeTypesObject,
} from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import { MiniMap } from '@vue-flow/minimap';
import { FLOW_EXPLORER_KEY, getCameraTargetNodeIds } from '../composables/useFlowExplorer';
import {
  computeDagreGraphLayout,
  computeNodesBounds,
  toVueFlowEdges,
} from '../composables/useGraphLayout';
import { buildScenarioTimeline } from '../core/scenarioFlowEngine';
import RoutedFlowEdge from './edges/RoutedFlowEdge.vue';
import AppFlowNode from './nodes/AppFlowNode.vue';
import CanvasGuideOverlay from './CanvasGuideOverlay.vue';
import ScenarioBar from './ScenarioBar.vue';

const emit = defineEmits<{
  openGuide: [];
}>();

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const { dimensions, fitView, setViewport } = useVueFlow();

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

const graphLayout = computed(() =>
  computeDagreGraphLayout(explorer.visibleFlow.value.nodes, explorer.visibleFlow.value.edges, {
    direction: 'LR',
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
  ),
);

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

const onPaneReady = () => {
  void runCameraFocus(0);
};
</script>

<template>
  <div class="relative h-full w-full bg-slate-50">
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
    >
      <Background color="#cbd5e1" :gap="20" />
      <Controls
        position="bottom-right"
        :show-interactive="false"
        :fit-view-params="{ padding: 0.22, duration: 350 }"
      />
      <MiniMap
        position="top-right"
        pannable
        zoomable
        class="!rounded-xl !border !border-slate-200 !shadow-sm"
      />
    </VueFlow>

    <CanvasGuideOverlay @open-guide="emit('openGuide')" />
    <ScenarioBar />
  </div>
</template>
