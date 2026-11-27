<script setup lang="ts">
import { computed, inject, ref, type Component } from 'vue';
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowUpDown,
  Blocks,
  ChevronDown,
  ChevronUp,
  Cpu,
  GitFork,
  Globe,
  Image as ImageIcon,
  Layers,
  Maximize,
  Maximize2,
  Minimize2,
  Minus,
  MousePointerClick,
  Plus,
  X,
} from 'lucide-vue-next';
import { FLOW_EXPLORER_KEY } from '../composables/useFlowExplorer';
import { useToast } from '../composables/useToast';
import { saveLayoutDirection } from '../core/explorerPreferences';

const props = defineProps<{
  zoomPercent: number;
}>();

const emit = defineEmits<{
  zoomIn: [];
  zoomOut: [];
  resetZoom: [];
  fitView: [];
}>();

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const { pushToast } = useToast();
const enableTechMode = __ENABLE_TECH_MODE__;
const legendOpen = ref(false);

const isTechView = computed(() => enableTechMode && explorer.audienceMode.value === 'tech');

interface LegendColorItem {
  label: string;
  desc: string;
  dotCls: string;
  icon: Component;
}

const PUBLIC_LEGEND_ITEMS: LegendColorItem[] = [
  { label: 'Module', desc: 'Nhóm chức năng lớn', dotCls: 'bg-indigo-500', icon: Layers },
  { label: 'Thao tác', desc: 'Bước người dùng thực hiện', dotCls: 'bg-blue-500', icon: MousePointerClick },
  { label: 'Xử lý', desc: 'Hệ thống tự xử lý', dotCls: 'bg-violet-500', icon: Cpu },
  { label: 'Điều kiện', desc: 'Rẽ nhánh lựa chọn', dotCls: 'bg-amber-500', icon: GitFork },
  { label: 'Hệ thống', desc: 'Kết nối dịch vụ / tổng đài', dotCls: 'bg-emerald-500', icon: Globe },
  { label: 'Lỗi / Retry', desc: 'Xử lý ngoại lệ & thử lại', dotCls: 'bg-rose-500', icon: AlertTriangle },
];

const TECH_EXTRA_LEGEND_ITEMS: LegendColorItem[] = __ENABLE_TECH_MODE__
  ? [
      {
        label: 'Mini App',
        desc: 'Lá đại diện cầu nối Host ↔ WebView JS',
        dotCls: 'bg-cyan-500',
        icon: Blocks,
      },
    ]
  : [];

const legendItems = computed(() =>
  isTechView.value
    ? [PUBLIC_LEGEND_ITEMS[0], ...TECH_EXTRA_LEGEND_ITEMS, ...PUBLIC_LEGEND_ITEMS.slice(1)]
    : PUBLIC_LEGEND_ITEMS,
);

const onToggleDirection = () => {
  const next = explorer.toggleLayoutDirection();
  saveLayoutDirection(next);
  pushToast(next === 'TB' ? 'Sơ đồ hướng dọc (TB)' : 'Sơ đồ hướng ngang (LR)', 'info');
};

const onToggleZen = () => {
  const next = explorer.toggleZenMode();
  pushToast(next ? 'Đã bật Zen Mode (Esc hoặc Z để thoát)' : 'Đã thoát Zen Mode', 'info');
};
</script>

