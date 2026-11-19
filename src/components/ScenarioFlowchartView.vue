<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { ArrowDown, ArrowUpRight, GitBranch } from 'lucide-vue-next';
import type {
  ScenarioAlternativeBranch,
  ScenarioStep,
  ScenarioTimelineModel,
} from '../core/scenarioFlowEngine';
import { ACTIVITY_ROLE_META, NODE_KIND_STYLE_META } from '../core/svgHelpers';

const props = defineProps<{
  model: ScenarioTimelineModel;
  activeStepIndex: number;
}>();

const emit = defineEmits<{
  selectStep: [index: number];
  switchScenario: [scenarioId: string];
  jumpToNode: [nodeId: string];
}>();

const stepRefs = ref<Array<HTMLElement | null>>([]);
const lastStep = computed(
  () => props.model.steps[props.model.steps.length - 1] ?? null,
);

const setStepRef = (el: unknown, index: number) => {
  stepRefs.value[index] = el instanceof HTMLElement ? el : null;
};

const stepDiffBadge = (step: ScenarioStep): string | null => {
  if (!__ENABLE_TECH_MODE__ || props.model.mode !== 'tech') return null;
  if (step.platformTag === 'ios') return 'iOS';
  if (step.platformTag === 'android') return 'Android';
  return step.hasPlatformDiff ? 'iOS ≠ Android' : null;
};

const formatGuardLabel = (label: string | undefined, isDecision: boolean): string => {
  if (!label) return '';
  const clean = label.trim();
  if (!isDecision || !clean || clean.startsWith('[')) return clean;
  return `[${clean}]`;
};

const altActionText = (alt: ScenarioAlternativeBranch): string => {
  if (alt.targetScenarioId) return 'Mở kịch bản';
  if (alt.targetStepIndex !== undefined) return `Tới bước ${alt.targetStepIndex + 1}`;
  return 'Xem trên sơ đồ';
};

const handleAltClick = (alt: ScenarioAlternativeBranch) => {
  if (alt.targetScenarioId) {
    emit('switchScenario', alt.targetScenarioId);
    return;
  }
  if (alt.targetStepIndex !== undefined) {
    emit('selectStep', alt.targetStepIndex);
    return;
  }
  emit('jumpToNode', alt.targetNodeId);
};

watch(
  () => props.activeStepIndex,
  async (idx) => {
    await nextTick();
    stepRefs.value[idx]?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  },
);
</script>

