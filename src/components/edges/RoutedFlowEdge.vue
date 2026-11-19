<script setup lang="ts">
import { computed, type CSSProperties } from 'vue';
import { BaseEdge, EdgeLabelRenderer, Position } from '@vue-flow/core';
import { buildRoutedEdgePath, type EdgeRoute } from '../../composables/useGraphLayout';

defineOptions({
  inheritAttrs: false,
});

const props = defineProps<{
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  label?: string;
  markerEnd?: string;
  style?: CSSProperties;
  animated?: boolean;
  data?: {
    route?: EdgeRoute;
  };
}>();

const routed = computed(() =>
  buildRoutedEdgePath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
    route: props.data?.route,
  }),
);

const labelOpacity = computed(() => props.style?.opacity ?? 1);
</script>

<template>
  <BaseEdge
    :id="props.id"
    :path="routed.path"
    :marker-end="props.markerEnd"
    :style="props.style"
  />

  <EdgeLabelRenderer v-if="props.label">
    <div
      class="nodrag nopan pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-md border px-2 py-0.5 text-center text-[11px] leading-tight font-medium shadow-2xs transition-opacity"
      :class="
        props.animated
          ? 'border-blue-500 bg-blue-50/95 text-blue-700'
          : 'border-slate-200/90 bg-white/95 text-slate-700'
      "
      :style="{
        left: `${routed.labelX}px`,
        top: `${routed.labelY}px`,
        maxWidth: '190px',
        opacity: labelOpacity,
      }"
    >
      {{ props.label }}
    </div>
  </EdgeLabelRenderer>
</template>