<template>
  <div data-tour="canvas-dock" class="pointer-events-auto absolute right-4 bottom-4 z-20 flex flex-col items-end gap-2">
    <Transition name="vbot-toast">
      <div
        v-if="legendOpen"
        class="w-76 rounded-2xl border border-slate-200/90 bg-white/95 p-3.5 shadow-xl backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-900/95"
      >
        <div class="mb-2 flex items-center justify-between">
          <span class="text-[11px] font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400">
            Chú giải ký hiệu
          </span>
          <button
            type="button"
            aria-label="Đóng chú giải"
            class="rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
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
            <component :is="item.icon" class="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
            <span class="font-semibold text-slate-800 dark:text-slate-200">{{ item.label }}:</span>
            <span class="text-slate-600 dark:text-slate-400">{{ item.desc }}</span>
          </li>
        </ul>

        <div class="mt-2.5 border-t border-slate-100 pt-2 text-[11px] leading-relaxed text-slate-600 dark:border-slate-800 dark:text-slate-400">
          Nút <span class="rounded-full border border-slate-300 bg-slate-50 px-1.5 py-0 font-mono font-bold text-indigo-700 dark:border-slate-600 dark:bg-slate-800 dark:text-cyan-300">+N</span> ở mép thẻ cho biết số bước con có thể bung / thu gọn.
        </div>

        <div
          v-if="enableTechMode && isTechView"
          class="mt-2 border-t border-slate-100 pt-2 text-[11px] text-slate-600 dark:border-slate-800 dark:text-slate-400"
        >
          <div class="mb-1 font-semibold text-slate-700 dark:text-slate-300">Nhãn kỹ thuật:</div>
          <div class="flex flex-wrap gap-1">
            <span class="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">Kỹ thuật</span>
            <span class="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-white dark:border-slate-600 dark:bg-slate-700">iOS</span>
            <span class="rounded border border-emerald-700 bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">Android</span>
            <span class="rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300">iOS ≠ Android</span>
          </div>
        </div>
      </div>
    </Transition>

    <div
      class="flex items-center gap-0.5 rounded-2xl border border-slate-200/90 bg-white/90 p-1 shadow-xl backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-900/90"
    >
      <button
        type="button"
        aria-label="Thu nhỏ"
        title="Thu nhỏ"
        class="rounded-xl p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
        @click="emit('zoomOut')"
      >
        <Minus class="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        title="Đặt thu phóng về 100%"
        class="min-w-11 rounded-lg px-1.5 py-1 text-center font-mono text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white"
        @click="emit('resetZoom')"
      >
        {{ props.zoomPercent }}%
      </button>

      <button
        type="button"
        aria-label="Phóng to"
        title="Phóng to"
        class="rounded-xl p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
        @click="emit('zoomIn')"
      >
        <Plus class="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        aria-label="Căn vừa khung nhìn"
        title="Căn vừa khung nhìn (F)"
        class="rounded-xl p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
        @click="emit('fitView')"
      >
        <Maximize class="h-3.5 w-3.5" />
      </button>

      <span class="mx-1 h-4 w-px bg-slate-200 dark:bg-slate-700/80" />

      <button
        type="button"
        :title="`Hướng sơ đồ: ${explorer.layoutDirection.value === 'LR' ? 'Ngang (LR) — bấm để đổi Dọc' : 'Dọc (TB) — bấm để đổi Ngang'}`"
        class="inline-flex items-center gap-1 rounded-xl px-2 py-1.5 font-mono text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-indigo-600 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-cyan-300"
        @click="onToggleDirection"
      >
        <ArrowLeftRight v-if="explorer.layoutDirection.value === 'LR'" class="h-3.5 w-3.5" />
        <ArrowUpDown v-else class="h-3.5 w-3.5" />
        <span>{{ explorer.layoutDirection.value }}</span>
      </button>

      <button
        type="button"
        :aria-pressed="explorer.accordionMode.value"
        title="Chỉ mở 1 nhánh cùng cấp (Accordion)"
        class="inline-flex items-center gap-1 rounded-xl px-2 py-1.5 text-xs font-semibold transition"
        :class="
          explorer.accordionMode.value
            ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300'
            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
        "
        @click="explorer.accordionMode.value = !explorer.accordionMode.value"
      >
        <Layers class="h-3.5 w-3.5" />
        <span class="hidden xl:inline">1 nhánh</span>
      </button>

      <button
        v-if="explorer.dataset.hasRealMedia !== false"
        type="button"
        :aria-pressed="explorer.showCanvasMedia.value"
        title="Hiển thị ảnh thu gọn ngay trên thẻ sơ đồ"
        class="inline-flex items-center gap-1 rounded-xl px-2 py-1.5 text-xs font-semibold transition"
        :class="
          explorer.showCanvasMedia.value
            ? 'bg-blue-50 text-blue-700 dark:bg-cyan-500/20 dark:text-cyan-300'
            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
        "
        @click="explorer.showCanvasMedia.value = !explorer.showCanvasMedia.value"
      >
        <ImageIcon class="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        :aria-expanded="legendOpen"
        title="Chú giải ký hiệu màu sắc"
        class="inline-flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-xs font-semibold transition"
        :class="
          legendOpen
            ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white'
            : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
        "
        @click="legendOpen = !legendOpen"
      >
        <span class="flex -space-x-1">
          <span class="h-2.5 w-2.5 rounded-full bg-indigo-500 ring-1 ring-white dark:ring-slate-900" />
          <span class="h-2.5 w-2.5 rounded-full bg-amber-500 ring-1 ring-white dark:ring-slate-900" />
          <span class="h-2.5 w-2.5 rounded-full bg-emerald-500 ring-1 ring-white dark:ring-slate-900" />
        </span>
        <span class="hidden md:inline">Chú giải</span>
        <ChevronDown v-if="legendOpen" class="h-3 w-3 text-slate-400" />
        <ChevronUp v-else class="h-3 w-3 text-slate-400" />
      </button>

      <button
        type="button"
        :aria-pressed="explorer.zenMode.value"
        :title="explorer.zenMode.value ? 'Thoát chế độ trình chiếu (Z)' : 'Chế độ trình chiếu toàn màn hình (Z)'"
        class="rounded-xl p-1.5 transition"
        :class="
          explorer.zenMode.value
            ? 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
        "
        @click="onToggleZen"
      >
        <Minimize2 v-if="explorer.zenMode.value" class="h-3.5 w-3.5" />
        <Maximize2 v-else class="h-3.5 w-3.5" />
      </button>
    </div>
  </div>
</template>
