<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  inject,
  onBeforeUnmount,
  ref,
  shallowRef,
  watch,
} from 'vue';
import {
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  ExternalLink,
  GitFork,
  Image as ImageIcon,
  LayoutList,
  ListOrdered,
  Pause,
  Play,
  Workflow,
  X,
} from 'lucide-vue-next';
import { getVisibleMedia, FLOW_EXPLORER_KEY } from '../composables/useFlowExplorer';
import { svgToPngBlob } from '../core/diagramExport';
import { downloadBlob, downloadTextFile, slugifyFilename } from '../core/downloadHelper';
import {
  buildScenarioTimeline,
  renderScenarioActivitySvg,
  renderScenarioFlowchartSvg,
} from '../core/scenarioFlowEngine';
import type { ScenarioSequenceModel } from '../core/scenarioSequenceBuilder';
import { NODE_KIND_STYLE_META } from '../core/svgHelpers';
import ScenarioActivityDiagram from './ScenarioActivityDiagram.vue';
import ScenarioFlowchartView from './ScenarioFlowchartView.vue';
import MediaGallery from './drawer/MediaGallery.vue';

const TechSequenceDiagramView = __ENABLE_TECH_MODE__
  ? defineAsyncComponent(() => import('./ScenarioSequenceDiagram.vue'))
  : null;
const TechStepDetailPanel = __ENABLE_TECH_MODE__
  ? defineAsyncComponent(() => import('./ScenarioStepTechDetail.vue'))
  : null;
const TechPlatformSwitcher = __ENABLE_TECH_MODE__
  ? defineAsyncComponent(() => import('./TechPlatformSwitcher.vue'))
  : null;

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const enableTechMode = __ENABLE_TECH_MODE__;
const isOpen = computed(() => explorer.scenarioDialogOpen.value);
const isTechView = computed(() => enableTechMode && explorer.audienceMode.value === 'tech');
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

const visibleMedia = computed(() => {
  if (!currentStep.value || explorer.dataset.hasRealMedia === false) return [];
  return getVisibleMedia(currentStep.value.node, explorer.audienceMode.value);
});

const viewTab = ref<'flowchart' | 'sequence'>('flowchart');
const activityDisplayMode = ref<'diagram' | 'cards'>('diagram');
const sequenceModel = shallowRef<ScenarioSequenceModel | null>(null);
const isPlaying = ref(false);
const isExporting = ref(false);
let playTimer: ReturnType<typeof setInterval> | null = null;

const stopAutoPlay = () => {
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
  }
  isPlaying.value = false;
};

const toggleAutoPlay = () => {
  if (isPlaying.value) {
    stopAutoPlay();
    return;
  }
  if (totalSteps.value <= 1) return;
  if (currentStepIndex.value >= totalSteps.value - 1) {
    explorer.setScenarioStep(0);
  }
  isPlaying.value = true;
  playTimer = setInterval(() => {
    if (currentStepIndex.value >= totalSteps.value - 1) {
      stopAutoPlay();
      return;
    }
    explorer.stepScenario(1);
  }, 1800);
};

const syncSequenceModel = async (chooseDefaultTab: boolean) => {
  if (!__ENABLE_TECH_MODE__ || !isTechView.value || !timeline.value) {
    sequenceModel.value = null;
    viewTab.value = 'flowchart';
    return;
  }
  const mod = await import('../core/scenarioSequenceBuilder');
  const built = mod.buildScenarioSequence(timeline.value, explorer.platformMode.value);
  sequenceModel.value = built;
  if (chooseDefaultTab) {
    viewTab.value = built.preferSequenceByDefault ? 'sequence' : 'flowchart';
  }
};

const selectStep = (index: number) => {
  stopAutoPlay();
  explorer.setScenarioStep(index);
};

const switchToScenario = (scenarioId: string) => {
  stopAutoPlay();
  explorer.selectScenario(scenarioId);
};

const jumpToNodeById = (nodeId: string) => {
  stopAutoPlay();
  explorer.closeScenarioDialog();
  explorer.jumpToNode(nodeId);
};

