<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import {
  computeActivityDiagramLayout,
  type ActivityAltLayoutItem,
  type ScenarioStep,
  type ScenarioTimelineModel,
} from '../core/scenarioFlowEngine';
import { NODE_KIND_STYLE_META, SVG_FONT_FAMILY } from '../core/svgHelpers';

const props = defineProps<{
  model: ScenarioTimelineModel;
  activeStepIndex: number;
}>();

const emit = defineEmits<{
  selectStep: [index: number];
  switchScenario: [scenarioId: string];
  jumpToNode: [nodeId: string];
}>();

const enableTechMode = __ENABLE_TECH_MODE__;
const nodeRefs = ref<Record<number, SVGGElement | null>>({});

const setNodeRef = (el: unknown, stepIndex: number) => {
  if (el instanceof SVGGElement) {
    nodeRefs.value[stepIndex] = el;
  }
};

const layout = computed(() => computeActivityDiagramLayout(props.model));
const isTechView = computed(() => enableTechMode && props.model.mode === 'tech');

const stepPlatformTag = (step: ScenarioStep): string | null => {
  if (!isTechView.value) return null;
  if (step.platformTag === 'ios') return 'iOS';
  if (step.platformTag === 'android') return 'AND';
  return step.hasPlatformDiff ? '≠' : null;
};

const handleAltClick = (alt: ActivityAltLayoutItem) => {
  if (alt.branch.targetScenarioId) {
    emit('switchScenario', alt.branch.targetScenarioId);
    return;
  }
  if (alt.branch.targetStepIndex !== undefined) {
    emit('selectStep', alt.branch.targetStepIndex);
    return;
  }
  emit('jumpToNode', alt.branch.targetNodeId);
};

watch(
  () => [props.model.scenarioId, props.model.mode],
  () => {
    nodeRefs.value = {};
  },
);

watch(
  () => props.activeStepIndex,
  async (idx) => {
    await nextTick();
    nodeRefs.value[idx]?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  },
);
</script>

