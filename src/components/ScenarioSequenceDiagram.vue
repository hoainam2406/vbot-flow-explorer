<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import {
  computeSequenceDiagramLayout,
  type ScenarioSequenceModel,
} from '../core/scenarioSequenceBuilder';
import { SVG_FONT_FAMILY } from '../core/svgHelpers';

const props = defineProps<{
  model: ScenarioSequenceModel;
  activeStepIndex: number;
}>();

const emit = defineEmits<{
  selectStep: [index: number];
}>();

const rowRefs = ref<Record<number, SVGGElement | null>>({});

const setRowRef = (el: unknown, stepIndex: number) => {
  if (el instanceof SVGGElement && !rowRefs.value[stepIndex]) {
    rowRefs.value[stepIndex] = el;
  }
};

const layout = computed(() => computeSequenceDiagramLayout(props.model));

watch(
  () => [props.model.scenarioId, props.model.platformMode],
  () => {
    rowRefs.value = {};
  },
);

watch(
  () => props.activeStepIndex,
  async (idx) => {
    await nextTick();
    rowRefs.value[idx]?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  },
);
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-300">
      <div class="flex flex-wrap items-center gap-3">
        <span class="inline-flex items-center gap-1.5">
          <span class="inline-block h-0.5 w-5 bg-slate-700 dark:bg-slate-300" />
          Lệnh / Gọi đi
        </span>
        <span class="inline-flex items-center gap-1.5">
          <span class="inline-block h-0.5 w-5 border-t-2 border-dashed border-cyan-600 dark:border-cyan-400" />
          Phản hồi / Sự kiện đẩy
        </span>
      </div>
      <span class="font-medium text-indigo-700 dark:text-cyan-300">
        Nhấp vào mũi tên để xem chi tiết & Payload
      </span>
    </div>

    <div class="vbot-svg-stage overflow-x-auto p-2">
      <svg
        :viewBox="`0 ${layout.headerHeight} ${layout.width} ${layout.height - layout.headerHeight}`"
        :style="{ maxWidth: `${layout.width}px` }"
        class="mx-auto block h-auto w-full min-w-[560px] select-none"
      >
        <defs>
          <marker
            id="ui-seq-solid"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#334155" />
          </marker>
          <marker
            id="ui-seq-active"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6.5"
            markerHeight="6.5"
            orient="auto"
          >
            <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#2563eb" />
          </marker>
          <marker
            id="ui-seq-dashed"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#0891b2" />
          </marker>
        </defs>

        <!-- Lifelines & Actor Headers / Footers -->
        <g v-for="actor in props.model.actors" :key="actor.id">
          <line
            :x1="layout.actorCenters[actor.id]"
            :y1="layout.lifelineStartY"
            :x2="layout.actorCenters[actor.id]"
            :y2="layout.lifelineEndY"
            stroke="#cbd5e1"
            stroke-width="1.5"
            stroke-dasharray="6 5"
          />
          <rect
            :x="layout.actorCenters[actor.id] - layout.actorBoxWidth / 2"
            :y="layout.actorBoxY"
            :width="layout.actorBoxWidth"
            :height="layout.actorBoxHeight"
            rx="10"
            :fill="actor.bg"
            :stroke="actor.border"
            stroke-width="1.4"
          />
          <text
            :x="layout.actorCenters[actor.id]"
            :y="layout.actorBoxY + 19"
            :font-family="SVG_FONT_FAMILY"
            font-size="12"
            font-weight="700"
            fill="#0f172a"
            text-anchor="middle"
          >
            {{ actor.label }}
          </text>
          <text
            :x="layout.actorCenters[actor.id]"
            :y="layout.actorBoxY + 34"
            :font-family="SVG_FONT_FAMILY"
            font-size="10"
            font-weight="500"
            fill="#475569"
            text-anchor="middle"
          >
            {{ actor.sublabel }}
          </text>

          <rect
            :x="layout.actorCenters[actor.id] - layout.actorBoxWidth / 2"
            :y="layout.footerY"
            :width="layout.actorBoxWidth"
            :height="layout.actorBoxHeight"
            rx="10"
            :fill="actor.bg"
            :stroke="actor.border"
            stroke-width="1.4"
          />
          <text
            :x="layout.actorCenters[actor.id]"
            :y="layout.footerY + 19"
            :font-family="SVG_FONT_FAMILY"
            font-size="12"
            font-weight="700"
            fill="#0f172a"
            text-anchor="middle"
          >
            {{ actor.label }}
          </text>
          <text
            :x="layout.actorCenters[actor.id]"
            :y="layout.footerY + 34"
            :font-family="SVG_FONT_FAMILY"
            font-size="10"
            font-weight="500"
            fill="#475569"
            text-anchor="middle"
          >
            {{ actor.sublabel }}
          </text>
        </g>

        <!-- Sequence Rows -->
        <g
          v-for="row in layout.rows"
          :key="row.message.id"
          :ref="(el) => setRowRef(el, row.message.stepIndex)"
          class="cursor-pointer transition-opacity"
          @click="emit('selectStep', row.message.stepIndex)"
        >
          <rect
            x="16"
            :y="row.y - 27"
            :width="layout.width - 32"
            height="50"
            rx="10"
            :fill="row.message.stepIndex === props.activeStepIndex ? '#dbeafe' : 'transparent'"
            :fill-opacity="row.message.stepIndex === props.activeStepIndex ? 0.55 : 0"
            :stroke="row.message.stepIndex === props.activeStepIndex ? '#60a5fa' : 'transparent'"
            stroke-width="1"
          />

          <template v-if="row.selfCall">
            <path
              :d="row.selfCall.loopPath"
              fill="none"
              :stroke="row.message.stepIndex === props.activeStepIndex ? '#2563eb' : '#334155'"
              :stroke-width="row.message.stepIndex === props.activeStepIndex ? 2.4 : 1.7"
              :marker-end="
                row.message.stepIndex === props.activeStepIndex
                  ? 'url(#ui-seq-active)'
                  : 'url(#ui-seq-solid)'
              "
            />
            <rect
              :x="row.selfCall.boxX"
              :y="row.selfCall.boxY"
              :width="row.selfCall.boxWidth"
              :height="row.selfCall.boxHeight"
              rx="7"
              :fill="row.message.stepIndex === props.activeStepIndex ? '#eff6ff' : '#ffffff'"
              fill-opacity="0.96"
              :stroke="row.message.stepIndex === props.activeStepIndex ? '#93c5fd' : '#e2e8f0'"
              stroke-width="1"
            />
            <text
              :x="row.selfCall.textX"
              :y="row.selfCall.titleY"
              :font-family="SVG_FONT_FAMILY"
              font-size="11.5"
              font-weight="700"
              :fill="row.message.stepIndex === props.activeStepIndex ? '#1d4ed8' : '#0f172a'"
            >
              {{ row.titleLine }}
            </text>
            <text
              v-if="row.subtitleLine"
              :x="row.selfCall.textX"
              :y="row.selfCall.subtitleY"
              :font-family="SVG_FONT_FAMILY"
              font-size="10"
              font-weight="500"
              fill="#475569"
            >
              {{ row.subtitleLine }}
            </text>
          </template>

          <template v-else-if="row.crossLabel">
            <line
              :x1="row.fromX"
              :y1="row.y"
              :x2="row.toX - row.direction * 4"
              :y2="row.y"
              :stroke="
                row.message.stepIndex === props.activeStepIndex
                  ? '#2563eb'
                  : row.message.dashed
                    ? '#0891b2'
                    : '#334155'
              "
              :stroke-width="row.message.stepIndex === props.activeStepIndex ? 2.5 : 1.8"
              :stroke-dasharray="row.message.dashed ? '6 4' : undefined"
              :marker-end="
                row.message.stepIndex === props.activeStepIndex
                  ? 'url(#ui-seq-active)'
                  : row.message.dashed
                    ? 'url(#ui-seq-dashed)'
                    : 'url(#ui-seq-solid)'
              "
            />
            <circle
              :cx="row.fromX"
              :cy="row.y"
              r="3.5"
              :fill="
                row.message.stepIndex === props.activeStepIndex
                  ? '#2563eb'
                  : row.message.dashed
                    ? '#0891b2'
                    : '#334155'
              "
            />
            <rect
              :x="row.crossLabel.boxX"
              :y="row.crossLabel.titleBoxY"
              :width="row.crossLabel.boxWidth"
              height="17"
              rx="4"
              :fill="row.message.stepIndex === props.activeStepIndex ? '#e6f0fe' : '#f8fafc'"
              fill-opacity="0.92"
            />
            <text
              :x="row.crossLabel.midX"
              :y="row.y - 9"
              :font-family="SVG_FONT_FAMILY"
              font-size="11.5"
              font-weight="700"
              :fill="row.message.stepIndex === props.activeStepIndex ? '#1d4ed8' : '#0f172a'"
              text-anchor="middle"
            >
              {{ row.titleLine }}
            </text>
            <rect
              v-if="row.subtitleLine"
              :x="row.crossLabel.boxX"
              :y="row.crossLabel.subtitleBoxY"
              :width="row.crossLabel.boxWidth"
              height="15"
              rx="4"
              :fill="row.message.stepIndex === props.activeStepIndex ? '#e6f0fe' : '#f8fafc'"
              fill-opacity="0.92"
            />
            <text
              v-if="row.subtitleLine"
              :x="row.crossLabel.midX"
              :y="row.y + 14"
              :font-family="SVG_FONT_FAMILY"
              font-size="10"
              font-weight="500"
              fill="#475569"
              text-anchor="middle"
            >
              {{ row.subtitleLine }}
            </text>
          </template>
        </g>
      </svg>
    </div>
  </div>
</template>