const closeDialog = () => {
  stopAutoPlay();
  explorer.closeScenarioDialog();
};

const jumpToMainDiagram = () => {
  if (!currentStep.value) return;
  const targetId = currentStep.value.node.id;
  stopAutoPlay();
  explorer.closeScenarioDialog();
  explorer.jumpToNode(targetId);
};

const renderActiveDiagramSvg = async (): Promise<string | null> => {
  if (!timeline.value) return null;
  if (
    __ENABLE_TECH_MODE__ &&
    isTechView.value &&
    viewTab.value === 'sequence' &&
    sequenceModel.value
  ) {
    const mod = await import('../core/scenarioSequenceBuilder');
    return mod.renderScenarioSequenceSvg(sequenceModel.value, currentStepIndex.value);
  }
  if (activityDisplayMode.value === 'diagram') {
    return renderScenarioActivitySvg(timeline.value, currentStepIndex.value);
  }
  return renderScenarioFlowchartSvg(timeline.value);
};

const exportSvg = async () => {
  if (!timeline.value) return;
  const svg = await renderActiveDiagramSvg();
  if (!svg) return;
  const baseName = slugifyFilename(timeline.value.title);
  downloadTextFile(`${baseName}.svg`, svg, 'image/svg+xml;charset=utf-8');
};

const exportPng = async () => {
  if (!timeline.value || isExporting.value) return;
  isExporting.value = true;
  try {
    const svg = await renderActiveDiagramSvg();
    if (!svg) return;
    const blob = await svgToPngBlob(svg, 2);
    const baseName = slugifyFilename(timeline.value.title);
    downloadBlob(`${baseName}.png`, blob);
  } finally {
    isExporting.value = false;
  }
};

const onWindowKeyDown = (event: KeyboardEvent) => {
  if (!isOpen.value) return;
  const tag = (document.activeElement as HTMLElement | null)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;

  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    closeDialog();
    return;
  }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    event.preventDefault();
    stopAutoPlay();
    explorer.stepScenario(-1);
    return;
  }
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    event.preventDefault();
    stopAutoPlay();
    explorer.stepScenario(1);
    return;
  }
  if (event.key === ' ') {
    event.preventDefault();
    toggleAutoPlay();
  }
};

