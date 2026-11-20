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
    pulse?: boolean;
    glow?: boolean;
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
const strokeColor = computed(() => String(props.style?.stroke ?? '#64748b'));
const isHighlighted = computed(() => Boolean(props.animated || props.data?.pulse || props.data?.glow));
</script>

<template>
  <g>
    <path
      v-if="props.data?.glow"
      :d="routed.path"
      fill="none"
      :stroke="strokeColor"
      stroke-width="7"
      stroke-linecap="round"
      opacity="0.22"
      class="pointer-events-none"
    />

    <BaseEdge
      :id="props.id"
      :path="routed.path"
      :marker-end="props.markerEnd"
      :style="props.style"
    />

    <circle
      v-if="props.data?.pulse"
      r="3.2"
      :fill="strokeColor"
      class="vbot-edge-packet pointer-events-none"
    >
      <animateMotion dur="1.6s" repeatCount="indefinite" :path="routed.path" />
    </circle>
  </g>

  <EdgeLabelRenderer v-if="props.label">
    <div
      class="nodrag nopan pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-md border px-2 py-0.5 text-center text-[11px] leading-tight font-medium shadow-2xs backdrop-blur-xs transition-opacity"
      :class="
        isHighlighted
          ? 'border-blue-500/80 bg-blue-50/95 text-blue-700 dark:border-cyan-400/60 dark:bg-slate-900/95 dark:text-cyan-300'
          : 'border-slate-200/90 bg-white/95 text-slate-700 dark:border-slate-700/80 dark:bg-slate-900/95 dark:text-slate-200'
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
