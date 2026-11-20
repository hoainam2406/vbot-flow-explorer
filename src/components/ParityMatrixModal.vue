<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Scale,
  Search,
  X,
} from 'lucide-vue-next';
import { FLOW_EXPLORER_KEY } from '../composables/useFlowExplorer';
import { useToast } from '../composables/useToast';
import {
  copyTextToClipboard,
  downloadTextFile,
  slugifyFilename,
} from '../core/downloadHelper';
import {
  exportParityReportToMarkdown,
  extractParityReport,
  type ParityCategory,
  type ParityItem,
} from '../core/parityAnalyzer';
import type { NodeKind } from '../data/schema';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const { pushToast } = useToast();
const selectedCategory = ref<'all' | ParityCategory>('all');
const selectedBranchId = ref<string>('all');
const query = ref('');
const copiedMd = ref(false);
const searchInputRef = ref<HTMLInputElement | null>(null);
let copyResetTimer: ReturnType<typeof setTimeout> | null = null;

const report = computed(() => extractParityReport(explorer.dataset));

const CATEGORY_META: Record<ParityCategory, { label: string; cls: string }> = {
  ios_only: {
    label: 'Chỉ iOS',
    cls: 'border-slate-700 bg-slate-800 text-white dark:border-slate-600',
  },
  android_only: {
    label: 'Chỉ Android',
    cls: 'border-emerald-700 bg-emerald-600 text-white',
  },
  behavior_diff: {
    label: 'Khác hành vi',
    cls: 'border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300',
  },
  bridge_parity: {
    label: 'Khác Bridge',
    cls: 'border-indigo-300 bg-indigo-100 text-indigo-900 dark:border-indigo-500/40 dark:bg-indigo-500/15 dark:text-indigo-300',
  },
};

const KIND_LABELS: Record<NodeKind, string> = {
  module: 'Module',
  miniapp: 'Mini App',
  action: 'Thao tác',
  process: 'Xử lý',
  decision: 'Điều kiện',
  external: 'Hệ thống',
  error: 'Lỗi / Retry',
};

const categoryTabs = computed<
  Array<{ id: 'all' | ParityCategory; label: string; count: number; activeCls: string }>
>(() => [
  {
    id: 'all',
    label: 'Tất cả',
    count: report.value.total,
    activeCls: 'border-indigo-600 bg-indigo-600 text-white',
  },
  {
    id: 'ios_only',
    label: 'Chỉ có iOS',
    count: report.value.iosOnly,
    activeCls: 'border-slate-800 bg-slate-800 text-white dark:border-slate-600 dark:bg-slate-700',
  },
  {
    id: 'android_only',
    label: 'Chỉ có Android',
    count: report.value.androidOnly,
    activeCls: 'border-emerald-600 bg-emerald-600 text-white',
  },
  {
    id: 'behavior_diff',
    label: 'Khác hành vi',
    count: report.value.behaviorDiff,
    activeCls: 'border-amber-500 bg-amber-500 text-white',
  },
  {
    id: 'bridge_parity',
    label: 'Khác Bridge',
    count: report.value.bridgeParity,
    activeCls: 'border-violet-600 bg-violet-600 text-white',
  },
]);

const filteredItems = computed(() => {
  const q = query.value.trim().toLowerCase();
  return report.value.items.filter((item) => {
    if (
      selectedCategory.value !== 'all' &&
      !item.categories.includes(selectedCategory.value)
    ) {
      return false;
    }
    if (selectedBranchId.value !== 'all' && item.branchId !== selectedBranchId.value) {
      return false;
    }
    if (!q) return true;

    const haystacks = [
      item.nodeLabel,
      item.nodeId,
      item.branchLabel,
      item.platformDiffNote ?? '',
      item.iosSummary ?? '',
      item.androidSummary ?? '',
      ...item.bridgeParityNotes.map((n) => `${n.messageName} ${n.parityNote}`),
    ];
    return haystacks.some((text) => text.toLowerCase().includes(q));
  });
});

const close = () => {
  emit('update:open', false);
};

