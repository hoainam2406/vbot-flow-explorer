<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue';
import { BookOpen, ChevronDown, ChevronUp, Compass, HelpCircle, Sparkles, X } from 'lucide-vue-next';
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
const legendOpen = ref(false);

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

interface LegendColorItem {
  label: string;
  desc: string;
  dotCls: string;
}

const PUBLIC_LEGEND_ITEMS: LegendColorItem[] = [
  { label: 'Module', desc: 'Nhóm chức năng lớn', dotCls: 'bg-indigo-600' },
  { label: 'Thao tác', desc: 'Bước người dùng thực hiện', dotCls: 'bg-blue-600' },
  { label: 'Xử lý', desc: 'Hệ thống tự xử lý', dotCls: 'bg-violet-600' },
  { label: 'Điều kiện', desc: 'Rẽ nhánh lựa chọn', dotCls: 'bg-amber-500' },
  { label: 'Hệ thống', desc: 'Kết nối dịch vụ / tổng đài', dotCls: 'bg-emerald-600' },
  { label: 'Lỗi / Retry', desc: 'Xử lý ngoại lệ & thử lại', dotCls: 'bg-rose-600' },
];

const TECH_EXTRA_LEGEND_ITEMS: LegendColorItem[] = __ENABLE_TECH_MODE__
  ? [
      {
        label: 'Mini App',
        desc: 'Lá đại diện cầu nối Host ↔ WebView JS',
        dotCls: 'bg-cyan-600',
      },
    ]
  : [];

const techBannerTip = __ENABLE_TECH_MODE__
  ? 'Mẹo cho Dev: Bấm thẻ xem codeRefs & luồng Host ↔ Mini App · ⌘K tìm hàm / .swift / .kt · Dùng So sánh / Chênh lệch đối chiếu iOS ↔ Android.'
  : '';

const legendItems = computed(() =>
  isTechView.value
    ? [PUBLIC_LEGEND_ITEMS[0], ...TECH_EXTRA_LEGEND_ITEMS, ...PUBLIC_LEGEND_ITEMS.slice(1)]
    : PUBLIC_LEGEND_ITEMS,
);
</script>

<template>
  <div
    v-if="!dismissedBanner"
    class="pointer-events-auto absolute top-3 left-3 z-10 max-w-2xl rounded-2xl border border-slate-200/90 bg-white/95 px-3.5 py-2.5 shadow-md backdrop-blur"
  >
    <div class="flex items-start justify-between gap-3">
      <div class="flex items-start gap-2.5">
        <span class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
          <Sparkles class="h-3.5 w-3.5" />
        </span>

        <div class="space-y-1.5">
          <p v-if="isTechView" class="text-xs leading-relaxed text-slate-700">
            {{ techBannerTip }}
          </p>
          <p v-else class="text-xs leading-relaxed text-slate-700">
            <span class="font-semibold text-slate-900">Cách xem nhanh:</span>
            Bấm vào thẻ để đọc chi tiết · Bấm nút
            <code class="rounded border border-slate-200 bg-slate-100 px-1 py-0.5 text-[10px] font-bold text-indigo-700">+N</code>
            (hoặc bấm đúp) để bung luồng · Giữ vùng trống để kéo sơ đồ.
          </p>

          <div class="flex flex-wrap items-center gap-2">
            <button
              v-if="canQuickDemoCalling"
              type="button"
              class="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-100"
              @click="openCallingSample"
            >
              <Compass class="h-3 w-3" />
              Mở thử Gọi thoại
            </button>

            <button
              type="button"
              class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
              @click="emit('openGuide')"
            >
              <BookOpen v-if="isTechView" class="h-3 w-3 text-indigo-600" />
              <HelpCircle v-else class="h-3 w-3 text-indigo-600" />
              {{ isTechView ? 'Từ điển VBot & Lộ trình Dev' : 'Hướng dẫn & Khái niệm' }}
            </button>
          </div>
        </div>
      </div>

      <button
        type="button"
        aria-label="Ẩn gợi ý thao tác"
        title="Ẩn gợi ý này"
        class="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        @click="dismissBanner"
      >
        <X class="h-3.5 w-3.5" />
      </button>
    </div>
  </div>

  <div class="pointer-events-auto absolute right-14 bottom-4 z-10 flex flex-col items-end">
    <div
      v-if="legendOpen"
      class="mb-2 w-72 rounded-2xl border border-slate-200 bg-white/95 p-3.5 shadow-xl backdrop-blur"
    >
      <div class="mb-2 flex items-center justify-between">
        <span class="text-[11px] font-bold tracking-wide text-slate-500 uppercase">
          Chú giải ký hiệu
        </span>
        <button
          type="button"
          class="rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          @click="legendOpen = false"
        >
          <X class="h-3.5 w-3.5" />
        </button>
      </div>

      <ul class="space-y-1.5">
        <li
          v-for="item in legendItems"
          :key="item.label"
          class="flex items-center gap-2 text-xs"
        >
          <span class="h-2.5 w-2.5 shrink-0 rounded-full" :class="item.dotCls" />
          <span class="font-semibold text-slate-800">{{ item.label }}:</span>
          <span class="text-slate-600">{{ item.desc }}</span>
        </li>
      </ul>

      <div class="mt-2.5 border-t border-slate-100 pt-2 text-[11px] leading-relaxed text-slate-600">
        Nút <span class="rounded-full border border-slate-300 bg-slate-50 px-1.5 py-0 font-bold text-indigo-700">+N</span> ở mép phải thẻ cho biết số bước con có thể bung / thu gọn.
      </div>

      <div
        v-if="enableTechMode && isTechView"
        class="mt-2 border-t border-slate-100 pt-2 text-[11px] text-slate-600"
      >
        <div class="mb-1 font-semibold text-slate-700">Nhãn kỹ thuật:</div>
        <div class="flex flex-wrap gap-1">
          <span class="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">Kỹ thuật</span>
          <span class="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-white">iOS</span>
          <span class="rounded border border-emerald-700 bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">Android</span>
          <span class="rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">iOS ≠ Android</span>
        </div>
      </div>
    </div>

    <button
      type="button"
      :aria-expanded="legendOpen"
      class="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur transition hover:border-slate-300 hover:bg-white"
      @click="legendOpen = !legendOpen"
    >
      <span class="flex -space-x-1">
        <span class="h-2.5 w-2.5 rounded-full bg-indigo-500 ring-1 ring-white" />
        <span class="h-2.5 w-2.5 rounded-full bg-amber-500 ring-1 ring-white" />
        <span class="h-2.5 w-2.5 rounded-full bg-emerald-500 ring-1 ring-white" />
      </span>
      <span>Chú giải</span>
      <ChevronDown v-if="legendOpen" class="h-3.5 w-3.5 text-slate-400" />
      <ChevronUp v-else class="h-3.5 w-3.5 text-slate-400" />
    </button>
  </div>
</template>
