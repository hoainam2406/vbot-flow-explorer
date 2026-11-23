<script setup lang="ts">
import { computed, defineAsyncComponent, inject } from 'vue';
import {
  ArrowLeftRight,
  ChevronRight,
  GitBranch,
  HelpCircle,
  Moon,
  RotateCcw,
  Search,
  Settings,
  Sun,
} from 'lucide-vue-next';
import { FLOW_EXPLORER_KEY } from '../composables/useFlowExplorer';
import { useTheme } from '../composables/useTheme';
import { useToast } from '../composables/useToast';
import { getNodeDisplayLabel } from '../core/graphEngine';
import ExportMenu from './ExportMenu.vue';

const props = defineProps<{
  miniAppStudioOpen?: boolean;
  parityPageOpen?: boolean;
}>();

const emit = defineEmits<{
  openSearch: [];
  openParity: [];
  closeParity: [];
  openGuide: [];
  openSettings: [];
  openMiniappBridge: [];
  closeMiniappBridge: [];
}>();

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const { isDark, toggleTheme } = useTheme();
const { pushToast } = useToast();
const enableTechMode = __ENABLE_TECH_MODE__;
const isTechView = computed(() => enableTechMode && explorer.audienceMode.value === 'tech');

const techBranchLabel = computed(() =>
  __ENABLE_TECH_MODE__ && explorer.audienceMode.value === 'tech'
    ? (explorer.dataset.app.techBranch ?? null)
    : null,
);
const TechPlatformSwitcher = __ENABLE_TECH_MODE__
  ? defineAsyncComponent(() => import('./TechPlatformSwitcher.vue'))
  : null;

const onBreadcrumbClick = (nodeId: string) => {
  if (props.miniAppStudioOpen) {
    emit('closeMiniappBridge');
  }
  if (props.parityPageOpen) {
    emit('closeParity');
  }
  if (nodeId === explorer.dataset.rootNode.id) {
    explorer.setFocusRoot(null);
    explorer.selectedNodeId.value = null;
    return;
  }
  if (explorer.focusRootId.value) {
    explorer.setFocusRoot(nodeId);
  }
  explorer.jumpToNode(nodeId);
};

const onToggleTheme = () => {
  const next = toggleTheme();
  pushToast(next === 'dark' ? 'Đã chuyển sang giao diện Tối' : 'Đã chuyển sang giao diện Sáng', 'info');
};
</script>

