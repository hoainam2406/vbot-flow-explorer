<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ArrowRight, Search, Terminal } from 'lucide-vue-next';
import {
  DEV_ONBOARDING_STEPS,
  TECH_GLOSSARY_TERMS,
  type DevOnboardingStep,
  type TechGlossaryItem,
} from '../data/techGlossaryData';

const props = defineProps<{
  tab: 'onboarding' | 'glossary';
  techBranch?: string;
}>();

const emit = defineEmits<{
  jumpTech: [nodeId: string, recommendedPlatform?: DevOnboardingStep['recommendedPlatform']];
  openMiniAppStudio: [];
}>();

const glossaryQuery = ref('');

onMounted(() => {
  glossaryQuery.value = '';
});

const filteredGlossary = computed<TechGlossaryItem[]>(() => {
  const q = glossaryQuery.value.trim().toLowerCase();
  if (!q) return TECH_GLOSSARY_TERMS;
  return TECH_GLOSSARY_TERMS.filter(
    (item) =>
      item.term.toLowerCase().includes(q) ||
      item.shortTag.toLowerCase().includes(q) ||
      item.explanation.toLowerCase().includes(q),
  );
});
</script>

<template>
  <div v-if="props.tab === 'onboarding'" class="space-y-3">
    <p class="rounded-xl border border-indigo-100 bg-indigo-50/70 px-3.5 py-2.5 text-xs leading-relaxed text-indigo-950 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200">
      Gợi ý thứ tự đọc 5 điểm cốt lõi để lập trình viên mới nắm toàn bộ luồng nghiệp vụ, Bridge Mini App và sự khác biệt giữa iOS ↔ Android
      <template v-if="props.techBranch">
        trên nhánh
        <code class="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] font-semibold dark:bg-slate-800 dark:text-cyan-300">{{ props.techBranch }}</code>
      </template>.
    </p>

    <ol class="space-y-2.5">
      <li
        v-for="item in DEV_ONBOARDING_STEPS"
        :key="item.step"
        class="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5 sm:flex-row sm:items-center dark:border-slate-800 dark:bg-slate-900/80"
      >
        <div class="flex items-start gap-3">
          <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 font-mono text-xs font-bold text-white">
            {{ item.step }}
          </span>
          <div class="space-y-1">
            <div class="text-xs font-bold text-slate-900 dark:text-slate-100">{{ item.title }}</div>
            <p class="text-xs leading-relaxed text-slate-600 dark:text-slate-400">{{ item.description }}</p>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-1.5 self-start sm:self-center">
          <button
            v-if="item.step === 4"
            type="button"
            class="inline-flex shrink-0 items-center gap-1 rounded-lg border border-cyan-300 bg-cyan-50 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-800 transition hover:bg-cyan-100 dark:border-cyan-500/35 dark:bg-cyan-500/15 dark:text-cyan-300 dark:hover:bg-cyan-500/25"
            @click="emit('openMiniAppStudio')"
          >
            <Terminal class="h-3 w-3" />
            Mở Dev Studio
          </button>
          <button
            type="button"
            class="inline-flex shrink-0 items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-cyan-500/35 dark:bg-cyan-500/12 dark:text-cyan-300 dark:hover:bg-cyan-500/20"
            @click="emit('jumpTech', item.nodeId, item.recommendedPlatform)"
          >
            Mở trên sơ đồ
            <ArrowRight class="h-3 w-3" />
          </button>
        </div>
      </li>
    </ol>
  </div>

  <div v-else class="space-y-3">
    <div class="relative">
      <Search class="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      <input
        v-model="glossaryQuery"
        type="text"
        placeholder="Lọc thuật ngữ (ví dụ: VPM, transId, PJSIP, MiniAppToken, DTMF)..."
        class="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pr-3 pl-9 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-cyan-500"
      />
    </div>

    <p v-if="filteredGlossary.length === 0" class="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
      Không tìm thấy thuật ngữ phù hợp với "{{ glossaryQuery }}".
    </p>

    <ul v-else class="space-y-2.5">
      <li
        v-for="item in filteredGlossary"
        :key="item.term"
        class="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900/80"
      >
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs font-bold text-slate-900 dark:text-slate-100">{{ item.term }}</span>
            <span class="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {{ item.shortTag }}
            </span>
          </div>
          <button
            v-if="item.relatedNodeId"
            type="button"
            class="inline-flex shrink-0 items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-cyan-500/35 dark:bg-cyan-500/12 dark:text-cyan-300 dark:hover:bg-cyan-500/20"
            @click="emit('jumpTech', item.relatedNodeId)"
          >
            Xem trên sơ đồ
            <ArrowRight class="h-3 w-3" />
          </button>
        </div>
        <p class="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
          {{ item.explanation }}
        </p>
      </li>
    </ul>
  </div>
</template>
