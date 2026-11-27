<script setup lang="ts">
import { computed, inject } from 'vue';
import { FLOW_EXPLORER_KEY } from '../composables/useFlowExplorer';

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const enableTechMode = __ENABLE_TECH_MODE__;
const isTechView = computed(() => enableTechMode && explorer.audienceMode.value === 'tech');
const visibleCount = computed(() => explorer.visibleFlow.value.nodes.length);
const totalCount = computed(() => explorer.totalDatasetNodeCount.value);
</script>

<template>
  <div
    class="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-white/90 px-2.5 py-1 font-mono text-[11px] font-semibold text-slate-800 shadow-sm backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-900/90 dark:text-slate-100"
  >
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
  </div>
</template>
