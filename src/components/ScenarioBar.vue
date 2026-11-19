<script setup lang="ts">
import { computed, inject } from 'vue';
import { Play, X } from 'lucide-vue-next';
import { FLOW_EXPLORER_KEY } from '../composables/useFlowExplorer';

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const scenarios = computed(() => explorer.visibleFlow.value.activeScenarios);
const activeScenario = computed(
  () => scenarios.value.find((sc) => sc.id === explorer.activeScenarioId.value) ?? null,
);

const toggleScenario = (scenarioId: string) => {
  explorer.activeScenarioId.value =
    explorer.activeScenarioId.value === scenarioId ? null : scenarioId;
};
</script>

<template>
  <div
    v-if="scenarios.length > 0"
    class="pointer-events-auto absolute bottom-4 left-4 z-10 max-w-xl rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur"
  >
    <div class="mb-2 flex items-center justify-between gap-3">
      <div class="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-slate-500 uppercase">
        <Play class="h-3.5 w-3.5 text-blue-600" />
        <span>Chạy thử kịch bản ({{ scenarios.length }})</span>
      </div>
      <button
        v-if="activeScenario"
        type="button"
        class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
        @click="explorer.activeScenarioId.value = null"
      >
        <X class="h-3 w-3" />
        Tắt
      </button>
    </div>

    <div class="flex flex-wrap gap-1.5">
      <button
        v-for="sc in scenarios"
        :key="sc.id"
        type="button"
        class="rounded-full border px-3 py-1 text-xs font-medium transition"
        :class="
          explorer.activeScenarioId.value === sc.id
            ? 'border-blue-600 bg-blue-600 text-white shadow-xs'
            : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-300 hover:bg-blue-50'
        "
        @click="toggleScenario(sc.id)"
      >
        {{ sc.name }}
      </button>
    </div>

    <p
      v-if="activeScenario?.description"
      class="mt-2 border-t border-slate-100 pt-2 text-xs leading-relaxed text-slate-600"
    >
      {{ activeScenario.description }}
    </p>
  </div>
</template>