watch(
  [isOpen, () => activeScenario.value?.id, () => explorer.audienceMode.value, () => explorer.platformMode.value],
  ([open, , aud], [prevOpen, , prevAud]) => {
    if (open) {
      window.addEventListener('keydown', onWindowKeyDown, true);
      const shouldPickDefault = !prevOpen || aud !== prevAud;
      void syncSequenceModel(shouldPickDefault);
    } else {
      window.removeEventListener('keydown', onWindowKeyDown, true);
      stopAutoPlay();
    }
  },
);

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeyDown, true);
  stopAutoPlay();
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen && timeline"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-2 py-2.5 backdrop-blur-xs sm:px-4 sm:py-3"
      @click.self="closeDialog"
    >
      <div
        role="dialog"
        aria-modal="true"
        :aria-label="`Biểu đồ luồng kịch bản: ${timeline.title}`"
        class="flex h-[92vh] w-[96vw] max-w-[1440px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <!-- Header -->
        <div class="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
          <div class="flex min-w-0 flex-1 items-start gap-3">
            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Workflow class="h-5 w-5" />
            </span>
            <div class="min-w-0">
              <h2 class="truncate text-base font-bold text-slate-900">
                {{ timeline.title }}
              </h2>
              <p v-if="timeline.description" class="mt-0.5 line-clamp-2 text-xs text-slate-600">
                {{ timeline.description }}
              </p>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <div
              v-if="enableTechMode && isTechView"
              class="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold"
            >
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-md px-2.5 py-1 transition"
                :class="
                  viewTab === 'flowchart'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                "
                @click="viewTab = 'flowchart'"
              >
                <GitFork class="h-3.5 w-3.5" />
                Biểu đồ hoạt động
              </button>
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-md px-2.5 py-1 transition"
                :class="
                  viewTab === 'sequence'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                "
                @click="viewTab = 'sequence'"
              >
                <ListOrdered class="h-3.5 w-3.5" />
                Luồng tuần tự
              </button>
            </div>
            <span
              v-else
              class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700"
            >
              <GitFork class="h-3.5 w-3.5 text-blue-600" />
              Biểu đồ hoạt động
            </span>

            <component :is="TechPlatformSwitcher" v-if="TechPlatformSwitcher && isTechView" :show-parity="false" />

            <button
              type="button"
              aria-label="Đóng biểu đồ kịch bản"
              class="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              @click="closeDialog"
            >
              <X class="h-4 w-4" />
            </button>
          </div>
        </div>

        <!-- Toolbar -->
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-5 py-2">
          <div class="flex flex-wrap items-center gap-2">
            <div class="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5">
              <button
                type="button"
                aria-label="Bước trước"
                :disabled="currentStepIndex <= 0"
                class="rounded-md p-1 text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35"
                @click="selectStep(currentStepIndex - 1)"
              >
                <ChevronLeft class="h-4 w-4" />
              </button>
              <span class="px-2.5 text-xs font-semibold text-slate-800">
                Bước {{ currentStepIndex + 1 }} / {{ totalSteps }}
              </span>
              <button
                type="button"
                aria-label="Bước kế tiếp"
                :disabled="currentStepIndex >= totalSteps - 1"
                class="rounded-md p-1 text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35"
                @click="selectStep(currentStepIndex + 1)"
              >
                <ChevronRight class="h-4 w-4" />
              </button>
            </div>

            <button
              v-if="totalSteps > 1"
              type="button"
              class="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition"
              :class="
                isPlaying
                  ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
              "
              @click="toggleAutoPlay"
            >
              <Pause v-if="isPlaying" class="h-3.5 w-3.5" />
              <Play v-else class="h-3.5 w-3.5" />
              {{ isPlaying ? 'Tạm dừng' : 'Tự chạy' }}
            </button>

            <div class="hidden items-center gap-1 sm:flex">
              <button
                v-for="(step, idx) in timeline.steps"
                :key="step.node.id"
                type="button"
                :title="`Bước ${step.stepNumber}: ${step.displayLabel}`"
                class="h-2.5 rounded-full transition-all"
                :class="
                  idx === currentStepIndex
                    ? 'w-6 bg-blue-600'
                    : idx < currentStepIndex
                      ? 'w-2.5 bg-blue-400 hover:bg-blue-500'
                      : 'w-2.5 bg-slate-300 hover:bg-slate-400'
                "
                @click="selectStep(idx)"
              />
            </div>
          </div>

          <div class="flex items-center gap-1.5">
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
              @click="exportSvg"
            >
              <Download class="h-3.5 w-3.5" />
              Xuất SVG
            </button>
            <button
              type="button"
              :disabled="isExporting"
              class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
              @click="exportPng"
            >
              <ImageIcon class="h-3.5 w-3.5" />
              {{ isExporting ? 'Đang xuất...' : 'Xuất PNG' }}
            </button>
          </div>
        </div>

        <!-- 2-column Body -->
        <div class="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]">
          <div class="min-h-0 overflow-y-auto bg-slate-50/70 p-3.5 sm:p-4 lg:border-r lg:border-slate-200">
            <component
              :is="TechSequenceDiagramView"
              v-if="TechSequenceDiagramView && isTechView && viewTab === 'sequence' && sequenceModel"
              :model="sequenceModel"
              :active-step-index="currentStepIndex"
              @select-step="selectStep"
            />
            <div v-else class="space-y-3">
              <div class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600">
                <div class="flex flex-wrap items-center gap-x-3.5 gap-y-1">
                  <span class="inline-flex items-center gap-1.5">
                    <span class="inline-block h-2.5 w-2.5 rounded-full bg-slate-900 ring-2 ring-slate-200" />
                    Bắt đầu / Kết thúc
                  </span>
                  <span class="inline-flex items-center gap-1.5">
                    <span class="inline-block h-2.5 w-2.5 rotate-45 rounded-[2px] bg-amber-500" />
                    Điều kiện
                  </span>
                  <span class="inline-flex items-center gap-1.5">
                    <span class="inline-block h-3 w-5 rounded border border-dashed border-slate-400 bg-slate-50" />
                    Nhánh rẽ khác
                  </span>
                </div>

                <div
                  role="group"
                  aria-label="Chọn kiểu hiển thị biểu đồ hoạt động"
                  class="inline-flex shrink-0 items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-[11px] font-semibold"
                >
                  <button
                    type="button"
                    class="inline-flex items-center gap-1 rounded-md px-2 py-1 transition"
                    :class="
                      activityDisplayMode === 'diagram'
                        ? 'bg-white text-blue-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    "
                    @click="activityDisplayMode = 'diagram'"
                  >
                    <Columns3 class="h-3.5 w-3.5" />
                    Sơ đồ hoạt động
                  </button>
                  <button
                    type="button"
                    class="inline-flex items-center gap-1 rounded-md px-2 py-1 transition"
                    :class="
                      activityDisplayMode === 'cards'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    "
                    @click="activityDisplayMode = 'cards'"
                  >
                    <LayoutList class="h-3.5 w-3.5" />
                    Dạng thẻ
                  </button>
                </div>
              </div>

              <ScenarioActivityDiagram
                v-if="activityDisplayMode === 'diagram'"
                :model="timeline"
                :active-step-index="currentStepIndex"
                @select-step="selectStep"
                @switch-scenario="switchToScenario"
                @jump-to-node="jumpToNodeById"
              />
              <ScenarioFlowchartView
                v-else
                :model="timeline"
                :active-step-index="currentStepIndex"
                @select-step="selectStep"
                @switch-scenario="switchToScenario"
                @jump-to-node="jumpToNodeById"
              />
            </div>
          </div>

          <div class="flex min-h-0 flex-col bg-white">
            <div v-if="currentStep" class="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
              <div class="flex flex-wrap items-center gap-2">
                <span class="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-blue-600 px-2 text-xs font-bold text-white">
                  Bước {{ currentStep.stepNumber }}
                </span>
                <span
                  class="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold"
                  :class="NODE_KIND_STYLE_META[currentStep.kind].badgeCls"
                >
                  {{ NODE_KIND_STYLE_META[currentStep.kind].label }}
                </span>
              </div>

              <h3 class="text-base leading-snug font-bold text-slate-900">
                {{ currentStep.displayLabel }}
              </h3>

              <div
                v-if="currentStep.incomingEdgeLabel || currentStep.outgoingEdgeLabel"
                class="flex flex-wrap gap-2 text-[11px]"
              >
                <span
                  v-if="currentStep.incomingEdgeLabel"
                  class="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 font-medium text-blue-800"
                >
                  Từ bước trước: {{ currentStep.incomingEdgeLabel }}
                </span>
                <span
                  v-if="currentStep.outgoingEdgeLabel"
                  class="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-700"
                >
                  Tiếp theo: {{ currentStep.outgoingEdgeLabel }}
                </span>
              </div>

              <div class="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                <div class="text-[11px] font-bold tracking-wide text-slate-500 uppercase">
                  Diễn giải luồng
                </div>
                <p class="mt-1 text-xs leading-relaxed text-slate-700">
                  {{ currentStep.node.summary.overview }}
                </p>
              </div>

              <MediaGallery
                v-if="visibleMedia.length > 0"
                :media="visibleMedia"
                :audience-mode="explorer.audienceMode.value"
              />

              <component
                :is="TechStepDetailPanel"
                v-if="TechStepDetailPanel && isTechView"
                :step="currentStep"
                :platform-mode="explorer.platformMode.value"
              />
            </div>

            <div class="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/80 px-5 py-3">
              <span class="min-w-0 text-[11px] text-slate-500">
                ← → chuyển bước • Space tự chạy
              </span>
              <button
                v-if="currentStep"
                type="button"
                class="inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
                @click="jumpToMainDiagram"
              >
                Xem trên sơ đồ chính
                <ExternalLink class="h-3.5 w-3.5 shrink-0" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
