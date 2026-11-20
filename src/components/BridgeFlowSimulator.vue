<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  ExternalLink,
  Gauge,
  Pause,
  Play,
  Radio,
  Server,
  Smartphone,
} from 'lucide-vue-next';
import { copyTextToClipboard } from '../core/downloadHelper';
import { SVG_FONT_FAMILY, wrapSvgText } from '../core/svgHelpers';
import {
  BRIDGE_LANE_META,
  type BridgeInteractiveFlow,
  type BridgeLaneId,
  type BridgeStepPhase,
  type BridgeTraceStep,
} from '../data/miniAppBridgeCatalog';
import type { PlatformViewMode } from '../data/schema';

const props = defineProps<{
  flows: BridgeInteractiveFlow[];
  selectedFlowId: string;
  selectedSubFlowId?: string;
  platformMode: PlatformViewMode;
}>();

const emit = defineEmits<{
  selectFlow: [flowId: string];
  selectSubFlow: [subFlowId: string];
  jumpNode: [nodeId: string];
}>();

const activeStepIndex = ref(0);
const isPlaying = ref(false);
const fastSpeed = ref(false);
const copiedKey = ref<string | null>(null);
const rowRefs = ref<Record<number, SVGGElement | null>>({});
let playTimer: ReturnType<typeof setInterval> | null = null;
let copyResetTimer: ReturnType<typeof setTimeout> | null = null;

const setRowRef = (el: unknown, stepIndex: number) => {
  if (el instanceof SVGGElement) {
    rowRefs.value[stepIndex] = el;
  }
};

const currentFlow = computed<BridgeInteractiveFlow | null>(
  () =>
    props.flows.find((f) => f.id === props.selectedFlowId) ?? props.flows[0] ?? null,
);

const subFlows = computed(() => currentFlow.value?.subFlows ?? []);
const currentSubFlow = computed(
  () =>
    subFlows.value.find((sf) => sf.id === props.selectedSubFlowId) ??
    subFlows.value[0] ??
    null,
);

const steps = computed<BridgeTraceStep[]>(
  () => currentSubFlow.value?.steps ?? currentFlow.value?.steps ?? [],
);
const currentStep = computed<BridgeTraceStep | null>(
  () => steps.value[activeStepIndex.value] ?? steps.value[0] ?? null,
);
const activeSummary = computed(
  () => currentSubFlow.value?.summary ?? currentFlow.value?.summary ?? '',
);
const activeRelatedNodeId = computed(
  () => currentSubFlow.value?.relatedNodeId ?? currentFlow.value?.relatedNodeId,
);

const PHASE_META: Record<BridgeStepPhase, { label: string; cls: string; dotColor: string }> = {
  miniapp_call: {
    label: 'Mini App gọi SDK',
    cls: 'border-cyan-200 bg-cyan-50 text-cyan-800',
    dotColor: '#0891b2',
  },
  sdk_bridge: {
    label: 'Cầu nối VbMaSDK',
    cls: 'border-indigo-200 bg-indigo-50 text-indigo-800',
    dotColor: '#4f46e5',
  },
  host_process: {
    label: 'Host Native xử lý',
    cls: 'border-blue-200 bg-blue-50 text-blue-800',
    dotColor: '#2563eb',
  },
  server_os: {
    label: 'Server / SIP / OS',
    cls: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    dotColor: '#059669',
  },
  host_reply: {
    label: 'Host trả kết quả',
    cls: 'border-violet-200 bg-violet-50 text-violet-800',
    dotColor: '#7c3aed',
  },
  host_push: {
    label: 'Host đẩy sự kiện',
    cls: 'border-amber-200 bg-amber-50 text-amber-800',
    dotColor: '#d97706',
  },
};

const LANE_CENTER: Record<BridgeLaneId, number> = {
  miniapp: 104,
  sdk: 308,
  host: 512,
  server: 716,
};

