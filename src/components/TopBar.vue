<script setup lang="ts">
import { computed, defineAsyncComponent, inject, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  ChevronRight,
  GitBranch,
  HelpCircle,
  Loader2,
  Moon,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Sun,
} from 'lucide-vue-next';
import { FLOW_EXPLORER_KEY } from '../composables/useFlowExplorer';
import { useTheme } from '../composables/useTheme';
import { useToast } from '../composables/useToast';
import { getNodeDisplayLabel } from '../core/graphEngine';
import type { FlowBranchInfo } from '../data/schema';
import ExportMenu from './ExportMenu.vue';

const props = defineProps<{
  miniAppStudioOpen?: boolean;
  parityPageOpen?: boolean;
  governancePageOpen?: boolean;
  availableBranches?: FlowBranchInfo[];
  activeBranchId?: string;
  branchLoading?: boolean;
}>();

const emit = defineEmits<{
  openSearch: [];
  openParity: [];
  closeParity: [];
  openGuide: [];
  openSettings: [];
  openMiniappBridge: [];
  closeMiniappBridge: [];
  openGovernance: [];
  closeGovernance: [];
  switchBranch: [branchId: string];
}>();

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const { isDark, toggleTheme } = useTheme();
const { pushToast } = useToast();
const enableTechMode = __ENABLE_TECH_MODE__;
const isTechView = computed(() => enableTechMode && explorer.audienceMode.value === 'tech');

const branchMenuOpen = ref(false);
const branchMenuRef = ref<HTMLElement | null>(null);
const hasMultiBranch = computed(
  () => enableTechMode && (props.availableBranches?.length ?? 0) > 1,
);
const currentBranchId = computed(() =>
  __ENABLE_TECH_MODE__
    ? props.activeBranchId || explorer.activeBranchId.value || explorer.dataset.app.techBranch || ''
    : '',
);

const techBranchLabel = computed(() =>
  __ENABLE_TECH_MODE__ && explorer.audienceMode.value === 'tech'
    ? (explorer.dataset.app.techBranch ?? null)
    : null,
);
const TechPlatformSwitcher = __ENABLE_TECH_MODE__
  ? defineAsyncComponent(() => import('./TechPlatformSwitcher.vue'))
  : null;

const toggleBranchMenu = () => {
  if (!hasMultiBranch.value || props.branchLoading) return;
  branchMenuOpen.value = !branchMenuOpen.value;
};

const selectBranch = (branchId: string) => {
  branchMenuOpen.value = false;
  if (branchId !== currentBranchId.value) {
    emit('switchBranch', branchId);
  }
};

const onDocumentPointerDown = (event: MouseEvent) => {
  if (!branchMenuOpen.value) return;
  const target = event.target as Node | null;
  if (branchMenuRef.value && target && !branchMenuRef.value.contains(target)) {
    branchMenuOpen.value = false;
  }
};

const onWindowKeyDown = (event: KeyboardEvent) => {
  if (branchMenuOpen.value && event.key === 'Escape') {
    branchMenuOpen.value = false;
  }
};

onMounted(() => {
  document.addEventListener('mousedown', onDocumentPointerDown);
  window.addEventListener('keydown', onWindowKeyDown);
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentPointerDown);
  window.removeEventListener('keydown', onWindowKeyDown);
});

