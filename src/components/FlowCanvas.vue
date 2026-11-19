<script setup lang="ts">
import { computed, inject, markRaw, nextTick, watch } from 'vue';
import {
  VueFlow,
  useVueFlow,
  type NodeComponent,
  type NodeTypesObject,
} from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import { MiniMap } from '@vue-flow/minimap';
import { FLOW_EXPLORER_KEY } from '../composables/useFlowExplorer';
import { computeDagreLayout, toVueFlowEdges } from '../composables/useGraphLayout';
import AppFlowNode from './nodes/AppFlowNode.vue';
import ScenarioBar from './ScenarioBar.vue';

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const { fitView } = useVueFlow();

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

const runFitView = async (duration = 350) => {
  await nextTick();
  await fitView({ padding: 0.22, duration });
};

watch(
  [
    () => explorer.visibleFlow.value,
    () => explorer.showCanvasMedia.value,
    () => explorer.focusRootId.value,
  ],
  () => {
    void runFitView(350);
  },
);

const onPaneReady = () => {
  void runFitView(0);
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