const svgLayout = computed(() => {
  const width = 820;
  const headerBoxY = 12;
  const boxW = 176;
  const boxH = 44;
  const lifelineStartY = headerBoxY + boxH;
  const firstRowOffset = 46;
  const rowHeight = 66;
  const count = Math.max(1, steps.value.length);
  const footerY = lifelineStartY + firstRowOffset + (count - 1) * rowHeight + 36;
  const height = footerY + boxH + 14;

  const rows = steps.value.map((step, idx) => {
    const y = lifelineStartY + firstRowOffset + idx * rowHeight;
    const fromX = LANE_CENTER[step.from];
    const toX = LANE_CENTER[step.to];
    const isSelf = step.from === step.to;

    if (isSelf) {
      const goLeft = step.from === 'server';
      const loopW = 34;
      const d = goLeft
        ? `M ${fromX} ${y - 10} L ${fromX - loopW} ${y - 10} L ${fromX - loopW} ${y + 12} L ${fromX - 5} ${y + 12}`
        : `M ${fromX} ${y - 10} L ${fromX + loopW} ${y - 10} L ${fromX + loopW} ${y + 12} L ${fromX + 5} ${y + 12}`;
      const text = `#${step.stepNumber} ${wrapSvgText(step.arrowLabel, 34, 1)[0] ?? ''}`;
      const pillW = Math.min(246, Math.max(140, Math.ceil(text.length * 5.8 + 18)));
      const boxX = goLeft ? fromX - loopW - 8 - pillW : fromX + loopW + 8;
      return {
        step,
        idx,
        y,
        fromX,
        toX,
        isSelf: true,
        pathD: d,
        labelText: text,
        pillX: boxX,
        pillY: y - 12,
        pillW,
        textX: boxX + pillW / 2,
        textY: y + 3,
      };
    }

    const dir = toX > fromX ? 1 : -1;
    const targetX = toX - dir * 5;
    const d = `M ${fromX} ${y} L ${targetX} ${y}`;
    const span = Math.abs(toX - fromX);
    const maxChars = Math.max(24, Math.floor((span - 24) / 5.7));
    const text = `#${step.stepNumber} ${wrapSvgText(step.arrowLabel, maxChars, 1)[0] ?? ''}`;
    const pillW = Math.min(span - 14, Math.max(120, Math.ceil(text.length * 5.7 + 20)));
    const midX = (fromX + toX) / 2;
    return {
      step,
      idx,
      y,
      fromX,
      toX,
      targetX,
      isSelf: false,
      pathD: d,
      labelText: text,
      pillX: midX - pillW / 2,
      pillY: y - 24,
      pillW,
      textX: midX,
      textY: y - 10.5,
    };
  });

  return {
    width,
    height,
    headerBoxY,
    boxW,
    boxH,
    lifelineStartY,
    footerY,
    rows,
  };
});

const stopAutoPlay = () => {
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
  }
  isPlaying.value = false;
};

const startAutoPlay = () => {
  if (steps.value.length <= 1) return;
  if (activeStepIndex.value >= steps.value.length - 1) {
    activeStepIndex.value = 0;
  }
  stopAutoPlay();
  isPlaying.value = true;
  playTimer = setInterval(() => {
    if (activeStepIndex.value >= steps.value.length - 1) {
      stopAutoPlay();
      return;
    }
    activeStepIndex.value += 1;
  }, fastSpeed.value ? 1400 : 2400);
};

const toggleAutoPlay = () => {
  if (isPlaying.value) {
    stopAutoPlay();
  } else {
    startAutoPlay();
  }
};

const toggleSpeed = () => {
  fastSpeed.value = !fastSpeed.value;
  if (isPlaying.value) {
    startAutoPlay();
  }
};

const selectStep = (idx: number) => {
  stopAutoPlay();
  activeStepIndex.value = Math.max(0, Math.min(idx, steps.value.length - 1));
};

const stepDelta = (delta: 1 | -1) => {
  selectStep(activeStepIndex.value + delta);
};

const copyValue = async (key: string, value: string) => {
  const ok = await copyTextToClipboard(value);
  if (ok) {
    copiedKey.value = key;
    if (copyResetTimer) clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(() => {
      copiedKey.value = null;
    }, 1500);
  }
};