const onBreadcrumbClick = (nodeId: string) => {
  if (props.miniAppStudioOpen) {
    emit('closeMiniappBridge');
  }
  if (props.parityPageOpen) {
    emit('closeParity');
  }
  if (props.governancePageOpen) {
    emit('closeGovernance');
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
            v-if="enableTechMode && !hasMultiBranch && techBranchLabel"
            class="hidden items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200 sm:inline-flex dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30"
            :title="`Dữ liệu kỹ thuật đối soát theo nhánh ${techBranchLabel} của VBot-iOS & VBot-Android`"
          >
            <GitBranch class="h-2.5 w-2.5" />
            {{ techBranchLabel }}
          </span>
        </div>
      </button>

      <div
        v-if="enableTechMode && hasMultiBranch"
        ref="branchMenuRef"
        class="relative shrink-0"
      >
        <button
          type="button"
          aria-haspopup="menu"
          :aria-expanded="branchMenuOpen"
          :disabled="props.branchLoading"
          class="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/90 px-2 py-1 font-mono text-[11px] font-semibold text-emerald-800 shadow-2xs transition hover:border-emerald-300 hover:bg-emerald-100/80 disabled:opacity-70 dark:border-emerald-500/35 dark:bg-emerald-500/12 dark:text-emerald-300 dark:hover:border-emerald-400/50 dark:hover:bg-emerald-500/20"
          :title="`Đang xem nhánh ${currentBranchId} (bấm để chọn nhánh đối soát VBot-iOS & VBot-Android)`"
          @click="toggleBranchMenu"
        >
          <Loader2 v-if="props.branchLoading" class="h-3 w-3 animate-spin" />
          <GitBranch v-else class="h-3 w-3 shrink-0" />
          <span>{{ currentBranchId }}</span>
          <ChevronDown
            class="h-3 w-3 shrink-0 opacity-75 transition-transform"
            :class="{ 'rotate-180': branchMenuOpen }"
          />
        </button>

        <Transition name="vbot-toast">
          <div
            v-if="branchMenuOpen"
            role="menu"
            aria-label="Chọn nhánh đối soát"
            class="absolute left-0 top-full z-40 mt-1.5 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white/95 p-1.5 shadow-xl backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-900/95"
          >
            <div class="px-2.5 py-1.5 text-[10px] font-bold tracking-wider text-slate-400 uppercase dark:text-slate-500">
              Nhánh đối soát (iOS &amp; Android)
            </div>
            <button
              v-for="branch in props.availableBranches"
              :key="branch.id"
              type="button"
              role="menuitemradio"
              :aria-checked="branch.id === currentBranchId"
              class="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition"
              :class="
                branch.id === currentBranchId
                  ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200'
                  : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800/80'
              "
              @click="selectBranch(branch.id)"
            >
              <GitBranch
                class="mt-0.5 h-3.5 w-3.5 shrink-0"
                :class="
                  branch.id === currentBranchId
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-400'
                "
              />
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                  <span class="font-mono text-xs font-semibold">{{ branch.label }}</span>
                  <span
                    v-if="branch.isDefault"
                    class="rounded bg-slate-200/80 px-1 py-0.2 text-[9px] font-semibold text-slate-600 uppercase dark:bg-slate-700 dark:text-slate-300"
                  >
                    Mặc định
                  </span>
                </div>
                <p
                  v-if="branch.description"
                  class="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400"
                >
                  {{ branch.description }}
                </p>
              </div>
              <Check
                v-if="branch.id === currentBranchId"
                class="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
              />
            </button>
          </div>
        </Transition>
      </div>

      <nav
        v-if="!props.miniAppStudioOpen && !props.governancePageOpen"
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
            !props.miniAppStudioOpen && !props.parityPageOpen && !props.governancePageOpen
              ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          "
          @click="
            emit('closeMiniappBridge');
            emit('closeParity');
            emit('closeGovernance');
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
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 transition"
          :class="
            props.governancePageOpen
              ? 'bg-indigo-600 text-white shadow-xs dark:bg-indigo-500/25 dark:text-indigo-200 dark:ring-1 dark:ring-indigo-400/40'
              : 'text-indigo-700 hover:text-indigo-950 dark:text-indigo-300 dark:hover:text-indigo-200'
          "
          title="QA Release Hub, Sức khỏe Dữ liệu & Upload Media, So sánh Phiên bản Luồng"
          @click="emit('openGovernance')"
        >
          <ShieldCheck class="h-3.5 w-3.5" />
          <span class="hidden sm:inline">QA &amp; Quản trị</span>
        </button>
      </div>

      <component
        :is="TechPlatformSwitcher"
        v-if="TechPlatformSwitcher && explorer.audienceMode.value === 'tech' && !props.miniAppStudioOpen && !props.governancePageOpen"
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

      <ExportMenu v-if="!props.miniAppStudioOpen && !props.parityPageOpen && !props.governancePageOpen" />

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
