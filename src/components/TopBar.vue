<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  ChevronDown,
  GitBranch,
  GitCompare,
  HelpCircle,
  Loader2,
  Moon,
  Network,
  Scale,
  Search,
  Settings,
  Sun,
  Terminal,
} from 'lucide-vue-next';
import { FLOW_EXPLORER_KEY } from '../composables/useFlowExplorer';
import { useTheme } from '../composables/useTheme';
import { useToast } from '../composables/useToast';
import type { LocalGitStatusResult } from '../core/sourcePeekClient';
import type { FlowBranchInfo, MergedFlowDataset } from '../data/schema';

const props = defineProps<{
  miniAppStudioOpen?: boolean;
  parityPageOpen?: boolean;
  governancePageOpen?: boolean;
  availableBranches?: FlowBranchInfo[];
  activeBranchId?: string;
  branchLoading?: boolean;
  localGitStatus?: LocalGitStatusResult | null;
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
  compareBranch: [branchId: string];
  highlightGitDirty: [];
}>();

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const { isDark, toggleTheme } = useTheme();
const { pushToast } = useToast();
const enableTechMode = __ENABLE_TECH_MODE__;
const isTechView = computed(() => enableTechMode && explorer.audienceMode.value === 'tech');

const parityTotal = ref<number | null>(null);
let extractParityReportFn: ((ds: MergedFlowDataset) => { total: number }) | null = null;

if (__ENABLE_TECH_MODE__) {
  watch(
    () => explorer.datasetRef.value,
    async (ds) => {
      if (!extractParityReportFn) {
        const mod = await import('../core/parityAnalyzer');
        extractParityReportFn = mod.extractParityReport;
      }
      parityTotal.value = extractParityReportFn(ds).total;
    },
    { immediate: true },
  );
}

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

const gitStatusMismatch = computed(() => {
  const st = props.localGitStatus;
  if (!st) return false;
  const iosBranch = st.ios?.branch;
  const andBranch = st.android?.branch;
  if (iosBranch && andBranch && iosBranch !== andBranch) return true;
  if (currentBranchId.value && iosBranch && iosBranch !== currentBranchId.value) return true;
  if (currentBranchId.value && andBranch && andBranch !== currentBranchId.value) return true;
  return false;
});

const gitDirtyCount = computed(() => {
  const st = props.localGitStatus;
  if (!st) return 0;
  return (st.ios?.dirtyCount ?? 0) + (st.android?.dirtyCount ?? 0);
});

const hasLocalGitStatus = computed(
  () =>
    isTechView.value &&
    Boolean(props.localGitStatus && (props.localGitStatus.ios || props.localGitStatus.android)),
);

const canOpenBranchMenu = computed(
  () => !props.branchLoading && (hasMultiBranch.value || hasLocalGitStatus.value),
);

const branchTriggerTitle = computed(() => {
  const parts: string[] = [];
  if (currentBranchId.value) {
    parts.push(`Đang xem nhánh ${currentBranchId.value}`);
  } else {
    parts.push('Trạng thái Git Local');
  }
  if (isTechView.value && gitDirtyCount.value > 0) {
    parts.push(`${gitDirtyCount.value} file đang sửa`);
  }
  if (isTechView.value && gitStatusMismatch.value) {
    parts.push('nhánh local đang lệch');
  }
  return `${parts.join(' · ')} (bấm để mở tùy chọn)`;
});

const toggleBranchMenu = () => {
  if (!canOpenBranchMenu.value) return;
  branchMenuOpen.value = !branchMenuOpen.value;
};

const selectBranch = (branchId: string) => {
  branchMenuOpen.value = false;
  if (branchId !== currentBranchId.value) {
    emit('switchBranch', branchId);
  }
};

const triggerCompareBranch = (branchId: string) => {
  branchMenuOpen.value = false;
  emit('compareBranch', branchId);
};

