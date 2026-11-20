<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue';
import { BookOpen, Compass, HelpCircle, Sparkles, X } from 'lucide-vue-next';
import { FLOW_EXPLORER_KEY } from '../composables/useFlowExplorer';
import {
  loadOnboardingDismissed,
  saveOnboardingDismissed,
} from '../core/explorerPreferences';

const emit = defineEmits<{
  openGuide: [];
}>();

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const enableTechMode = __ENABLE_TECH_MODE__;
const dismissedBanner = ref(false);

onMounted(() => {
  dismissedBanner.value = loadOnboardingDismissed();
});

const dismissBanner = () => {
  dismissedBanner.value = true;
  saveOnboardingDismissed(true);
};

const isTechView = computed(() => enableTechMode && explorer.audienceMode.value === 'tech');

const canQuickDemoCalling = computed(
  () =>
    !explorer.expandedIds.value.has('mod-calling') &&
    Boolean(explorer.findNode('mod-calling')),
);

const openCallingSample = () => {
  if (!explorer.expandedIds.value.has('mod-calling')) {
    explorer.toggleExpand('mod-calling');
  }
  explorer.selectNode('mod-calling', { recordHistory: false });
};

const techBannerTip = __ENABLE_TECH_MODE__
  ? 'Mẹo cho Dev: Bấm thẻ xem chi tiết & Bridge · ⌘K tìm hàm / lệnh · Rê chuột lên thẻ để soi nhánh liên kết · Dùng So sánh / Chênh lệch đối chiếu iOS ↔ Android.'
  : '';
</script>

<template>
  <div
    v-if="!dismissedBanner"
    class="pointer-events-auto max-w-2xl rounded-2xl border border-slate-200/90 bg-white/92 px-3.5 py-2.5 shadow-md backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-900/90"
  >
    <div class="flex items-start justify-between gap-3">
      <div class="flex items-start gap-2.5">
        <span class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-cyan-500/15 dark:text-cyan-300">
          <Sparkles class="h-3.5 w-3.5" />
        </span>

        <div class="space-y-1.5">
          <p v-if="isTechView" class="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
            {{ techBannerTip }}
          </p>
          <p v-else class="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
            <span class="font-semibold text-slate-900 dark:text-slate-100">Cách xem nhanh:</span>
            Bấm vào thẻ để đọc chi tiết · Bấm nút
            <code class="rounded border border-slate-200 bg-slate-100 px-1 py-0.5 font-mono text-[10px] font-bold text-indigo-700 dark:border-slate-700 dark:bg-slate-800 dark:text-cyan-300">+N</code>
            (hoặc bấm đúp) để bung luồng · Giữ vùng trống để kéo sơ đồ.
          </p>

          <div class="flex flex-wrap items-center gap-2">
            <button
              v-if="canQuickDemoCalling"
              type="button"
              class="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-cyan-500/35 dark:bg-cyan-500/12 dark:text-cyan-300 dark:hover:bg-cyan-500/20"
              @click="openCallingSample"
            >
              <Compass class="h-3 w-3" />
              Mở thử Gọi thoại
            </button>

            <button
              type="button"
              class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-800"
              @click="emit('openGuide')"
            >
              <BookOpen v-if="isTechView" class="h-3 w-3 text-indigo-600 dark:text-cyan-400" />
              <HelpCircle v-else class="h-3 w-3 text-indigo-600 dark:text-cyan-400" />
              {{ isTechView ? 'Từ điển VBot & Lộ trình Dev' : 'Hướng dẫn & Phím tắt' }}
            </button>
          </div>
        </div>
      </div>

      <button
        type="button"
        aria-label="Ẩn gợi ý thao tác"
        title="Ẩn gợi ý này"
        class="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        @click="dismissBanner"
      >
        <X class="h-3.5 w-3.5" />
      </button>
    </div>
  </div>
</template>