<template>
  <div v-if="props.model.steps.length === 0" class="py-12 text-center text-xs text-slate-500">
    Kịch bản này hiện không có bước hiển thị trong chế độ đang chọn.
  </div>

  <div v-else class="mx-auto flex max-w-2xl flex-col items-stretch py-1">
    <!-- UML Initial Node -->
    <div class="flex flex-col items-center pb-1">
      <div class="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 shadow-2xs">
        <span class="h-3 w-3 rounded-full bg-slate-900 ring-2 ring-slate-200" />
        <span class="text-[11px] font-bold text-slate-800">Bắt đầu</span>
      </div>
      <div class="h-3 w-0.5 bg-blue-500" />
      <ArrowDown class="h-4 w-4 text-blue-600" />
    </div>

    <template v-for="(step, idx) in props.model.steps" :key="step.node.id">
      <button
        :ref="(el) => setStepRef(el, idx)"
        type="button"
        class="group relative w-full rounded-2xl p-3.5 text-left transition-all"
        :class="[
          step.kind === 'decision'
            ? 'border-2 border-dashed border-amber-400 bg-amber-50/90'
            : ['border', NODE_KIND_STYLE_META[step.kind].cardCls],
          idx === props.activeStepIndex
            ? 'ring-2 ring-blue-600 ring-offset-2 shadow-md'
            : idx < props.activeStepIndex
              ? 'opacity-95 hover:shadow-sm'
              : 'opacity-85 hover:opacity-100 hover:shadow-sm',
        ]"
        @click="emit('selectStep', idx)"
      >
        <div class="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-1.5">
            <span
              v-if="step.kind === 'decision'"
              class="inline-flex h-6 w-6 rotate-45 items-center justify-center rounded-[4px] text-[11px] font-bold text-white shadow-2xs"
              :class="idx === props.activeStepIndex ? 'bg-blue-600' : 'bg-amber-500'"
            >
              <span class="-rotate-45">{{ step.stepNumber }}</span>
            </span>
            <span
              v-else
              class="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white"
              :class="idx === props.activeStepIndex ? 'bg-blue-600' : 'bg-slate-800'"
            >
              {{ step.stepNumber }}
            </span>

            <span
              class="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
              :class="NODE_KIND_STYLE_META[step.kind].badgeCls"
            >
              {{ NODE_KIND_STYLE_META[step.kind].label }}
            </span>
            <span
              v-if="stepDiffBadge(step)"
              class="inline-flex items-center rounded-md border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900"
            >
              {{ stepDiffBadge(step) }}
            </span>
          </div>

          <div class="flex items-center gap-1.5">
            <span
              class="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold"
              :class="ACTIVITY_ROLE_META[step.activityRole].badgeCls"
            >
              {{ ACTIVITY_ROLE_META[step.activityRole].label }}
            </span>
            <span
              v-if="idx === props.activeStepIndex"
              class="rounded-full bg-blue-600/10 px-2 py-0.5 text-[10px] font-bold text-blue-700"
            >
              Đang chọn
            </span>
          </div>
        </div>

        <div class="text-sm leading-snug font-bold text-slate-900">
          {{ step.displayLabel }}
        </div>
        <p class="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-600">
          {{ step.summaryText }}
        </p>
      </button>

      <template
        v-if="
          idx < props.model.steps.length - 1 ||
          (step.kind === 'decision' && step.alternativeBranches.length > 0)
        "
      >
        <div
          v-if="step.alternativeBranches.length > 0"
          class="grid grid-cols-1 gap-2 py-2.5 sm:grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)] sm:items-center"
        >
          <div class="flex sm:justify-end">
            <span
              v-if="step.outgoingEdgeLabel"
              class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold shadow-2xs"
              :class="
                idx === props.activeStepIndex
                  ? 'border-blue-400 bg-blue-50 text-blue-800'
                  : 'border-slate-200 bg-white text-slate-600'
              "
            >
              {{ formatGuardLabel(step.outgoingEdgeLabel, step.kind === 'decision') }}
            </span>
          </div>

          <div class="hidden flex-col items-center sm:flex">
            <div
              class="h-4 w-0.5 transition-colors"
              :class="idx < props.activeStepIndex ? 'bg-blue-500' : 'bg-slate-300'"
            />
            <ArrowDown
              v-if="idx < props.model.steps.length - 1"
              class="h-4 w-4 transition-colors"
              :class="idx < props.activeStepIndex ? 'text-blue-600' : 'text-slate-400'"
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <button
              v-for="alt in step.alternativeBranches"
              :key="alt.edgeId"
              type="button"
              :title="alt.targetScenarioName ? `Chuyển sang kịch bản: ${alt.targetScenarioName}` : alt.targetLabel"
              class="group/alt flex items-start justify-between gap-2 rounded-lg border border-dashed border-slate-300 bg-white/95 px-2.5 py-1.5 text-left transition hover:border-blue-400 hover:bg-blue-50/70"
              @click="handleAltClick(alt)"
            >
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                  <GitBranch class="h-3 w-3 shrink-0 text-slate-400 group-hover/alt:text-blue-600" />
                  <span v-if="alt.guardLabel" class="truncate text-amber-700">
                    [{{ alt.guardLabel }}]
                  </span>
                  <span v-else>Nhánh rẽ khác</span>
                </div>
                <div class="mt-0.5 truncate text-[11px] font-semibold text-slate-700 group-hover/alt:text-blue-900">
                  {{ alt.targetLabel }}
                </div>
              </div>
              <span class="inline-flex shrink-0 items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 group-hover/alt:bg-blue-100 group-hover/alt:text-blue-700">
                {{ altActionText(alt) }}
                <ArrowUpRight
                  v-if="alt.targetScenarioId || alt.targetStepIndex === undefined"
                  class="h-2.5 w-2.5"
                />
              </span>
            </button>
          </div>
        </div>

        <div v-else class="relative flex flex-col items-center py-2">
          <div
            class="h-3 w-0.5 transition-colors"
            :class="idx < props.activeStepIndex ? 'bg-blue-500' : 'bg-slate-300'"
          />
          <span
            v-if="step.outgoingEdgeLabel"
            class="my-0.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold shadow-2xs"
            :class="
              idx === props.activeStepIndex
                ? 'border-blue-400 bg-blue-50 text-blue-800'
                : 'border-slate-200 bg-white text-slate-600'
            "
          >
            {{ formatGuardLabel(step.outgoingEdgeLabel, step.kind === 'decision') }}
          </span>
          <ArrowDown
            class="h-4 w-4 transition-colors"
            :class="idx < props.activeStepIndex ? 'text-blue-600' : 'text-slate-400'"
          />
        </div>
      </template>
    </template>

    <!-- UML Final Node -->
    <div class="flex flex-col items-center pt-1">
      <div
        class="h-3 w-0.5 transition-colors"
        :class="props.activeStepIndex >= props.model.steps.length - 1 ? 'bg-blue-500' : 'bg-slate-300'"
      />
      <ArrowDown
        class="h-4 w-4 transition-colors"
        :class="props.activeStepIndex >= props.model.steps.length - 1 ? 'text-blue-600' : 'text-slate-400'"
      />
      <div
        class="mt-0.5 inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1 shadow-2xs"
        :class="
          lastStep?.kind === 'error'
            ? 'border-rose-200 text-rose-700'
            : 'border-slate-200 text-slate-800'
        "
      >
        <span
          class="flex h-4 w-4 items-center justify-center rounded-full border-2 bg-white"
          :class="lastStep?.kind === 'error' ? 'border-rose-600' : 'border-slate-900'"
        >
          <span
            class="h-2 w-2 rounded-full"
            :class="lastStep?.kind === 'error' ? 'bg-rose-600' : 'bg-slate-900'"
          />
        </span>
        <span class="text-[11px] font-bold">
          {{ lastStep?.kind === 'error' ? 'Kết thúc (Lỗi / Dừng)' : 'Kết thúc' }}
        </span>
      </div>
    </div>
  </div>
</template>
