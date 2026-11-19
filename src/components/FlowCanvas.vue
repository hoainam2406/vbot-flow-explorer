<script setup lang="ts">
import { computed, inject, markRaw, nextTick, watch } from 'vue';
import {
  VueFlow,
  getTransformForBounds,
  useVueFlow,
  type NodeComponent,
  type NodeTypesObject,
} from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import { MiniMap } from '@vue-flow/minimap';
import { FLOW_EXPLORER_KEY, getCameraTargetNodeIds } from '../composables/useFlowExplorer';
import {
  computeDagreLayout,
  computeNodesBounds,
  toVueFlowEdges,
} from '../composables/useGraphLayout';
import AppFlowNode from './nodes/AppFlowNode.vue';
import ScenarioBar from './ScenarioBar.vue';

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const { dimensions, fitView, setViewport } = useVueFlow();

const nodeTypes: NodeTypesObject = {
  appFlow: markRaw(AppFlowNode) as NodeComponent,
};

const activeScenario = computed(() => {
  const scId = explorer.activeScenarioId.value;
  if (!scId) return null;
  return explorer.visibleFlow.value.activeScenarios.find((s) => s.id === scId) ?? null;
});

const activeEdgeIds = computed(() =>
  activeScenario.value ? new Set(activeScenario.value.edgeIds) : undefined,
);

const layoutNodes = computed(() =>
  computeDagreLayout(explorer.visibleFlow.value.nodes, explorer.visibleFlow.value.edges, {
    direction: 'LR',
    showCanvasMedia: explorer.showCanvasMedia.value,
  }),
);

const layoutEdges = computed(() =>
  toVueFlowEdges(
    explorer.visibleFlow.value.edges,
    activeEdgeIds.value,
    Boolean(activeScenario.value),
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

    <ScenarioBar />
  </div>
</template>
