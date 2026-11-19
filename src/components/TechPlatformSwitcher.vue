<script setup lang="ts">
import { inject } from 'vue';
import { Columns2 } from 'lucide-vue-next';
import { FLOW_EXPLORER_KEY } from '../composables/useFlowExplorer';
import type { PlatformViewMode } from '../data/schema';

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const selectPlatform = (mode: PlatformViewMode) => {
  explorer.setPlatformMode(mode);
};
</script>

<template>
  <div
    role="group"
    aria-label="Chọn nền tảng kỹ thuật"
    class="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold"
  >
    <button
      type="button"
      class="rounded-md px-2.5 py-1 transition"
      :class="
        explorer.platformMode.value === 'ios'
          ? 'bg-slate-800 text-white shadow-xs'
          : 'text-slate-600 hover:text-slate-900'
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
          : 'text-slate-600 hover:text-slate-900'
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
          : 'text-slate-600 hover:text-slate-900'
      "
      @click="selectPlatform('compare')"
    >
      <Columns2 class="h-3 w-3" />
      So sánh
    </button>
  </div>
</template>