<template>
  <header
    class="z-20 flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-200/85 bg-white/85 px-4 py-2 backdrop-blur-md dark:border-slate-800/85 dark:bg-[#0b1120]/85"
  >
    <div class="flex min-w-0 flex-1 items-center gap-2.5">
      <button
        type="button"
        class="flex shrink-0 items-center gap-2 rounded-lg px-1.5 py-1 text-left transition hover:bg-slate-100 dark:hover:bg-slate-800/70"
        @click="onBreadcrumbClick(explorer.dataset.rootNode.id)"
      >
        <span
          class="flex h-7 w-7 items-center justify-center rounded-lg shadow-xs ring-1"
          :class="
            isTechView
              ? 'bg-gradient-to-br from-cyan-500 to-indigo-600 text-white ring-cyan-400/40'
              : 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white ring-indigo-400/30'
          "
        >
          <svg viewBox="0 0 20 20" class="h-4 w-4" fill="none" aria-hidden="true">
            <circle cx="5" cy="10" r="2.2" fill="currentColor" />
            <circle cx="15" cy="5.5" r="2.2" fill="currentColor" />
            <circle cx="15" cy="14.5" r="2.2" fill="currentColor" />
            <path
              d="M7 9.4L13 6M7 10.6L13 14"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
          </svg>
        </span>

        <div class="flex items-center gap-1.5">
          <span class="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {{ explorer.dataset.app.name }}
          </span>
          <span
            v-if="explorer.dataset.app.version"
            class="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400"
          >
            {{ explorer.dataset.app.version }}
          </span>
          <span
            v-if="enableTechMode && techBranchLabel"
            class="hidden items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200 sm:inline-flex dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30"
            :title="`Dữ liệu kỹ thuật đối soát theo nhánh ${techBranchLabel} của VBot-iOS & VBot-Android`"
          >
            <GitBranch class="h-2.5 w-2.5" />
            {{ techBranchLabel }}
          </span>
        </div>
      </button>

      <nav
        v-if="!props.miniAppStudioOpen"
        aria-label="Breadcrumb"
        class="hidden min-w-0 items-center gap-1 overflow-x-auto text-xs text-slate-500 md:flex dark:text-slate-400"
      >
        <template v-for="(node, idx) in explorer.breadcrumbNodes.value" :key="node.id">
          <ChevronRight v-if="idx > 0" class="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-600" />
          <button
            type="button"
            class="max-w-40 truncate rounded-md px-2 py-1 font-medium transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            :class="
              idx === explorer.breadcrumbNodes.value.length - 1
                ? 'bg-slate-100 text-slate-900 dark:bg-slate-800/90 dark:text-slate-100'
                : 'text-slate-600 dark:text-slate-400'
            "
            @click="onBreadcrumbClick(node.id)"
          >
            {{ getNodeDisplayLabel(node, explorer.audienceMode.value) }}
          </button>
        </template>

        <button
          v-if="explorer.focusRootId.value"
          type="button"
          class="ml-1 inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800 transition hover:bg-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-1 dark:ring-amber-500/30 dark:hover:bg-amber-500/25"
          @click="explorer.setFocusRoot(null)"
        >
          <RotateCcw class="h-3 w-3" />
          Xem toàn bộ
        </button>
      </nav>
    </div>

    <div class="flex shrink-0 items-center gap-1.5 sm:gap-2">
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/90 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-white hover:text-slate-900 dark:border-slate-700/80 dark:bg-slate-900/90 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800 dark:hover:text-white"
        @click="emit('openSearch')"
      >
        <Search class="h-3.5 w-3.5 text-slate-400 dark:text-slate-400" />
        <span class="hidden sm:inline">Tìm nhanh & Lệnh</span>
        <kbd
          class="hidden rounded border border-slate-300 bg-white px-1.5 py-0.2 font-mono text-[10px] font-semibold text-slate-500 sm:inline dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
        >
          ⌘K
        </kbd>
      </button>

      <div
        v-if="enableTechMode && explorer.audienceMode.value === 'tech'"
        role="group"
        aria-label="Chuyển đổi Workspace"
        class="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold dark:border-slate-700/80 dark:bg-slate-900"
      >
        <button
          type="button"
          class="rounded-md px-2.5 py-1 transition"
          :class="
            !props.miniAppStudioOpen && !props.parityPageOpen
              ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          "
          @click="
            emit('closeMiniappBridge');
            emit('closeParity');
          "
        >
          Sơ đồ luồng
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 transition"
          :class="
            props.miniAppStudioOpen
              ? 'bg-cyan-600 text-white shadow-xs dark:bg-cyan-500/25 dark:text-cyan-300 dark:ring-1 dark:ring-cyan-500/40'
              : 'text-cyan-800 hover:text-cyan-950 dark:text-cyan-300 dark:hover:text-cyan-200'
          "
          title="Trình chạy thử luồng giao tiếp, tra cứu hàm @vbotma/sdk và danh mục 41 Mini App"
          @click="emit('openMiniappBridge')"
        >
          <ArrowLeftRight class="h-3.5 w-3.5" />
          <span class="hidden sm:inline">Mini App Studio</span>
        </button>
      </div>

      <component
        :is="TechPlatformSwitcher"
        v-if="TechPlatformSwitcher && explorer.audienceMode.value === 'tech' && !props.miniAppStudioOpen"
        :parity-active="props.parityPageOpen"
        @open-parity="emit('openParity')"
      />

      <div
        v-if="enableTechMode"
        class="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold dark:border-slate-700/80 dark:bg-slate-900"
      >
        <button
          type="button"
          class="rounded-md px-2.5 py-1 transition"
          :class="
            explorer.audienceMode.value === 'overview'
              ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          "
          @click="explorer.setAudienceMode('overview')"
        >
          Tổng quan
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-md px-2.5 py-1 transition"
          :class="
            explorer.audienceMode.value === 'tech'
              ? 'bg-slate-900 text-white shadow-xs dark:bg-cyan-500/20 dark:text-cyan-300 dark:ring-1 dark:ring-cyan-500/40'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          "
          @click="explorer.setAudienceMode('tech')"
        >
          <GitBranch class="h-3 w-3" />
          Kỹ thuật
        </button>
      </div>

      <ExportMenu v-if="!props.miniAppStudioOpen && !props.parityPageOpen" />

      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700/80 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800"
        title="Hướng dẫn thao tác, phím tắt & giải thích thuật ngữ (?)"
        @click="emit('openGuide')"
      >
        <HelpCircle class="h-3.5 w-3.5 text-indigo-600 dark:text-cyan-400" />
        <span class="hidden lg:inline">Hướng dẫn</span>
      </button>

      <button
        v-if="enableTechMode && explorer.audienceMode.value === 'tech'"
        type="button"
        title="Cài đặt đường dẫn code & Độ phủ Media"
        aria-label="Cài đặt Workspace"
        class="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700/80 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800 dark:hover:text-cyan-300"
        @click="emit('openSettings')"
      >
        <Settings class="h-4 w-4" />
      </button>

      <button
        type="button"
        :aria-label="isDark ? 'Chuyển sang giao diện Sáng' : 'Chuyển sang giao diện Tối'"
        :title="isDark ? 'Chuyển sang giao diện Sáng' : 'Chuyển sang giao diện Tối'"
        class="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700/80 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800 dark:hover:text-amber-300"
        @click="onToggleTheme"
      >
        <Sun v-if="isDark" class="h-4 w-4 text-amber-400" />
        <Moon v-else class="h-4 w-4" />
      </button>
    </div>
  </header>
</template>
