<script setup lang="ts">
import { computed, inject } from 'vue';
import { Columns2, Scale } from 'lucide-vue-next';
import { FLOW_EXPLORER_KEY } from '../composables/useFlowExplorer';
import { extractParityReport } from '../core/parityAnalyzer';
import type { PlatformViewMode } from '../data/schema';

const props = withDefaults(
  defineProps<{
    showParity?: boolean;
  }>(),
  {
    showParity: true,
  },
);

const emit = defineEmits<{
  openParity: [];
}>();

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const parityTotal = computed(() =>
  props.showParity ? extractParityReport(explorer.dataset).total : 0,
);

const selectPlatform = (mode: PlatformViewMode) => {
  explorer.setPlatformMode(mode);
};
</script>

<template>
  <div class="inline-flex items-center gap-1.5">
    <div
      role="group"
      aria-label="Chọn nền tảng kỹ thuật"
      class="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold dark:border-slate-700/80 dark:bg-slate-900"
    >
      <button
        type="button"
        class="rounded-md px-2.5 py-1 transition"
        :class="
          explorer.platformMode.value === 'ios'
            ? 'bg-slate-800 text-white shadow-xs dark:bg-slate-700'
            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
        "
        @click="selectPlatform('ios')"
      >
        iOS
      </button>
      <button
        type="button"
        class="rounded-md px-2.5 py-1 transition"
        :class="
          explorer.platformMode.value === 'android'
            ? 'bg-emerald-600 text-white shadow-xs'
            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
        "
        @click="selectPlatform('android')"
      >
        Android
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-1 rounded-md px-2.5 py-1 transition"
        :class="
          explorer.platformMode.value === 'compare'
            ? 'bg-indigo-600 text-white shadow-xs'
            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
        "
        @click="selectPlatform('compare')"
      >
        <Columns2 class="h-3 w-3" />
        So sánh
      </button>
    </div>

    <button
      v-if="props.showParity"
      type="button"
      class="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 transition hover:border-amber-300 hover:bg-amber-100 dark:border-amber-500/35 dark:bg-amber-500/12 dark:text-amber-300 dark:hover:bg-amber-500/20"
      title="Xem bảng tổng hợp mọi điểm khác biệt iOS ↔ Android"
      @click="emit('openParity')"
    >
      <Scale class="h-3.5 w-3.5" />
      <span class="hidden sm:inline">Chênh lệch</span>
      <span class="rounded-full bg-amber-200/80 px-1.5 py-0 font-mono text-[10px] font-bold text-amber-950 dark:bg-amber-500/25 dark:text-amber-200">
        {{ parityTotal }}
      </span>
    </button>
  </div>
</template>