const triggerHighlightGitDirty = () => {
  branchMenuOpen.value = false;
  emit('highlightGitDirty');
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

const onBrandClick = () => {
  if (props.miniAppStudioOpen) {
    emit('closeMiniappBridge');
  }
  if (props.parityPageOpen) {
    emit('closeParity');
  }
  if (props.governancePageOpen) {
    emit('closeGovernance');
  }
  explorer.setFocusRoot(null);
  explorer.selectedNodeId.value = null;
};

const onToggleTheme = () => {
  const next = toggleTheme();
  pushToast(next === 'dark' ? 'Đã chuyển sang giao diện Tối' : 'Đã chuyển sang giao diện Sáng', 'info');
};
</script>

<template>
  <header
    class="z-30 flex h-12 shrink-0 items-center justify-between gap-2 border-b border-slate-200/85 bg-white/90 px-3 backdrop-blur-md sm:px-4 dark:border-slate-800/85 dark:bg-[#0b1120]/90"
  >
    <!-- Vùng Trái: Brand + Nhánh/Git gộp -->
    <div class="flex shrink-0 items-center gap-2">
      <button
        type="button"
        data-tour="topbar-brand"
        class="flex shrink-0 items-center gap-2 rounded-lg px-1.5 py-1 text-left transition hover:bg-slate-100 dark:hover:bg-slate-800/70"
        @click="onBrandClick"
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
            class="hidden rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-600 xl:inline-flex dark:bg-slate-800 dark:text-slate-400"
          >
            {{ explorer.dataset.app.version }}
          </span>
          <span
            v-if="enableTechMode && !hasMultiBranch && !hasLocalGitStatus && techBranchLabel"
            class="hidden items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200 sm:inline-flex dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30"
            :title="`Dữ liệu kỹ thuật đối soát theo nhánh ${techBranchLabel} của VBot-iOS & VBot-Android`"
          >
            <GitBranch class="h-2.5 w-2.5" />
            {{ techBranchLabel }}
          </span>
        </div>
      </button>

      <div
        v-if="enableTechMode && (hasMultiBranch || hasLocalGitStatus)"
        ref="branchMenuRef"
        data-tour="topbar-branch"
        class="relative shrink-0"
      >
        <button
          type="button"
          aria-haspopup="menu"
          :aria-expanded="branchMenuOpen"
          :disabled="props.branchLoading"
          class="inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 font-mono text-[11px] font-semibold shadow-2xs transition disabled:opacity-70"
          :class="
            isTechView && gitStatusMismatch
              ? 'border-amber-300 bg-amber-50/90 text-amber-900 hover:border-amber-400 hover:bg-amber-100/80 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200 dark:hover:border-amber-400/60 dark:hover:bg-amber-500/25'
              : 'border-emerald-200 bg-emerald-50/90 text-emerald-800 hover:border-emerald-300 hover:bg-emerald-100/80 dark:border-emerald-500/35 dark:bg-emerald-500/12 dark:text-emerald-300 dark:hover:border-emerald-400/50 dark:hover:bg-emerald-500/20'
          "
          :title="branchTriggerTitle"
          @click="toggleBranchMenu"
        >
          <Loader2 v-if="props.branchLoading" class="h-3 w-3 shrink-0 animate-spin" />
          <AlertTriangle v-else-if="isTechView && gitStatusMismatch" class="h-3 w-3 shrink-0 text-amber-500" />
          <GitBranch v-else class="h-3 w-3 shrink-0" />
          <span class="max-w-[140px] truncate">{{ currentBranchId || 'Git Local' }}</span>
          <span
            v-if="isTechView && gitDirtyCount > 0"
            class="rounded-full bg-indigo-600 px-1.5 py-0 font-mono text-[10px] font-bold text-white dark:bg-cyan-500 dark:text-slate-950"
          >
            {{ gitDirtyCount }}
          </span>
          <ChevronDown
            class="h-3 w-3 shrink-0 opacity-75 transition-transform"
            :class="{ 'rotate-180': branchMenuOpen }"
          />
        </button>

        <Transition name="vbot-toast">
          <div
            v-if="branchMenuOpen"
            role="menu"
            aria-label="Chọn nhánh đối soát & Git Local"
            class="absolute left-0 top-full z-40 mt-1.5 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white/95 p-1.5 shadow-xl backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-900/95"
          >
            <template v-if="hasMultiBranch">
              <div class="px-2.5 py-1.5 text-[10px] font-bold tracking-wider text-slate-400 uppercase dark:text-slate-500">
                Nhánh đối soát (iOS &amp; Android)
              </div>
              <div
                v-for="branch in props.availableBranches"
                :key="branch.id"
                class="rounded-lg transition"
                :class="
                  branch.id === currentBranchId
                    ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800/80'
                "
              >
                <button
                  type="button"
                  role="menuitemradio"
                  :aria-checked="branch.id === currentBranchId"
                  class="flex w-full items-start gap-2 px-2.5 py-2 text-left"
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
                <div
                  v-if="branch.id !== currentBranchId"
                  class="border-t border-slate-100 px-2.5 pb-1.5 pt-1 dark:border-slate-800"
                >
                  <button
                    type="button"
                    class="inline-flex w-full items-center justify-center gap-1 rounded-md border border-indigo-200 bg-indigo-50/80 px-2 py-1 text-[10.5px] font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-cyan-500/35 dark:bg-cyan-500/10 dark:text-cyan-300 dark:hover:bg-cyan-500/20"
                    @click.stop="triggerCompareBranch(branch.id)"
                  >
                    <GitCompare class="h-3 w-3" />
                    So sánh diff trên sơ đồ
                  </button>
                </div>
              </div>
            </template>

            <div
              v-if="hasLocalGitStatus && props.localGitStatus"
              :class="hasMultiBranch ? 'mt-1.5 border-t border-slate-100 pt-1.5 dark:border-slate-800' : ''"
            >
              <div class="px-2.5 py-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase dark:text-slate-500">
                Git Local đang checkout
              </div>
              <div class="space-y-1 px-2.5 pb-2">
                <div
                  v-if="props.localGitStatus.ios"
                  class="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-700 dark:bg-slate-800/70 dark:text-slate-300"
                >
                  <span class="font-bold text-slate-500 dark:text-slate-400">iOS</span>
                  <span class="min-w-0 flex-1 truncate">{{ props.localGitStatus.ios.branch || '?' }}</span>
                  <span
                    v-if="props.localGitStatus.ios.dirtyCount > 0"
                    class="rounded bg-indigo-100 px-1.5 py-0 text-[10px] font-bold text-indigo-700 dark:bg-cyan-500/20 dark:text-cyan-300"
                  >
                    {{ props.localGitStatus.ios.dirtyCount }} sửa
                  </span>
                </div>
                <div
                  v-if="props.localGitStatus.android"
                  class="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-700 dark:bg-slate-800/70 dark:text-slate-300"
                >
                  <span class="font-bold text-slate-500 dark:text-slate-400">Android</span>
                  <span class="min-w-0 flex-1 truncate">{{ props.localGitStatus.android.branch || '?' }}</span>
                  <span
                    v-if="props.localGitStatus.android.dirtyCount > 0"
                    class="rounded bg-indigo-100 px-1.5 py-0 text-[10px] font-bold text-indigo-700 dark:bg-cyan-500/20 dark:text-cyan-300"
                  >
                    {{ props.localGitStatus.android.dirtyCount }} sửa
                  </span>
                </div>

                <p
                  v-if="gitStatusMismatch"
                  class="flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-[10.5px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                >
                  <AlertTriangle class="h-3 w-3 shrink-0 text-amber-500" />
                  <span>Nhánh local đang khác nhánh đối soát</span>
                </p>

                <button
                  type="button"
                  class="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50/90 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-cyan-500/35 dark:bg-cyan-500/12 dark:text-cyan-300 dark:hover:bg-cyan-500/20"
                  @click="triggerHighlightGitDirty"
                >
                  <GitBranch class="h-3 w-3 shrink-0" />
                  <span>
                    {{
                      gitDirtyCount > 0
                        ? `Tô sáng ${gitDirtyCount} file đang sửa trên sơ đồ`
                        : 'Kiểm tra & tô sáng file đang sửa'
                    }}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </div>

    <!-- Vùng Giữa: 4 Workspace toàn trang (chỉ hiện ở Kỹ thuật) -->
    <div
      v-if="enableTechMode && explorer.audienceMode.value === 'tech'"
      role="group"
      aria-label="Chuyển đổi Workspace"
      data-tour="topbar-workspaces"
      class="inline-flex shrink-0 items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold dark:border-slate-700/80 dark:bg-slate-900"
    >
      <button
        type="button"
        title="Sơ đồ luồng hệ thống"
        class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 transition"
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
        <Network class="h-3.5 w-3.5 shrink-0" />
        <span class="hidden lg:inline">Sơ đồ luồng</span>
      </button>
      <button
        type="button"
        title="Xem bảng tổng hợp mọi điểm khác biệt iOS ↔ Android"
        class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 transition"
        :class="
          props.parityPageOpen
            ? 'bg-amber-500 text-white shadow-xs dark:bg-amber-500/85 dark:text-slate-950'
            : 'text-amber-700 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-200'
        "
        @click="emit('openParity')"
      >
        <Scale class="h-3.5 w-3.5 shrink-0" />
        <span class="hidden lg:inline">Chênh lệch</span>
        <span
          v-if="parityTotal !== null"
          class="rounded-full px-1.5 py-0 font-mono text-[10px] font-bold"
          :class="
            props.parityPageOpen
              ? 'bg-white/25 text-white dark:bg-slate-950/20 dark:text-slate-950'
              : 'bg-amber-200/80 text-amber-950 dark:bg-amber-500/25 dark:text-amber-200'
          "
        >
          {{ parityTotal }}
        </span>
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 transition"
        :class="
          props.miniAppStudioOpen
            ? 'bg-cyan-600 text-white shadow-xs dark:bg-cyan-500/25 dark:text-cyan-300 dark:ring-1 dark:ring-cyan-500/40'
            : 'text-cyan-800 hover:text-cyan-950 dark:text-cyan-300 dark:hover:text-cyan-200'
        "
        title="Trình chạy thử luồng giao tiếp, tra cứu hàm @vbotma/sdk và danh mục 42 Mini App"
        @click="emit('openMiniappBridge')"
      >
        <ArrowLeftRight class="h-3.5 w-3.5 shrink-0" />
        <span class="hidden md:inline xl:hidden">Mini App</span>
        <span class="hidden xl:inline">Mini App Studio</span>
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 transition"
        :class="
          props.governancePageOpen
            ? 'bg-indigo-600 text-white shadow-xs dark:bg-indigo-500/25 dark:text-indigo-200 dark:ring-1 dark:ring-indigo-400/40'
            : 'text-indigo-700 hover:text-indigo-950 dark:text-indigo-300 dark:hover:text-indigo-200'
        "
        title="API & Event Atlas, Debug Log Tracer, Branch/Snapshot Diff và Sức khỏe Dữ liệu"
        @click="emit('openGovernance')"
      >
        <Terminal class="h-3.5 w-3.5 shrink-0" />
        <span class="hidden md:inline">Dev Tools</span>
      </button>
    </div>

    <!-- Vùng Phải: Tìm nhanh + Tổng quan/Kỹ thuật + 3 icon tiện ích -->
    <div class="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        data-tour="topbar-search"
        title="Tìm nhanh & Bảng lệnh (⌘K)"
        class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/90 px-2.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-white hover:text-slate-900 dark:border-slate-700/80 dark:bg-slate-900/90 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800 dark:hover:text-white"
        @click="emit('openSearch')"
      >
        <Search class="h-3.5 w-3.5 text-slate-400" />
        <span class="hidden xl:inline">Tìm</span>
        <kbd
          class="hidden rounded border border-slate-300 bg-white px-1.5 py-0.2 font-mono text-[10px] font-semibold text-slate-500 sm:inline dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
        >
          ⌘K
        </kbd>
      </button>

      <div
        v-if="enableTechMode"
        data-tour="topbar-audience"
        class="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold dark:border-slate-700/80 dark:bg-slate-900"
      >
        <button
          type="button"
          class="rounded-md px-2 py-1 transition"
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
          class="inline-flex items-center gap-1 rounded-md px-2 py-1 transition"
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

      <button
        type="button"
        data-tour="topbar-guide"
        aria-label="Hướng dẫn & Sổ tay"
        class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700/80 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800"
        title="Sổ tay hướng dẫn toàn tập, Tour & từ điển (?)"
        @click="emit('openGuide')"
      >
        <HelpCircle class="h-4 w-4 text-indigo-600 dark:text-cyan-400" />
      </button>

      <button
        v-if="enableTechMode && explorer.audienceMode.value === 'tech'"
        type="button"
        data-tour="topbar-settings"
        title="Cài đặt đường dẫn code, Độ phủ Media & Sao lưu Profile"
        aria-label="Cài đặt Workspace"
        class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700/80 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800 dark:hover:text-cyan-300"
        @click="emit('openSettings')"
      >
        <Settings class="h-4 w-4" />
      </button>

      <button
        type="button"
        :aria-label="isDark ? 'Chuyển sang giao diện Sáng' : 'Chuyển sang giao diện Tối'"
        :title="isDark ? 'Chuyển sang giao diện Sáng' : 'Chuyển sang giao diện Tối'"
        class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700/80 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800 dark:hover:text-amber-300"
        @click="onToggleTheme"
      >
        <Sun v-if="isDark" class="h-4 w-4 text-amber-400" />
        <Moon v-else class="h-4 w-4" />
      </button>
    </div>
  </header>
</template>