<template>
  <div v-if="props.model.steps.length === 0" class="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
    Kịch bản này hiện không có bước hiển thị trong chế độ đang chọn.
  </div>

  <div v-else class="vbot-svg-stage overflow-x-auto p-2.5 shadow-2xs">
    <svg
      :viewBox="`0 ${layout.headerHeight} ${layout.width} ${layout.height - layout.headerHeight}`"
      :style="{ maxWidth: `${layout.width}px` }"
      class="mx-auto block h-auto w-full min-w-[540px] select-none"
    >
      <defs>
        <marker
          id="ui-act-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#2563eb" />
        </marker>
        <marker
          id="ui-act-alt-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5.5"
          markerHeight="5.5"
          orient="auto"
        >
          <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#94a3b8" />
        </marker>
      </defs>

      <!-- Swimlanes Frame -->
      <rect
        :x="layout.swimlanesX"
        :y="layout.swimlaneTopY"
        :width="layout.swimlanesWidth"
        :height="layout.swimlaneBottomY - layout.swimlaneTopY"
        rx="12"
        fill="#ffffff"
        stroke="#cbd5e1"
        stroke-width="1.2"
      />

      <g v-for="(lane, idx) in layout.lanes" :key="lane.role">
        <rect
          :x="lane.x"
          :y="layout.swimlaneTopY"
          :width="lane.width"
          :height="layout.swimlaneHeaderH"
          :fill="lane.fill"
        />
        <rect
          :x="lane.x"
          :y="layout.swimlaneTopY + layout.swimlaneHeaderH"
          :width="lane.width"
          :height="layout.swimlaneBottomY - layout.swimlaneTopY - layout.swimlaneHeaderH"
          :fill="idx % 2 === 1 ? '#f8fafc' : '#ffffff'"
          fill-opacity="0.7"
        />
        <text
          :x="lane.centerX"
          :y="layout.swimlaneTopY + 22"
          :font-family="SVG_FONT_FAMILY"
          font-size="11.5"
          font-weight="700"
          :fill="lane.textFill"
          text-anchor="middle"
        >
          {{ lane.label }}
        </text>
        <line
          v-if="idx > 0"
          :x1="lane.x"
          :y1="layout.swimlaneTopY"
          :x2="lane.x"
          :y2="layout.swimlaneBottomY"
          stroke="#e2e8f0"
          stroke-width="1.2"
          stroke-dasharray="4 4"
        />
      </g>

      <line
        :x1="layout.swimlanesX"
        :y1="layout.swimlaneTopY + layout.swimlaneHeaderH"
        :x2="layout.swimlanesX + layout.swimlanesWidth"
        :y2="layout.swimlaneTopY + layout.swimlaneHeaderH"
        stroke="#cbd5e1"
        stroke-width="1"
      />

      <!-- Alternative Branches Rail -->
      <g v-if="layout.hasAltRail">
        <rect
          :x="layout.altRailX"
          :y="layout.swimlaneTopY"
          :width="layout.altRailWidth"
          :height="layout.swimlaneBottomY - layout.swimlaneTopY"
          rx="12"
          fill="#f8fafc"
          stroke="#cbd5e1"
          stroke-width="1.2"
          stroke-dasharray="5 4"
        />
        <text
          :x="layout.altRailX + layout.altRailWidth / 2"
          :y="layout.swimlaneTopY + 22"
          :font-family="SVG_FONT_FAMILY"
          font-size="11"
          font-weight="700"
          fill="#475569"
          text-anchor="middle"
        >
          Nhánh rẽ khác
        </text>
        <line
          :x1="layout.altRailX"
          :y1="layout.swimlaneTopY + layout.swimlaneHeaderH"
          :x2="layout.altRailX + layout.altRailWidth"
          :y2="layout.swimlaneTopY + layout.swimlaneHeaderH"
          stroke="#e2e8f0"
          stroke-width="1"
          stroke-dasharray="4 4"
        />
      </g>

      <!-- UML Initial Node -->
      <g v-if="layout.startNode">
        <circle
          :cx="layout.startNode.cx"
          :cy="layout.startNode.cy"
          r="11"
          fill="#e2e8f0"
        />
        <circle
          :cx="layout.startNode.cx"
          :cy="layout.startNode.cy"
          r="7.5"
          fill="#0f172a"
        />
        <text
          :x="layout.startNode.cx + 16"
          :y="layout.startNode.cy + 4"
          :font-family="SVG_FONT_FAMILY"
          font-size="10.5"
          font-weight="700"
          fill="#334155"
        >
          Bắt đầu
        </text>
        <line
          :x1="layout.startNode.cx"
          :y1="layout.startNode.cy + 11"
          :x2="layout.startNode.cx"
          :y2="layout.startNode.arrowEndY"
          stroke="#2563eb"
          stroke-width="2"
          marker-end="url(#ui-act-arrow)"
        />
      </g>

      <!-- UML Final Node -->
      <g v-if="layout.endNode">
        <line
          :x1="layout.endNode.cx"
          :y1="layout.endNode.arrowStartY"
          :x2="layout.endNode.cx"
          :y2="layout.endNode.cy - 14"
          stroke="#2563eb"
          stroke-width="2"
          marker-end="url(#ui-act-arrow)"
        />
        <circle
          :cx="layout.endNode.cx"
          :cy="layout.endNode.cy"
          r="10"
          fill="#ffffff"
          :stroke="layout.endNode.isError ? '#e11d48' : '#0f172a'"
          stroke-width="2"
        />
        <circle
          :cx="layout.endNode.cx"
          :cy="layout.endNode.cy"
          r="5.5"
          :fill="layout.endNode.isError ? '#e11d48' : '#0f172a'"
        />
        <text
          :x="layout.endNode.cx + 15"
          :y="layout.endNode.cy + 4"
          :font-family="SVG_FONT_FAMILY"
          font-size="10.5"
          font-weight="700"
          :fill="layout.endNode.isError ? '#e11d48' : '#0f172a'"
        >
          {{ layout.endNode.label }}
        </text>
      </g>

      <!-- Connectors between steps -->
      <g v-for="conn in layout.connectors" :key="conn.id">
        <path
          :d="conn.path"
          fill="none"
          stroke="#2563eb"
          stroke-width="2"
          stroke-linejoin="round"
          marker-end="url(#ui-act-arrow)"
        />
        <template
          v-if="
            conn.labelText &&
            conn.labelX !== undefined &&
            conn.labelY !== undefined &&
            conn.labelPillW !== undefined
          "
        >
          <rect
            :x="conn.labelX - conn.labelPillW / 2"
            :y="conn.labelY - 10"
            :width="conn.labelPillW"
            height="20"
            rx="10"
            fill="#ffffff"
            :stroke="conn.fromStepIndex === props.activeStepIndex ? '#2563eb' : '#93c5fd'"
            :stroke-width="conn.fromStepIndex === props.activeStepIndex ? 1.5 : 1.1"
          />
          <text
            :x="conn.labelX"
            :y="conn.labelY + 3.5"
            :font-family="SVG_FONT_FAMILY"
            font-size="10"
            font-weight="600"
            fill="#1e40af"
            text-anchor="middle"
          >
            {{ conn.labelText }}
          </text>
        </template>
      </g>

      <!-- Activity Nodes & Alternative Branches -->
      <g v-for="item in layout.nodes" :key="item.step.node.id">
        <!-- Interactive Activity Box / Decision Diamond -->
        <g
          :ref="(el) => setNodeRef(el, item.step.index)"
          class="cursor-pointer transition-opacity"
          :opacity="
            item.step.index === props.activeStepIndex
              ? 1
              : item.step.index < props.activeStepIndex
                ? 0.92
                : 0.85
          "
          @click="emit('selectStep', item.step.index)"
        >
          <title>{{ `Bước ${item.step.stepNumber}: ${item.step.displayLabel}\n${item.step.summaryText}` }}</title>

          <template v-if="item.isDecision && item.diamondPoints">
            <polygon
              :points="item.diamondPoints"
              :fill="item.step.index === props.activeStepIndex ? '#fef3c7' : '#fffbeb'"
              :stroke="item.step.index === props.activeStepIndex ? '#2563eb' : '#f59e0b'"
              :stroke-width="item.step.index === props.activeStepIndex ? 2.4 : 1.7"
              :stroke-dasharray="item.step.index === props.activeStepIndex ? undefined : '5 3'"
            />
            <circle
              :cx="item.cx"
              :cy="item.y + 15"
              r="9"
              :fill="item.step.index === props.activeStepIndex ? '#2563eb' : '#f59e0b'"
            />
            <text
              :x="item.cx"
              :y="item.y + 18.5"
              :font-family="SVG_FONT_FAMILY"
              font-size="9.5"
              font-weight="700"
              fill="#ffffff"
              text-anchor="middle"
            >
              {{ item.step.stepNumber }}
            </text>
            <text
              v-for="(line, lIdx) in item.titleLines"
              :key="lIdx"
              :x="item.cx"
              :y="item.titleLines.length === 1 ? item.cy + 6 : item.cy + 1 + lIdx * 13"
              :font-family="SVG_FONT_FAMILY"
              :font-size="item.titleLines.length === 1 ? 10.5 : 10"
              font-weight="700"
              fill="#0f172a"
              text-anchor="middle"
            >
              {{ line }}
            </text>
          </template>

          <template v-else>
            <rect
              v-if="item.step.index === props.activeStepIndex"
              :x="item.x - 3"
              :y="item.y - 3"
              :width="item.width + 6"
              :height="item.height + 6"
              rx="16"
              fill="none"
              stroke="#93c5fd"
              stroke-width="2"
            />
            <rect
              :x="item.x"
              :y="item.y"
              :width="item.width"
              :height="item.height"
              rx="14"
              :fill="NODE_KIND_STYLE_META[item.step.kind].fill"
              :stroke="
                item.step.index === props.activeStepIndex
                  ? '#2563eb'
                  : NODE_KIND_STYLE_META[item.step.kind].stroke
              "
              :stroke-width="item.step.index === props.activeStepIndex ? 2.3 : 1.5"
            />
            <circle
              :cx="item.x + 18"
              :cy="item.cy"
              r="10"
              :fill="item.step.index === props.activeStepIndex ? '#2563eb' : '#1e293b'"
            />
            <text
              :x="item.x + 18"
              :y="item.cy + 3.5"
              :font-family="SVG_FONT_FAMILY"
              font-size="10"
              font-weight="700"
              fill="#ffffff"
              text-anchor="middle"
            >
              {{ item.step.stepNumber }}
            </text>
            <text
              v-for="(line, lIdx) in item.titleLines"
              :key="lIdx"
              :x="item.x + 34"
              :y="item.titleLines.length === 1 ? item.cy + 4 : item.cy - 3 + lIdx * 14"
              :font-family="SVG_FONT_FAMILY"
              :font-size="item.titleLines.length === 1 ? 11 : 10.5"
              font-weight="700"
              fill="#0f172a"
            >
              {{ line }}
            </text>
          </template>

          <template v-if="isTechView && stepPlatformTag(item.step)">
            <rect
              :x="item.x + item.width - (stepPlatformTag(item.step)!.length > 1 ? 32 : 20)"
              :y="item.y - 7"
              :width="stepPlatformTag(item.step)!.length > 1 ? 28 : 16"
              height="14"
              rx="7"
              fill="#fef3c7"
              stroke="#f59e0b"
              stroke-width="1"
            />
            <text
              :x="item.x + item.width - (stepPlatformTag(item.step)!.length > 1 ? 18 : 12)"
              :y="item.y + 3"
              :font-family="SVG_FONT_FAMILY"
              font-size="8.5"
              font-weight="700"
              fill="#92400e"
              text-anchor="middle"
            >
              {{ stepPlatformTag(item.step) }}
            </text>
          </template>
        </g>

        <!-- Clickable Alternative Branches in Side Rail -->
        <g
          v-for="alt in item.altItems"
          :key="alt.branch.edgeId"
          class="cursor-pointer group/svg-alt"
          @click="handleAltClick(alt)"
        >
          <title>{{ `${alt.guardText} → ${alt.branch.targetLabel} (${alt.actionText})` }}</title>
          <path
            :d="alt.path"
            fill="none"
            stroke="#94a3b8"
            stroke-width="1.4"
            stroke-dasharray="4 3"
            marker-end="url(#ui-act-alt-arrow)"
          />
          <rect
            :x="alt.boxX"
            :y="alt.boxY"
            :width="alt.boxWidth"
            :height="alt.boxHeight"
            rx="8"
            fill="#ffffff"
            stroke="#cbd5e1"
            stroke-width="1.1"
            stroke-dasharray="4 3"
          />
          <circle
            :cx="alt.boxX + 10"
            :cy="alt.boxY + 14"
            r="3"
            :fill="NODE_KIND_STYLE_META[alt.branch.targetKind].badgeBg"
          />
          <text
            :x="alt.boxX + 18"
            :y="alt.boxY + 17"
            :font-family="SVG_FONT_FAMILY"
            font-size="9.5"
            font-weight="700"
            fill="#b45309"
          >
            {{ alt.guardText }}
          </text>
          <text
            :x="alt.boxX + 10"
            :y="alt.boxY + 33"
            :font-family="SVG_FONT_FAMILY"
            font-size="10"
            font-weight="600"
            fill="#334155"
          >
            {{ alt.targetText }}
          </text>
        </g>
      </g>
    </svg>
  </div>
</template>
