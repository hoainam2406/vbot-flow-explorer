<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue';
import { ChevronLeft, ChevronRight, FilePenLine, Pause, Play, Plus, Workflow, X } from 'lucide-vue-next';
import { FLOW_EXPLORER_KEY } from '../composables/useFlowExplorer';
import { buildScenarioTimeline } from '../core/scenarioFlowEngine';
import type { Scenario } from '../data/schema';

const emit = defineEmits<{
  createScenario: [];
  editScenario: [scenario: Scenario];
}>();

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}
const enableTechMode = __ENABLE_TECH_MODE__;
const isTechView = computed(() => enableTechMode && explorer.audienceMode.value === 'tech');

const isAutoPlaying = ref(false);
let playTimer: ReturnType<typeof setInterval> | null = null;

const scenarios = computed(() => explorer.visibleFlow.value.activeScenarios);
const activeScenario = computed(() => explorer.activeScenario.value);

const timeline = computed(() =>
  activeScenario.value
    ? buildScenarioTimeline(
        activeScenario.value,
        explorer.visibleFlow.value,
        explorer.audienceMode.value,
      )
    : null,
);

const totalSteps = computed(() => timeline.value?.steps.length ?? 0);
const currentStepIndex = computed(() => {
  if (totalSteps.value === 0) return 0;
  const idx = explorer.activeScenarioStepIndex.value ?? 0;
  return Math.max(0, Math.min(idx, totalSteps.value - 1));
});
const currentStep = computed(() => timeline.value?.steps[currentStepIndex.value] ?? null);

const formatStepPad = (n: number) => String(n).padStart(2, '0');

const stopAutoPlay = () => {
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
  }
  isAutoPlaying.value = false;
};

const toggleAutoPlay = () => {
  if (isAutoPlaying.value) {
    stopAutoPlay();
    return;
  }
  if (totalSteps.value <= 1) return;
  if (currentStepIndex.value >= totalSteps.value - 1) {
    explorer.setScenarioStep(0);
  }
  isAutoPlaying.value = true;
  playTimer = setInterval(() => {
    if (currentStepIndex.value >= totalSteps.value - 1) {
      stopAutoPlay();
      return;
    }
    explorer.stepScenario(1);
  }, 1800);
};

watch(
  () => explorer.activeScenarioId.value,
  () => {
    stopAutoPlay();
  },
);

watch(
  () => explorer.scenarioDialogOpen.value,
  (isOpen) => {
    if (isOpen) {
      stopAutoPlay();
    }
  },
);

onBeforeUnmount(() => {
  stopAutoPlay();
});

const toggleScenario = (scenarioId: string) => {
  explorer.selectScenario(scenarioId);
};

const onStepMove = (delta: 1 | -1) => {
  stopAutoPlay();
  explorer.stepScenario(delta);
};
</script>

<template>
  <div
    v-if="scenarios.length > 0 || (enableTechMode && isTechView)"
    data-tour="scenario-bar"
    class="pointer-events-auto absolute bottom-4 left-4 z-10 max-w-2xl rounded-2xl border border-slate-200/90 bg-white/92 p-3 shadow-lg backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-900/90"
  >
    <div class="mb-2 flex items-center justify-between gap-3">
      <div class="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400">
        <Play class="h-3.5 w-3.5 text-blue-600 dark:text-cyan-400" />
        <span>Chạy thử kịch bản ({{ scenarios.length }})</span>
      </div>
      <div class="flex items-center gap-1.5">
        <button
          v-if="enableTechMode && isTechView"
          type="button"
          class="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-cyan-500/35 dark:bg-cyan-500/15 dark:text-cyan-300"
          @click="emit('createScenario')"
        >
          <Plus class="h-3 w-3" />
          Kịch bản
        </button>
        <button
          v-if="enableTechMode && isTechView && activeScenario"
          type="button"
          class="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 transition hover:bg-amber-100 dark:border-amber-500/35 dark:bg-amber-500/15 dark:text-amber-300"
          @click="emit('editScenario', activeScenario)"
        >
          <FilePenLine class="h-3 w-3" />
          Sửa
        </button>
        <button
          v-if="activeScenario"
          type="button"
          class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          @click="explorer.selectScenario(null)"
        >
          <X class="h-3 w-3" />
          Tắt
        </button>
      </div>
    </div>

    <div class="flex flex-wrap gap-1.5">
      <button
        v-for="sc in scenarios"
        :key="sc.id"
        type="button"
        class="rounded-full border px-3 py-1 text-xs font-medium transition"
        :class="
          explorer.activeScenarioId.value === sc.id
            ? 'border-blue-600 bg-blue-600 text-white shadow-xs dark:border-cyan-400 dark:bg-cyan-500 dark:text-slate-950'
            : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:border-cyan-500/40 dark:hover:bg-cyan-500/10'
        "
        @click="toggleScenario(sc.id)"
      >
        {{ sc.name }}
      </button>
    </div>

    <div v-if="activeScenario" class="mt-2.5 space-y-2 border-t border-slate-100 pt-2 dark:border-slate-800">
      <p v-if="activeScenario.description" class="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
        {{ activeScenario.description }}
      </p>

      <div v-if="totalSteps > 0" class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-1.5">
          <div class="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800/80">
            <button
              type="button"
              aria-label="Bước trước"
              title="Bước trước ([)"
              :disabled="currentStepIndex <= 0"
              class="rounded-md p-1 text-slate-600 transition hover:bg-white hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-35 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white"
              @click="onStepMove(-1)"
            >
              <ChevronLeft class="h-3.5 w-3.5" />
            </button>
            <span class="px-2 font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-200">
              {{ formatStepPad(currentStepIndex + 1) }} / {{ formatStepPad(totalSteps) }}
            </span>
            <button
              type="button"
              aria-label="Bước tiếp"
              title="Bước tiếp (])"
              :disabled="currentStepIndex >= totalSteps - 1"
              class="rounded-md p-1 text-slate-600 transition hover:bg-white hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-35 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white"
              @click="onStepMove(1)"
            >
              <ChevronRight class="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            v-if="totalSteps > 1"
            type="button"
            class="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition"
            :class="
              isAutoPlaying
                ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
            "
            @click="toggleAutoPlay"
          >
            <Pause v-if="isAutoPlaying" class="h-3 w-3" />
            <Play v-else class="h-3 w-3" />
            {{ isAutoPlaying ? 'Tạm dừng' : 'Tự chạy' }}
          </button>
        </div>

        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 transition hover:bg-blue-100 dark:border-cyan-500/35 dark:bg-cyan-500/12 dark:text-cyan-300 dark:hover:bg-cyan-500/20"
          @click="explorer.openScenarioDialog()"
        >
          <Workflow class="h-3.5 w-3.5" />
          Xem biểu đồ luồng
        </button>
      </div>

      <div
        v-if="currentStep"
        class="flex flex-wrap items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-700 dark:bg-slate-800/80 dark:text-slate-300"
      >
        <span class="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 font-mono text-[10px] font-bold text-white dark:bg-cyan-500 dark:text-slate-950">
          {{ currentStep.stepNumber }}
        </span>
        <span v-if="currentStep.incomingEdgeLabel" class="font-medium text-blue-700 dark:text-cyan-300">
          [{{ currentStep.incomingEdgeLabel }}] →
        </span>
        <span class="font-semibold text-slate-900 dark:text-slate-100">{{ currentStep.displayLabel }}</span>
      </div>
    </div>
  </div>
</template>