watch(
  [() => props.selectedFlowId, () => props.selectedSubFlowId],
  () => {
    stopAutoPlay();
    activeStepIndex.value = 0;
    rowRefs.value = {};
  },
);

watch(
  () => activeStepIndex.value,
  async (idx) => {
    await nextTick();
    rowRefs.value[idx]?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  },
);

onBeforeUnmount(() => {
  stopAutoPlay();
  if (copyResetTimer) clearTimeout(copyResetTimer);
});
</script>

<template>
  <div v-if="currentFlow" class="flex h-full min-h-0 flex-col">
    <!-- Flow Selector Bar -->
    <div class="border-b border-slate-200 bg-slate-50/70 px-4 py-2.5">
      <div class="flex flex-wrap items-center gap-1.5">
        <button
          v-for="flow in props.flows"
          :key="flow.id"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-xs font-semibold transition"
          :class="
            flow.id === currentFlow.id
              ? 'border-indigo-500 bg-indigo-600 text-white shadow-xs'
              : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-200 hover:bg-indigo-50/60'
          "
          @click="emit('selectFlow', flow.id)"
        >
          <span>{{ flow.shortTitle }}</span>
          <span
            v-if="flow.subFlows?.length"
            class="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
            :class="
              flow.id === currentFlow.id
                ? 'bg-indigo-500 text-white'
                : 'bg-cyan-50 text-cyan-700'
            "
          >
            {{ flow.subFlows.length }} sơ đồ
          </span>
        </button>
      </div>

      <!-- Sub-Flow / Event Selector row -->
      <div
        v-if="subFlows.length > 0"
        class="mt-2 flex flex-wrap items-center gap-1.5 rounded-xl border border-cyan-100 bg-cyan-50/50 px-2.5 py-2"
      >
        <span class="mr-1 text-[11px] font-bold text-cyan-900">
          Sơ đồ theo sự kiện ({{ subFlows.length }}):
        </span>
        <button
          v-for="sf in subFlows"
          :key="sf.id"
          type="button"
          class="rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition"
          :class="
            currentSubFlow?.id === sf.id
              ? 'border-cyan-600 bg-cyan-600 text-white shadow-xs'
              : 'border-cyan-200 bg-white text-cyan-800 hover:border-cyan-300 hover:bg-cyan-50'
          "
          @click="emit('selectSubFlow', sf.id)"
        >
          {{ sf.label }}
        </button>
      </div>

      <div class="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="text-sm font-bold text-slate-900">
              {{ currentFlow.title }}
            </h3>
            <span class="rounded-md border border-cyan-200 bg-cyan-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-cyan-800">
              {{ currentFlow.miniAppId }}
            </span>
            <span
              v-if="currentSubFlow"
              class="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-indigo-700"
            >
              {{ currentSubFlow.eventBadge }}
            </span>
            <span class="rounded-md bg-slate-200/70 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
              {{ currentFlow.categoryBadge }}
            </span>
          </div>
          <p class="mt-0.5 text-xs text-slate-600">
            {{ activeSummary }}
          </p>
        </div>

        <button
          v-if="activeRelatedNodeId"
          type="button"
          class="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
          @click="emit('jumpNode', activeRelatedNodeId)"
        >
          Xem node trên sơ đồ
          <ExternalLink class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>

    <!-- Stepper Controls -->
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2">
      <div class="flex flex-wrap items-center gap-2">
        <div class="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          <button
            type="button"
            aria-label="Bước trước"
            :disabled="activeStepIndex <= 0"
            class="rounded-md p-1 text-slate-600 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-35"
            @click="stepDelta(-1)"
          >
            <ChevronLeft class="h-4 w-4" />
          </button>
          <span class="px-2.5 text-xs font-bold text-slate-800">
            Bước {{ activeStepIndex + 1 }} / {{ steps.length }}
          </span>
          <button
            type="button"
            aria-label="Bước kế tiếp"
            :disabled="activeStepIndex >= steps.length - 1"
            class="rounded-md p-1 text-slate-600 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-35"
            @click="stepDelta(1)"
          >
            <ChevronRight class="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-semibold transition"
          :class="
            isPlaying
              ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
              : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
          "
          @click="toggleAutoPlay"
        >
          <Pause v-if="isPlaying" class="h-3.5 w-3.5" />
          <Play v-else class="h-3.5 w-3.5" />
          {{ isPlaying ? 'Tạm dừng' : 'Chạy thử tự động' }}
        </button>

        <button
          type="button"
          title="Đổi tốc độ tự chạy"
          class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
          @click="toggleSpeed"
        >
          <Gauge class="h-3 w-3" />
          {{ fastSpeed ? '1.4s/bước' : '2.4s/bước' }}
        </button>
      </div>

      <div class="hidden items-center gap-1 sm:flex">
        <button
          v-for="(st, idx) in steps"
          :key="st.stepNumber"
          type="button"
          :title="`Bước ${st.stepNumber}: ${st.title}`"
          class="h-2.5 rounded-full transition-all"
          :class="
            idx === activeStepIndex
              ? 'w-7 bg-indigo-600'
              : idx < activeStepIndex
                ? 'w-2.5 bg-indigo-300 hover:bg-indigo-400'
                : 'w-2.5 bg-slate-200 hover:bg-slate-300'
          "
          @click="selectStep(idx)"
        />
      </div>
    </div>

    <!-- Main 2-Column Simulator Area -->
    <div class="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
      <!-- Left: Interactive Animated 4-Lane Swimlane Diagram -->
      <div class="min-h-0 overflow-y-auto bg-slate-50/70 p-3.5 lg:border-r lg:border-slate-200">
        <div class="mb-2.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600">
          <div class="flex flex-wrap items-center gap-3">
            <span class="inline-flex items-center gap-1.5">
              <span class="inline-block h-0.5 w-5 bg-slate-700" />
              Gọi lệnh / Xử lý đi
            </span>
            <span class="inline-flex items-center gap-1.5">
              <span class="inline-block h-0.5 w-5 border-t-2 border-dashed border-cyan-600" />
              Phản hồi / Host đẩy event
            </span>
          </div>
          <span class="font-medium text-indigo-700">
            Nhấp hàng trên sơ đồ để xem Code & JSON bước đó
          </span>
        </div>

        <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 shadow-2xs">
          <svg
            :viewBox="`0 0 ${svgLayout.width} ${svgLayout.height}`"
            :style="{ maxWidth: `${svgLayout.width}px` }"
            class="mx-auto block h-auto w-full min-w-[540px] select-none"
          >
            <defs>
              <marker
                id="sim-arrow-solid"
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
                id="sim-arrow-dashed"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto"
              >
                <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#0891b2" />
              </marker>
              <marker
                id="sim-arrow-active"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6.5"
                markerHeight="6.5"
                orient="auto"
              >
                <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#4f46e5" />
              </marker>
            </defs>

            <!-- 4 Lifelines & Header/Footer Actor Boxes -->
            <g v-for="lane in BRIDGE_LANE_META" :key="lane.id">
              <line
                :x1="LANE_CENTER[lane.id]"
                :y1="svgLayout.lifelineStartY"
                :x2="LANE_CENTER[lane.id]"
                :y2="svgLayout.footerY"
                stroke="#cbd5e1"
                stroke-width="1.5"
                stroke-dasharray="5 5"
              />
              <rect
                :x="LANE_CENTER[lane.id] - svgLayout.boxW / 2"
                :y="svgLayout.headerBoxY"
                :width="svgLayout.boxW"
                :height="svgLayout.boxH"
                rx="10"
                :fill="lane.bg"
                :stroke="lane.border"
                stroke-width="1.4"
              />
              <text
                :x="LANE_CENTER[lane.id]"
                :y="svgLayout.headerBoxY + 19"
                :font-family="SVG_FONT_FAMILY"
                font-size="11.5"
                font-weight="700"
                fill="#0f172a"
                text-anchor="middle"
              >
                {{ lane.label }}
              </text>
              <text
                :x="LANE_CENTER[lane.id]"
                :y="svgLayout.headerBoxY + 34"
                :font-family="SVG_FONT_FAMILY"
                font-size="9.5"
                font-weight="500"
                :fill="lane.accent"
                text-anchor="middle"
              >
                {{ lane.sublabel }}
              </text>

              <rect
                :x="LANE_CENTER[lane.id] - svgLayout.boxW / 2"
                :y="svgLayout.footerY"
                :width="svgLayout.boxW"
                :height="svgLayout.boxH"
                rx="10"
                :fill="lane.bg"
                :stroke="lane.border"
                stroke-width="1.4"
              />
              <text
                :x="LANE_CENTER[lane.id]"
                :y="svgLayout.footerY + 19"
                :font-family="SVG_FONT_FAMILY"
                font-size="11.5"
                font-weight="700"
                fill="#0f172a"
                text-anchor="middle"
              >
                {{ lane.label }}
              </text>
              <text
                :x="LANE_CENTER[lane.id]"
                :y="svgLayout.footerY + 34"
                :font-family="SVG_FONT_FAMILY"
                font-size="9.5"
                font-weight="500"
                :fill="lane.accent"
                text-anchor="middle"
              >
                {{ lane.sublabel }}
              </text>
            </g>

            <!-- Interactive Step Message Rows -->
            <g
              v-for="row in svgLayout.rows"
              :key="`${currentFlow.id}-${row.step.stepNumber}`"
              :ref="(el) => setRowRef(el, row.idx)"
              class="cursor-pointer transition-opacity"
              :opacity="row.idx <= activeStepIndex ? 1 : 0.72"
              @click="selectStep(row.idx)"
            >
              <title>{{ `Bước ${row.step.stepNumber}: ${row.step.title}` }}</title>

              <rect
                x="14"
                :y="row.y - 31"
                :width="svgLayout.width - 28"
                height="56"
                rx="10"
                :fill="row.idx === activeStepIndex ? '#eef2ff' : 'transparent'"
                :stroke="row.idx === activeStepIndex ? '#6366f1' : 'transparent'"
                stroke-width="1.2"
              />

              <path
                :d="row.pathD"
                fill="none"
                :stroke="
                  row.idx === activeStepIndex
                    ? '#4f46e5'
                    : row.step.dashed
                      ? '#0891b2'
                      : '#334155'
                "
                :stroke-width="row.idx === activeStepIndex ? 2.5 : 1.7"
                :stroke-dasharray="row.step.dashed ? '6 4' : undefined"
                :marker-end="
                  row.idx === activeStepIndex
                    ? 'url(#sim-arrow-active)'
                    : row.step.dashed
                      ? 'url(#sim-arrow-dashed)'
                      : 'url(#sim-arrow-solid)'
                "
              />

              <circle
                v-if="!row.isSelf"
                :cx="row.fromX"
                :cy="row.y"
                r="3.5"
                :fill="
                  row.idx === activeStepIndex
                    ? '#4f46e5'
                    : row.step.dashed
                      ? '#0891b2'
                      : '#334155'
                "
              />

              <!-- Label pill backdrop so dashed lifelines never cut text -->
              <rect
                :x="row.pillX"
                :y="row.pillY"
                :width="row.pillW"
                height="19"
                rx="6"
                :fill="row.idx === activeStepIndex ? '#ffffff' : '#f8fafc'"
                fill-opacity="0.96"
                :stroke="row.idx === activeStepIndex ? '#818cf8' : '#e2e8f0'"
                stroke-width="1"
              />
              <text
                :x="row.textX"
                :y="row.textY"
                :font-family="SVG_FONT_FAMILY"
                font-size="10.5"
                font-weight="700"
                :fill="row.idx === activeStepIndex ? '#3730a3' : '#0f172a'"
                text-anchor="middle"
              >
                {{ row.labelText }}
              </text>

              <!-- Live Packet Animation dot on the active arrow -->
              <circle
                v-if="row.idx === activeStepIndex"
                :key="`dot-${currentFlow.id}-${row.step.stepNumber}`"
                r="5"
                :fill="PHASE_META[row.step.phase].dotColor"
                stroke="#ffffff"
                stroke-width="1.5"
              >
                <animateMotion
                  dur="1.45s"
                  repeatCount="indefinite"
                  :path="row.pathD"
                />
              </circle>
            </g>
          </svg>
        </div>
      </div>

      <!-- Right: Live Step Inspector (Code, JSON Wire, Host Swift/Kotlin, Response) -->
      <div v-if="currentStep" class="min-h-0 space-y-3 overflow-y-auto bg-white p-4">
        <div class="flex flex-wrap items-center gap-2">
          <span class="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-indigo-600 px-2 text-xs font-bold text-white">
            Bước {{ currentStep.stepNumber }}
          </span>
          <span
            class="inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold"
            :class="PHASE_META[currentStep.phase].cls"
          >
            {{ PHASE_META[currentStep.phase].label }}
          </span>
          <span class="rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-600">
            {{ currentStep.from }} → {{ currentStep.to }}
          </span>
        </div>

        <h4 class="text-base leading-snug font-bold text-slate-900">
          {{ currentStep.title }}
        </h4>

        <p class="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs leading-relaxed text-slate-700">
          {{ currentStep.explanation }}
        </p>

        <!-- 1. Mini App Code (@vbotma/sdk) -->
        <div v-if="currentStep.miniAppCode" class="space-y-1">
          <div class="flex items-center justify-between gap-2 text-[11px]">
            <span class="inline-flex items-center gap-1.5 font-bold text-cyan-800">
              <Code2 class="h-3.5 w-3.5" />
              1. Hàm Mini App gọi (@vbotma/sdk)
            </span>
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-100"
              @click="copyValue(`ma-code-${currentStep.stepNumber}`, currentStep.miniAppCode)"
            >
              <Check
                v-if="copiedKey === `ma-code-${currentStep.stepNumber}`"
                class="h-3 w-3 text-emerald-600"
              />
              <Copy v-else class="h-3 w-3" />
              {{ copiedKey === `ma-code-${currentStep.stepNumber}` ? 'Đã copy' : 'Copy Code' }}
            </button>
          </div>
          <pre class="overflow-x-auto rounded-lg bg-slate-900 p-2.5 font-mono text-[11px] leading-relaxed text-cyan-100"><code>{{ currentStep.miniAppCode }}</code></pre>
        </div>

        <!-- 2. Wire Packet -->
        <div v-if="currentStep.wirePacket" class="space-y-1">
          <div class="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <span class="inline-flex items-center gap-1.5 font-bold text-indigo-800">
              <Radio class="h-3.5 w-3.5" />
              2. Gói tin qua Bridge:
              <code class="rounded bg-indigo-50 px-1.5 py-0.5 font-mono text-[10px] text-indigo-700">
                {{ currentStep.wirePacket.channel }}
              </code>
            </span>
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-100"
              @click="copyValue(`wire-${currentStep.stepNumber}`, currentStep.wirePacket.json)"
            >
              <Check
                v-if="copiedKey === `wire-${currentStep.stepNumber}`"
                class="h-3 w-3 text-emerald-600"
              />
              <Copy v-else class="h-3 w-3" />
              {{ copiedKey === `wire-${currentStep.stepNumber}` ? 'Đã copy' : 'Copy JSON' }}
            </button>
          </div>
          <pre class="overflow-x-auto rounded-lg bg-slate-900 p-2.5 font-mono text-[11px] leading-relaxed text-amber-100"><code>{{ currentStep.wirePacket.json }}</code></pre>
        </div>

        <!-- 3. Host Native Processing (iOS / Android) -->
        <div class="space-y-1.5">
          <div class="flex items-center gap-1.5 text-[11px] font-bold text-blue-900">
            <Smartphone class="h-3.5 w-3.5 text-blue-600" />
            3. Xử lý phía Host App Native
          </div>

          <div
            class="grid grid-cols-1 gap-2"
            :class="props.platformMode === 'compare' ? 'md:grid-cols-2' : ''"
          >
            <div
              v-if="props.platformMode !== 'android'"
              class="rounded-xl border border-indigo-200 bg-indigo-50/40 p-2.5 text-xs"
            >
              <div class="text-[10px] font-bold tracking-wide text-indigo-700 uppercase">
                iOS (Swift)
              </div>
              <code class="mt-0.5 block font-mono text-[11px] font-bold break-all text-slate-900">
                {{ currentStep.hostIos.fn }}
              </code>
              <p class="mt-1 text-[11px] leading-relaxed text-slate-700">
                {{ currentStep.hostIos.detail }}
              </p>
              <button
                v-if="currentStep.hostIos.codeRef"
                type="button"
                class="mt-1.5 inline-flex max-w-full items-center gap-1 rounded border border-indigo-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-600 transition hover:border-indigo-300"
                @click="copyValue(`ios-ref-${currentStep.stepNumber}`, currentStep.hostIos.codeRef!)"
              >
                <span class="truncate">{{ currentStep.hostIos.codeRef }}</span>
                <Check
                  v-if="copiedKey === `ios-ref-${currentStep.stepNumber}`"
                  class="h-2.5 w-2.5 shrink-0 text-emerald-600"
                />
                <Copy v-else class="h-2.5 w-2.5 shrink-0 text-slate-400" />
              </button>
            </div>

            <div
              v-if="props.platformMode !== 'ios'"
              class="rounded-xl border border-emerald-200 bg-emerald-50/45 p-2.5 text-xs"
            >
              <div class="text-[10px] font-bold tracking-wide text-emerald-700 uppercase">
                Android (Kotlin)
              </div>
              <code class="mt-0.5 block font-mono text-[11px] font-bold break-all text-slate-900">
                {{ currentStep.hostAndroid.fn }}
              </code>
              <p class="mt-1 text-[11px] leading-relaxed text-slate-700">
                {{ currentStep.hostAndroid.detail }}
              </p>
              <button
                v-if="currentStep.hostAndroid.codeRef"
                type="button"
                class="mt-1.5 inline-flex max-w-full items-center gap-1 rounded border border-emerald-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-600 transition hover:border-emerald-300"
                @click="copyValue(`and-ref-${currentStep.stepNumber}`, currentStep.hostAndroid.codeRef!)"
              >
                <span class="truncate">{{ currentStep.hostAndroid.codeRef }}</span>
                <Check
                  v-if="copiedKey === `and-ref-${currentStep.stepNumber}`"
                  class="h-2.5 w-2.5 shrink-0 text-emerald-600"
                />
                <Copy v-else class="h-2.5 w-2.5 shrink-0 text-slate-400" />
              </button>
            </div>
          </div>
        </div>

        <!-- 4. Response / Push Event Back to Mini App -->
        <div v-if="currentStep.responsePacket" class="space-y-1">
          <div class="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <span class="inline-flex items-center gap-1.5 font-bold text-emerald-800">
              <Server class="h-3.5 w-3.5" />
              4. Event báo lại Mini App:
              <code class="rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] text-emerald-800">
                {{ currentStep.responsePacket.eventName }}
              </code>
            </span>
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-100"
              @click="copyValue(`resp-${currentStep.stepNumber}`, currentStep.responsePacket.json)"
            >
              <Check
                v-if="copiedKey === `resp-${currentStep.stepNumber}`"
                class="h-3 w-3 text-emerald-600"
              />
              <Copy v-else class="h-3 w-3" />
              {{ copiedKey === `resp-${currentStep.stepNumber}` ? 'Đã copy' : 'Copy JSON' }}
            </button>
          </div>
          <pre class="overflow-x-auto rounded-lg bg-slate-900 p-2.5 font-mono text-[11px] leading-relaxed text-emerald-200"><code>{{ currentStep.responsePacket.json }}</code></pre>
        </div>

        <!-- Parity Warning -->
        <div
          v-if="currentStep.parityWarning"
          class="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950"
        >
          <AlertTriangle class="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <div class="text-[11px] font-bold tracking-wide text-amber-800 uppercase">
              Lưu ý lệch iOS ↔ Android
            </div>
            <p class="mt-0.5">{{ currentStep.parityWarning }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