const onWindowKeyDown = (event: KeyboardEvent) => {
  if (props.open && event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    close();
  }
};

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      window.addEventListener('keydown', onWindowKeyDown);
      await nextTick();
      searchInputRef.value?.focus();
    } else {
      window.removeEventListener('keydown', onWindowKeyDown);
    }
  },
);

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeyDown);
  if (copyResetTimer) {
    clearTimeout(copyResetTimer);
  }
});

const handleJump = (item: ParityItem) => {
  explorer.setAudienceMode('tech');
  explorer.setPlatformMode('compare');
  explorer.jumpToNode(item.nodeId);
  close();
};

const handleCopyMarkdown = async () => {
  const md = exportParityReportToMarkdown(report.value, explorer.dataset.app);
  const ok = await copyTextToClipboard(md);
  if (ok) {
    copiedMd.value = true;
    pushToast('Đã sao chép báo cáo chênh lệch Markdown', 'success');
    if (copyResetTimer) clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(() => {
      copiedMd.value = false;
    }, 2000);
  }
};

const handleDownloadMarkdown = () => {
  const md = exportParityReportToMarkdown(report.value, explorer.dataset.app);
  const base = slugifyFilename(`${explorer.dataset.app.name}-parity-ios-android`);
  downloadTextFile(`${base}.md`, md);
  pushToast('Đã tải báo cáo chênh lệch (.md)', 'success');
};
</script>

