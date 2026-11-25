<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { ArrowLeftRight, ArrowUpDown, GitBranch, Scale } from 'lucide-vue-next';
import { FLOW_EXPLORER_KEY } from '../composables/useFlowExplorer';
import { useToast } from '../composables/useToast';
import { saveLayoutDirection } from '../core/explorerPreferences';
import type { MergedFlowDataset } from '../data/schema';

const emit = defineEmits<{
  openParity: [];
}>();

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const { pushToast } = useToast();
const enableTechMode = __ENABLE_TECH_MODE__;
const parityTotal = ref<number | null>(null);
let extractParityReportFn: ((ds: MergedFlowDataset) => { total: number }) | null = null;

const isTechView = computed(() => enableTechMode && explorer.audienceMode.value === 'tech');
const techBranch = computed(() =>
  enableTechMode && explorer.audienceMode.value === 'tech'
    ? (explorer.dataset.app.techBranch ?? null)
    : null,
);

const visibleCount = computed(() => explorer.visibleFlow.value.nodes.length);
const totalCount = computed(() => explorer.totalDatasetNodeCount.value);

const onToggleDirection = () => {
  const next = explorer.toggleLayoutDirection();
  saveLayoutDirection(next);
  pushToast(next === 'TB' ? 'Đã chuyển sơ đồ hướng dọc (TB)' : 'Đã chuyển sơ đồ hướng ngang (LR)', 'info');
};

if (__ENABLE_TECH_MODE__) {
  watch(
    () => explorer.datasetRef.value,
    async (ds) => {
      if (!extractParityReportFn) {
        const mod = await import('../core/parityAnalyzer');
        extractParityReportFn = mod.extractParityReport;
      }
      parityTotal.value = extractParityReportFn(ds).total;
    },
    { immediate: true },
  );
}
</script>

<template>
  <div
    class="pointer-events-auto inline-flex flex-wrap items-center gap-2 rounded-full border border-slate-200/90 bg-white/90 px-3 py-1 font-mono text-[11px] text-slate-600 shadow-sm backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-900/90 dark:text-slate-300"
  >
    <span class="inline-flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-100">
      <span
        class="h-1.5 w-1.5 rounded-full"
        :class="
          isTechView
            ? 'animate-pulse bg-cyan-500 dark:bg-cyan-400'
            : 'bg-indigo-500 dark:bg-indigo-400'
        "
      />
      <span>
        {{ isTechView ? `NODES ${visibleCount}/${totalCount}` : `${visibleCount} / ${totalCount} mục` }}
      </span>
    </span>

    <span class="h-3 w-px bg-slate-200 dark:bg-slate-700" />

    <button
      type="button"
      class="inline-flex items-center gap-1 rounded px-1 py-0.2 font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-indigo-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-cyan-300"
      :title="`Đổi hướng sơ đồ (${explorer.layoutDirection.value === 'LR' ? 'Ngang → Dọc' : 'Dọc → Ngang'})`"
      @click="onToggleDirection"
    >
      <ArrowLeftRight v-if="explorer.layoutDirection.value === 'LR'" class="h-3 w-3" />
      <ArrowUpDown v-else class="h-3 w-3" />
      <span>{{ explorer.layoutDirection.value }}</span>
    </button>

    <template v-if="enableTechMode && isTechView">
      <template v-if="techBranch">
        <span class="h-3 w-px bg-slate-200 dark:bg-slate-700" />
        <span class="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
          <GitBranch class="h-3 w-3" />
          {{ techBranch }}
        </span>
      </template>

      <template v-if="parityTotal !== null">
        <span class="h-3 w-px bg-slate-200 dark:bg-slate-700" />
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded px-1 py-0.2 font-semibold text-amber-700 transition hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-500/15"
          title="Mở bảng chênh lệch iOS ↔ Android"
          @click="emit('openParity')"
        >
          <Scale class="h-3 w-3" />
          <span>Δ {{ parityTotal }}</span>
        </button>
      </template>
    </template>
  </div>
</template>