<template>
  <Teleport to="body">
    <Transition name="vbot-modal">
      <div
        v-if="props.open"
        class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-xs dark:bg-black/65"
        @click.self="close"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Bảng chênh lệch iOS và Android"
          class="vbot-modal-panel flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700/80 dark:bg-[#0f172a]"
        >
          <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div class="flex items-center gap-2.5">
              <span class="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                <Scale class="h-4 w-4" />
              </span>
              <div>
                <div class="flex items-center gap-2">
                  <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">
                    Bảng chênh lệch iOS ↔ Android
                  </h2>
                  <span class="rounded-full bg-amber-100 px-2 py-0.5 font-mono text-xs font-bold text-amber-900 dark:bg-amber-500/20 dark:text-amber-300">
                    {{ report.total }} mục
                  </span>
                </div>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  Tổng hợp node đơn nền tảng, khác biệt xử lý và Mini App Bridge để đối chiếu & đồng bộ.
                </p>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                @click="handleCopyMarkdown"
              >
                <Check v-if="copiedMd" class="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <Copy v-else class="h-3.5 w-3.5" />
                {{ copiedMd ? 'Đã copy MD' : 'Copy Markdown' }}
              </button>
              <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-cyan-500/35 dark:bg-cyan-500/15 dark:text-cyan-300 dark:hover:bg-cyan-500/25"
                @click="handleDownloadMarkdown"
              >
                <Download class="h-3.5 w-3.5" />
                Tải .md
              </button>
              <button
                type="button"
                aria-label="Đóng bảng chênh lệch"
                class="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                @click="close"
              >
                <X class="h-4 w-4" />
              </button>
            </div>
          </div>

          <div class="space-y-3 border-b border-slate-200 bg-slate-50/70 px-5 py-3 dark:border-slate-800 dark:bg-slate-900/60">
            <div class="flex flex-wrap items-center gap-1.5">
              <button
                v-for="tab in categoryTabs"
                :key="tab.id"
                type="button"
                class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition"
                :class="
                  selectedCategory === tab.id
                    ? tab.activeCls
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600'
                "
                @click="selectedCategory = tab.id"
              >
                <span>{{ tab.label }}</span>
                <span
                  class="rounded-full px-1.5 py-0.2 font-mono text-[10px] font-bold"
                  :class="
                    selectedCategory === tab.id
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                  "
                >
                  {{ tab.count }}
                </span>
              </button>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <div class="relative min-w-52 flex-1">
                <Search class="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  ref="searchInputRef"
                  v-model="query"
                  type="text"
                  placeholder="Lọc theo tên bước, hàm, sự kiện bridge hoặc ghi chú..."
                  class="w-full rounded-lg border border-slate-200 bg-white py-1.5 pr-3 pl-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-cyan-500"
                />
              </div>

              <select
                v-model="selectedBranchId"
                aria-label="Lọc theo module"
                class="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-cyan-500"
              >
                <option value="all">Tất cả nhánh ({{ report.total }})</option>
                <option
                  v-for="branch in report.byBranch"
                  :key="branch.branchId"
                  :value="branch.branchId"
                >
                  {{ branch.branchLabel }} ({{ branch.count }})
                </option>
              </select>
            </div>
          </div>

          <div class="flex-1 overflow-y-auto px-5 py-4">
            <p
              v-if="filteredItems.length === 0"
              class="py-12 text-center text-xs text-slate-500 dark:text-slate-400"
            >
              Không có mục chênh lệch nào khớp bộ lọc hiện tại.
            </p>

            <ul v-else class="space-y-3">
              <li v-for="item in filteredItems" :key="item.nodeId">
                <button
                  type="button"
                  class="group w-full rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-indigo-300 hover:bg-indigo-50/25 hover:shadow-xs dark:border-slate-800 dark:bg-slate-900/75 dark:hover:border-cyan-500/45 dark:hover:bg-slate-800/80"
                  @click="handleJump(item)"
                >
                  <div class="flex flex-wrap items-start justify-between gap-2">
                    <div class="min-w-0 flex-1">
                      <div class="mb-1 flex flex-wrap items-center gap-1.5">
                        <span class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {{ KIND_LABELS[item.nodeKind] }}
                        </span>
                        <span
                          v-for="cat in item.categories"
                          :key="cat"
                          class="rounded border px-1.5 py-0.5 text-[10px] font-bold"
                          :class="CATEGORY_META[cat].cls"
                        >
                          {{ CATEGORY_META[cat].label }}
                        </span>
                        <span class="truncate text-[11px] text-slate-400 dark:text-slate-500">
                          {{ item.breadcrumb.join(' › ') }}
                        </span>
                      </div>
                      <h3 class="text-sm font-bold text-slate-900 group-hover:text-indigo-700 dark:text-slate-100 dark:group-hover:text-cyan-300">
                        {{ item.nodeLabel }}
                      </h3>
                    </div>

                    <span class="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600 group-hover:border-indigo-200 group-hover:bg-indigo-100 group-hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:group-hover:border-cyan-500/40 dark:group-hover:bg-cyan-500/15 dark:group-hover:text-cyan-300">
                      Xem trên sơ đồ
                      <ExternalLink class="h-3 w-3" />
                    </span>
                  </div>

                  <div
                    v-if="item.platformDiffNote"
                    class="mt-2 rounded-lg border border-amber-200 bg-amber-50/75 px-3 py-2 text-xs leading-relaxed text-amber-950 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-200"
                  >
                    {{ item.platformDiffNote }}
                  </div>

                  <div
                    v-for="note in item.bridgeParityNotes"
                    :key="note.messageName"
                    class="mt-2 rounded-lg border border-indigo-200 bg-indigo-50/70 px-3 py-2 text-xs leading-relaxed text-indigo-950 dark:border-indigo-500/35 dark:bg-indigo-500/10 dark:text-indigo-200"
                  >
                    <span class="font-mono font-bold">{{ note.messageName }}:</span>
                    {{ note.parityNote }}
                  </div>

                  <div
                    v-if="item.iosSummary || item.androidSummary"
                    class="mt-2.5 grid gap-2 md:grid-cols-2"
                  >
                    <div
                      v-if="item.iosSummary"
                      class="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-[11px] leading-relaxed text-slate-700 dark:border-slate-700/80 dark:bg-slate-800/70 dark:text-slate-300"
                    >
                      <span class="font-bold text-slate-900 dark:text-indigo-300">iOS: </span>{{ item.iosSummary }}
                    </div>
                    <div
                      v-if="item.androidSummary"
                      class="rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2 text-[11px] leading-relaxed text-slate-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-slate-300"
                    >
                      <span class="font-bold text-emerald-900 dark:text-emerald-300">Android: </span>{{ item.androidSummary }}
                    </div>
                  </div>
                </button>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
