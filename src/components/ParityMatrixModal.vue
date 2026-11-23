<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ClipboardList,
  Copy,
  Download,
  ExternalLink,
  Info,
  Scale,
  Search,
  Send,
  Sparkles,
  Wrench,
} from 'lucide-vue-next';
import CreateVbotWorkTaskModal from './CreateVbotWorkTaskModal.vue';
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
  PARITY_FIX_TARGET_LABELS,
  PARITY_NEEDS_FIX_LABELS,
  PARITY_VERDICT_LABELS,
  type ParityCategory,
  type ParityItem,
} from '../core/parityAnalyzer';
import {
  loadCreatedVbotWorkTasks,
  type CreatedVbotWorkTask,
} from '../core/vbotWorkClient';
import {
  buildParityTaskDraft,
  buildParityTaskMarkdown,
  loadParityTriageMap,
  PARITY_TRIAGE_LABELS,
  resolveVbotWorkUrl,
  saveParityTriageStatus,
  type ParityTriageStatus,
  type VbotWorkTaskDraft,
} from '../core/vbotWorkTemplates';
import { loadDevWorkspaceSettings } from '../core/workspaceSettings';
import type {
  NodeKind,
  ParityFixTarget,
  ParityNeedsFix,
  ParityVerdict,
} from '../data/schema';

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

type VerdictFilter = 'all' | 'needs_attention' | ParityVerdict;

const { pushToast } = useToast();
const selectedVerdict = ref<VerdictFilter>('all');
const selectedFixTarget = ref<'all' | ParityFixTarget>('all');
const selectedCategory = ref<'all' | ParityCategory>('all');
const selectedBranchId = ref<string>('all');
const selectedTriage = ref<'all' | ParityTriageStatus>('all');
const triageMap = ref<Record<string, ParityTriageStatus>>(loadParityTriageMap());
const createdTasksMap = ref<Record<string, CreatedVbotWorkTask>>(loadCreatedVbotWorkTasks());
const createTaskOpen = ref(false);
const activeTaskDraft = ref<VbotWorkTaskDraft | null>(null);
const query = ref('');
const selectedNodeId = ref<string | null>(null);
const copiedMd = ref(false);
const searchInputRef = ref<HTMLInputElement | null>(null);
let copyResetTimer: ReturnType<typeof setTimeout> | null = null;

const vbotWorkUrl = computed(() =>
  resolveVbotWorkUrl(loadDevWorkspaceSettings(), explorer.dataset.app.repoConfig, 'general'),
);

const getItemTriage = (nodeId: string): ParityTriageStatus =>
  triageMap.value[nodeId] ?? 'open';

const onChangeTriage = (nodeId: string, status: ParityTriageStatus) => {
  triageMap.value = saveParityTriageStatus(nodeId, status);
  pushToast(`Đã cập nhật trạng thái: ${PARITY_TRIAGE_LABELS[status]}`, 'info');
};

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

const VERDICT_STYLES: Record<
  ParityVerdict,
  {
    shortLabel: string;
    cardDesc: string;
    badgeCls: string;
    cardCls: string;
    activeCardCls: string;
    bannerCls: string;
    dotCls: string;
  }
> = {
  action_needed: {
    shortLabel: 'Lỗi / Gap',
    cardDesc: 'Lỗi hoặc thiếu contract — ưu tiên xử lý',
    badgeCls:
      'border-rose-300 bg-rose-100 text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/20 dark:text-rose-200',
    cardCls:
      'border-rose-200/90 bg-white hover:border-rose-300 dark:border-rose-500/25 dark:bg-slate-900/80 dark:hover:border-rose-500/50',
    activeCardCls:
      'border-rose-500 bg-rose-50/90 ring-2 ring-rose-500/25 dark:border-rose-400 dark:bg-rose-500/15 dark:ring-rose-400/25',
    bannerCls:
      'border-rose-200 bg-rose-50/75 text-rose-950 dark:border-rose-500/35 dark:bg-rose-500/10 dark:text-rose-100',
    dotCls: 'bg-rose-500',
  },
  logic_diff: {
    shortLabel: 'Khác kết quả / UX',
    cardDesc: 'Khác luồng, API hoặc UX — cân nhắc đồng bộ',
    badgeCls:
      'border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/20 dark:text-amber-200',
    cardCls:
      'border-amber-200/90 bg-white hover:border-amber-300 dark:border-amber-500/25 dark:bg-slate-900/80 dark:hover:border-amber-500/50',
    activeCardCls:
      'border-amber-500 bg-amber-50/90 ring-2 ring-amber-500/25 dark:border-amber-400 dark:bg-amber-500/15 dark:ring-amber-400/25',
    bannerCls:
      'border-amber-200 bg-amber-50/75 text-amber-950 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-100',
    dotCls: 'bg-amber-500',
  },
  os_impl_only: {
    shortLabel: 'Khác OS · Cùng KQ',
    cardDesc: 'Swift vs Kotlin — logic & kết quả giống nhau',
    badgeCls:
      'border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-500/40 dark:bg-sky-500/20 dark:text-sky-200',
    cardCls:
      'border-sky-200/90 bg-white hover:border-sky-300 dark:border-sky-500/25 dark:bg-slate-900/80 dark:hover:border-sky-500/50',
    activeCardCls:
      'border-sky-500 bg-sky-50/90 ring-2 ring-sky-500/25 dark:border-sky-400 dark:bg-sky-500/15 dark:ring-sky-400/25',
    bannerCls:
      'border-sky-200 bg-sky-50/75 text-sky-950 dark:border-sky-500/35 dark:bg-sky-500/10 dark:text-sky-100',
    dotCls: 'bg-sky-500',
  },
  synced: {
    shortLabel: 'Đã đồng bộ',
    cardDesc: '2 bên đã khớp — chỉ ghi chú đối soát',
    badgeCls:
      'border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-200',
    cardCls:
      'border-emerald-200/90 bg-white hover:border-emerald-300 dark:border-emerald-500/25 dark:bg-slate-900/80 dark:hover:border-emerald-500/50',
    activeCardCls:
      'border-emerald-500 bg-emerald-50/90 ring-2 ring-emerald-500/25 dark:border-emerald-400 dark:bg-emerald-500/15 dark:ring-emerald-400/25',
    bannerCls:
      'border-emerald-200 bg-emerald-50/75 text-emerald-950 dark:border-emerald-500/35 dark:bg-emerald-500/10 dark:text-emerald-100',
    dotCls: 'bg-emerald-500',
  },
};

const NEEDS_FIX_CLS: Record<ParityNeedsFix, string> = {
  yes: 'border-rose-300 bg-rose-600 text-white dark:border-rose-500',
  consider:
    'border-amber-300 bg-amber-500 text-white dark:border-amber-500/80',
  no: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300',
};

const FIX_TARGET_STYLES: Record<ParityFixTarget, { shortLabel: string; cls: string }> = {
  ios: {
    shortLabel: 'Sửa iOS',
    cls: 'border-slate-700 bg-slate-800 text-white dark:border-indigo-400/50 dark:bg-indigo-500/25 dark:text-indigo-200',
  },
  android: {
    shortLabel: 'Sửa Android',
    cls: 'border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500/50 dark:bg-emerald-500/25 dark:text-emerald-200',
  },
  both: {
    shortLabel: 'Sửa cả 2 bên',
    cls: 'border-rose-500 bg-rose-600 text-white dark:border-rose-500/50 dark:bg-rose-500/25 dark:text-rose-200',
  },
  tbd: {
    shortLabel: 'Chờ chốt chuẩn',
    cls: 'border-amber-400 bg-amber-100 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/20 dark:text-amber-200',
  },
  none: {
    shortLabel: 'Không cần sửa',
    cls: 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400',
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

const verdictCards = computed<
  Array<{
    id: ParityVerdict;
    title: string;
    count: number;
    desc: string;
  }>
>(() => [
  {
    id: 'action_needed',
    title: 'Nên sửa (Lỗi / Parity Gap)',
    count: report.value.byVerdict.action_needed,
    desc: VERDICT_STYLES.action_needed.cardDesc,
  },
  {
    id: 'logic_diff',
    title: 'Khác logic / Kết quả',
    count: report.value.byVerdict.logic_diff,
    desc: VERDICT_STYLES.logic_diff.cardDesc,
  },
  {
    id: 'os_impl_only',
    title: 'Chỉ khác OS / Ngôn ngữ',
    count: report.value.byVerdict.os_impl_only,
    desc: VERDICT_STYLES.os_impl_only.cardDesc,
  },
  {
    id: 'synced',
    title: 'Đã đồng bộ (Chỉ ghi chú)',
    count: report.value.byVerdict.synced,
    desc: VERDICT_STYLES.synced.cardDesc,
  },
]);

const needsAttentionCount = computed(
  () => report.value.byVerdict.action_needed + report.value.byVerdict.logic_diff,
);

const categoryTabs = computed<
  Array<{ id: 'all' | ParityCategory; label: string; count: number; activeCls: string }>
>(() => [
  {
    id: 'all',
    label: 'Mọi loại',
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
    if (selectedVerdict.value === 'needs_attention') {
      if (
        item.assessment.verdict !== 'action_needed' &&
        item.assessment.verdict !== 'logic_diff'
      ) {
        return false;
      }
    } else if (
      selectedVerdict.value !== 'all' &&
      item.assessment.verdict !== selectedVerdict.value
    ) {
      return false;
    }

    if (
      selectedFixTarget.value !== 'all' &&
      item.assessment.fixTarget !== selectedFixTarget.value
    ) {
      return false;
    }

    if (
      selectedCategory.value !== 'all' &&
      !item.categories.includes(selectedCategory.value)
    ) {
      return false;
    }
    if (selectedBranchId.value !== 'all' && item.branchId !== selectedBranchId.value) {
      return false;
    }
    if (selectedTriage.value !== 'all' && getItemTriage(item.nodeId) !== selectedTriage.value) {
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
      item.assessment.explanation,
      item.assessment.recommendation,
      ...item.bridgeParityNotes.map((n) => `${n.messageName} ${n.parityNote}`),
    ];
    return haystacks.some((text) => text.toLowerCase().includes(q));
  });
});

watch(
  filteredItems,
  (list) => {
    if (list.length === 0) {
      selectedNodeId.value = null;
      return;
    }
    if (!selectedNodeId.value || !list.some((i) => i.nodeId === selectedNodeId.value)) {
      selectedNodeId.value = list[0].nodeId;
    }
  },
  { immediate: true },
);

const selectedItem = computed<ParityItem | null>(() => {
  if (filteredItems.value.length === 0) return null;
  return (
    filteredItems.value.find((i) => i.nodeId === selectedNodeId.value) ??
    filteredItems.value[0]
  );
});

const toggleVerdictCard = (verdict: ParityVerdict) => {
  selectedVerdict.value = selectedVerdict.value === verdict ? 'all' : verdict;
};

const close = () => {
  emit('update:open', false);
};

const onWindowKeyDown = (event: KeyboardEvent) => {
  if (!props.open || event.key !== 'Escape') return;
  const activeTag = document.activeElement?.tagName;
  if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') {
    (document.activeElement as HTMLElement).blur();
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  close();
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

const buildFullParityMarkdown = (): string => {
  const base = exportParityReportToMarkdown(report.value, explorer.dataset.app);
  const tracked = report.value.items.filter((i) => getItemTriage(i.nodeId) !== 'open');
  if (tracked.length === 0) return base;
  const extra = [
    '',
    '## Trạng thái theo dõi xử lý (Local Triage)',
    '',
    ...tracked.map(
      (i) => `- **${i.nodeLabel}** (\`${i.nodeId}\`): ${PARITY_TRIAGE_LABELS[getItemTriage(i.nodeId)]}`,
    ),
    '',
  ];
  return `${base.trimEnd()}\n${extra.join('\n')}`;
};

const handleCopyParityTask = async (item: ParityItem) => {
  const origin =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}#/?mode=tech&platform=compare&node=${encodeURIComponent(item.nodeId)}`
      : undefined;
  const md = buildParityTaskMarkdown(item, {
    pageUrl: origin,
    appName: explorer.dataset.app.name,
    techBranch: explorer.dataset.app.techBranch,
    triageStatus: getItemTriage(item.nodeId),
  });
  const ok = await copyTextToClipboard(md);
  pushToast(
    ok ? 'Đã sao chép mẫu Task VBot Work cho điểm lệch này' : 'Không thể sao chép vào clipboard',
    ok ? 'success' : 'error',
  );
};

const handleCopyMarkdown = async () => {
  const md = buildFullParityMarkdown();
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
  const md = buildFullParityMarkdown();
  const base = slugifyFilename(`${explorer.dataset.app.name}-parity-ios-android`);
  downloadTextFile(`${base}.md`, md);
  pushToast('Đã tải báo cáo chênh lệch (.md)', 'success');
};

const existingTaskForSelected = computed<CreatedVbotWorkTask | null>(() => {
  if (!selectedItem.value) return null;
  return createdTasksMap.value[`parity:${selectedItem.value.nodeId}`] ?? null;
});

const handleOpenCreateParityTask = (item: ParityItem) => {
  const origin =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}#/?mode=tech&platform=compare&node=${encodeURIComponent(item.nodeId)}`
      : undefined;
  activeTaskDraft.value = buildParityTaskDraft(item, {
    pageUrl: origin,
    appName: explorer.dataset.app.name,
    techBranch: explorer.dataset.app.techBranch,
    triageStatus: getItemTriage(item.nodeId),
    fallbackUrl: vbotWorkUrl.value,
  });
  createTaskOpen.value = true;
};

const handleParityTaskCreated = (payload: { itemKey: string; task: CreatedVbotWorkTask }) => {
  createdTasksMap.value = loadCreatedVbotWorkTasks();
  if (payload.itemKey.startsWith('parity:')) {
    const nodeId = payload.itemKey.slice('parity:'.length);
    if (getItemTriage(nodeId) === 'open') {
      triageMap.value = saveParityTriageStatus(nodeId, 'in_progress');
      pushToast(`Đã chuyển trạng thái "${nodeId}" sang Đang đồng bộ`, 'info');
    }
  }
};
</script>

<template>
  <div
    v-if="props.open"
    role="region"
    aria-label="Phân tích chênh lệch iOS và Android"
    class="flex h-full w-full min-h-0 flex-col overflow-hidden bg-slate-50 dark:bg-[#090d16]"
  >
    <!-- Top Workspace Header -->
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3 dark:border-slate-800 dark:bg-[#0b1120]">
      <div class="flex items-center gap-3">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          @click="close"
        >
          <ArrowLeft class="h-3.5 w-3.5" />
          Quay lại sơ đồ
        </button>

        <span class="hidden h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-800 sm:flex dark:bg-amber-500/15 dark:text-amber-300">
          <Scale class="h-4 w-4" />
        </span>

        <div>
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="text-sm font-bold text-slate-900 sm:text-base dark:text-slate-100">
              Phân tích chênh lệch iOS ↔ Android
            </h1>
            <span class="rounded-full bg-amber-100 px-2 py-0.5 font-mono text-xs font-bold text-amber-900 dark:bg-amber-500/20 dark:text-amber-300">
              {{ report.total }} mục
            </span>
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            Phân biệt rõ điểm lệch cần sửa / khác kết quả với điểm chỉ khác đặc thù hệ điều hành (Swift vs Kotlin — không cần sửa).
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
      </div>
    </div>

    <!-- Verdict Cards + Filters -->
    <div class="space-y-3 border-b border-slate-200 bg-slate-50/90 px-5 py-3 dark:border-slate-800 dark:bg-slate-900/55">
      <div class="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <button
          v-for="card in verdictCards"
          :key="card.id"
          type="button"
          class="flex items-start justify-between gap-2 rounded-xl border p-3 text-left transition"
          :class="
            selectedVerdict === card.id
              ? VERDICT_STYLES[card.id].activeCardCls
              : VERDICT_STYLES[card.id].cardCls
          "
          @click="toggleVerdictCard(card.id)"
        >
          <div class="min-w-0">
            <div class="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-slate-100">
              <span class="h-2 w-2 shrink-0 rounded-full" :class="VERDICT_STYLES[card.id].dotCls" />
              <span class="truncate">{{ card.title }}</span>
            </div>
            <p class="mt-0.5 line-clamp-1 text-[11px] text-slate-500 dark:text-slate-400">
              {{ card.desc }}
            </p>
          </div>
          <span class="shrink-0 font-mono text-base font-extrabold text-slate-900 dark:text-white">
            {{ card.count }}
          </span>
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition"
          :class="
            selectedVerdict === 'all'
              ? 'border-slate-900 bg-slate-900 text-white dark:border-cyan-500 dark:bg-cyan-500/25 dark:text-cyan-200'
              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
          "
          @click="selectedVerdict = 'all'"
        >
          Tất cả ({{ report.total }})
        </button>

        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition"
          :class="
            selectedVerdict === 'needs_attention'
              ? 'border-rose-600 bg-rose-600 text-white'
              : 'border-rose-200 bg-rose-50 text-rose-800 hover:border-rose-300 dark:border-rose-500/35 dark:bg-rose-500/15 dark:text-rose-200'
          "
          @click="
            selectedVerdict = selectedVerdict === 'needs_attention' ? 'all' : 'needs_attention'
          "
        >
          <Wrench class="h-3 w-3" />
          Chỉ xem mục cần sửa / lệch kết quả ({{ needsAttentionCount }})
        </button>

        <span class="mx-1 hidden h-4 w-px bg-slate-200 sm:inline-block dark:bg-slate-700" />

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
            placeholder="Lọc theo tên bước, sự kiện bridge, giải thích hoặc khuyến nghị..."
            class="w-full rounded-lg border border-slate-200 bg-white py-1.5 pr-3 pl-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-cyan-500"
          />
        </div>

        <select
          v-model="selectedFixTarget"
          aria-label="Lọc theo bên cần sửa"
          class="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-cyan-500"
        >
          <option value="all">Mọi bên cần sửa</option>
          <option value="ios">Cần sửa iOS ({{ report.byFixTarget.ios }})</option>
          <option value="android">Cần sửa Android ({{ report.byFixTarget.android }})</option>
          <option value="both">Cần sửa cả 2 bên ({{ report.byFixTarget.both }})</option>
          <option value="tbd">Chờ chốt bên chuẩn ({{ report.byFixTarget.tbd }})</option>
          <option value="none">Không cần sửa ({{ report.byFixTarget.none }})</option>
        </select>

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

        <select
          v-model="selectedTriage"
          aria-label="Lọc theo trạng thái xử lý"
          class="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-cyan-500"
        >
          <option value="all">Mọi trạng thái</option>
          <option
            v-for="(label, key) in PARITY_TRIAGE_LABELS"
            :key="key"
            :value="key"
          >
            {{ label }}
          </option>
        </select>
      </div>
    </div>

    <!-- Master-Detail 2-Column Body -->
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
      <!-- Left Master List -->
      <aside class="flex max-h-[38vh] shrink-0 flex-col border-b border-slate-200 bg-white lg:max-h-none lg:w-[400px] lg:border-r lg:border-b-0 xl:w-[440px] dark:border-slate-800 dark:bg-[#0b1120]">
        <div class="flex items-center justify-between border-b border-slate-100 px-4 py-2 text-[11px] font-semibold text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <span>Danh sách mục chênh lệch</span>
          <span class="font-mono">Hiển thị {{ filteredItems.length }} / {{ report.total }}</span>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto p-2.5">
          <p
            v-if="filteredItems.length === 0"
            class="py-12 text-center text-xs text-slate-500 dark:text-slate-400"
          >
            Không có mục chênh lệch nào khớp bộ lọc hiện tại.
          </p>

          <ul v-else class="space-y-1.5">
            <li v-for="item in filteredItems" :key="item.nodeId">
              <button
                type="button"
                class="w-full rounded-xl border p-3 text-left transition"
                :class="
                  selectedItem?.nodeId === item.nodeId
                    ? 'border-indigo-500 bg-indigo-50/70 shadow-2xs dark:border-cyan-500 dark:bg-cyan-500/12'
                    : 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700 dark:hover:bg-slate-800/70'
                "
                @click="selectedNodeId = item.nodeId"
              >
                <div class="mb-1 flex flex-wrap items-center gap-1.5">
                  <span
                    class="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-bold"
                    :class="VERDICT_STYLES[item.assessment.verdict].badgeCls"
                  >
                    <span
                      class="h-1.5 w-1.5 rounded-full"
                      :class="VERDICT_STYLES[item.assessment.verdict].dotCls"
                    />
                    {{ VERDICT_STYLES[item.assessment.verdict].shortLabel }}
                  </span>

                  <span
                    class="rounded border px-1.5 py-0.5 text-[10px] font-semibold"
                    :class="NEEDS_FIX_CLS[item.assessment.needsFix]"
                  >
                    {{ PARITY_NEEDS_FIX_LABELS[item.assessment.needsFix] }}
                  </span>

                  <span
                    v-if="item.assessment.fixTarget !== 'none'"
                    class="rounded border px-1.5 py-0.5 text-[10px] font-bold"
                    :class="FIX_TARGET_STYLES[item.assessment.fixTarget].cls"
                  >
                    {{ FIX_TARGET_STYLES[item.assessment.fixTarget].shortLabel }}
                  </span>

                  <span
                    v-if="getItemTriage(item.nodeId) !== 'open'"
                    class="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  >
                    {{ PARITY_TRIAGE_LABELS[getItemTriage(item.nodeId)] }}
                  </span>
                </div>

                <div class="truncate text-xs font-bold text-slate-900 dark:text-slate-100">
                  {{ item.nodeLabel }}
                </div>

                <div class="mt-0.5 flex flex-wrap items-center gap-1 text-[10.5px] text-slate-500 dark:text-slate-400">
                  <span class="truncate">{{ item.branchLabel }}</span>
                  <span>·</span>
                  <span
                    v-for="cat in item.categories"
                    :key="cat"
                    class="rounded px-1 py-0.2 text-[9.5px] font-semibold"
                    :class="CATEGORY_META[cat].cls"
                  >
                    {{ CATEGORY_META[cat].label }}
                  </span>
                </div>
              </button>
            </li>
          </ul>
        </div>
      </aside>

      <!-- Right Detail Pane -->
      <main class="min-w-0 flex-1 overflow-y-auto p-5 lg:p-6">
        <div
          v-if="!selectedItem"
          class="flex h-full items-center justify-center text-xs text-slate-500 dark:text-slate-400"
        >
          Chọn một mục ở danh sách bên trái hoặc điều chỉnh bộ lọc để xem phân tích chi tiết.
        </div>

        <div v-else class="w-full space-y-4">
          <!-- Detail Header + Actions -->
          <div class="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-[#0d1424]">
            <div class="min-w-0 flex-1 space-y-1.5">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {{ KIND_LABELS[selectedItem.nodeKind] }}
                </span>
                <span
                  v-for="cat in selectedItem.categories"
                  :key="cat"
                  class="rounded border px-2 py-0.5 text-[11px] font-bold"
                  :class="CATEGORY_META[cat].cls"
                >
                  {{ CATEGORY_META[cat].label }}
                </span>
                <span class="font-mono text-[11px] text-slate-400 dark:text-slate-500">
                  #{{ selectedItem.nodeId }}
                </span>
              </div>

              <h2 class="text-lg font-bold text-slate-900 dark:text-slate-100">
                {{ selectedItem.nodeLabel }}
              </h2>

              <p class="text-xs text-slate-500 dark:text-slate-400">
                {{ selectedItem.breadcrumb.join(' › ') }}
              </p>
            </div>

            <div class="flex shrink-0 flex-wrap items-center gap-2">
              <select
                :value="getItemTriage(selectedItem.nodeId)"
                aria-label="Trạng thái xử lý chênh lệch"
                class="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                @change="
                  onChangeTriage(
                    selectedItem.nodeId,
                    ($event.target as HTMLSelectElement).value as ParityTriageStatus,
                  )
                "
              >
                <option
                  v-for="(label, key) in PARITY_TRIAGE_LABELS"
                  :key="key"
                  :value="key"
                >
                  {{ label }}
                </option>
              </select>

              <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                title="Copy mẫu Task VBot Work (đã kèm phân tích & khuyến nghị)"
                @click="handleCopyParityTask(selectedItem)"
              >
                <ClipboardList class="h-3.5 w-3.5" />
                Copy Task
              </button>

              <a
                v-if="existingTaskForSelected"
                :href="existingTaskForSelected.url"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 font-mono text-xs font-bold text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300"
                :title="`Mở Task đã tạo: ${existingTaskForSelected.key}`"
              >
                {{ existingTaskForSelected.key }}
                <ExternalLink class="h-3 w-3" />
              </a>

              <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-lg border border-cyan-300 bg-cyan-50 px-2.5 py-1.5 text-xs font-semibold text-cyan-800 transition hover:bg-cyan-100 dark:border-cyan-500/40 dark:bg-cyan-500/15 dark:text-cyan-200 dark:hover:bg-cyan-500/25"
                title="Tạo Task trực tiếp lên VBot Work (mặc định dự án vbot-mobile, Hoài Nam)"
                @click="handleOpenCreateParityTask(selectedItem)"
              >
                <Send class="h-3.5 w-3.5" />
                Tạo Task VBot Work
              </button>

              <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs transition hover:bg-indigo-500 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400"
                @click="handleJump(selectedItem)"
              >
                Xem trên sơ đồ
                <ExternalLink class="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <!-- Assessment Verdict & Explanation Card -->
          <section
            class="space-y-3.5 rounded-2xl border p-4 shadow-2xs"
            :class="VERDICT_STYLES[selectedItem.assessment.verdict].bannerCls"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-2 text-xs font-bold tracking-wide uppercase">
                <Sparkles class="h-4 w-4" />
                <span>Đánh giá bản chất chênh lệch &amp; Có cần sửa không?</span>
              </div>
              <span
                class="rounded-full border px-2.5 py-0.5 text-xs font-bold"
                :class="VERDICT_STYLES[selectedItem.assessment.verdict].badgeCls"
              >
                {{ PARITY_VERDICT_LABELS[selectedItem.assessment.verdict] }}
              </span>
            </div>

            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <div class="flex items-center justify-between rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-xs dark:border-white/10 dark:bg-slate-950/60">
                <span class="font-medium text-slate-600 dark:text-slate-300">Logic nghiệp vụ</span>
                <span
                  class="inline-flex items-center gap-1 font-bold"
                  :class="
                    selectedItem.assessment.sameLogic
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-amber-700 dark:text-amber-300'
                  "
                >
                  <CheckCircle2 v-if="selectedItem.assessment.sameLogic" class="h-3.5 w-3.5" />
                  <AlertCircle v-else class="h-3.5 w-3.5" />
                  {{ selectedItem.assessment.sameLogic ? 'Giống nhau' : 'Khác nhau' }}
                </span>
              </div>

              <div class="flex items-center justify-between rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-xs dark:border-white/10 dark:bg-slate-950/60">
                <span class="font-medium text-slate-600 dark:text-slate-300">Kết quả đầu ra</span>
                <span
                  class="inline-flex items-center gap-1 font-bold"
                  :class="
                    selectedItem.assessment.sameOutcome
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-rose-700 dark:text-rose-300'
                  "
                >
                  <CheckCircle2 v-if="selectedItem.assessment.sameOutcome" class="h-3.5 w-3.5" />
                  <AlertCircle v-else class="h-3.5 w-3.5" />
                  {{ selectedItem.assessment.sameOutcome ? 'Giống nhau' : 'Khác nhau' }}
                </span>
              </div>

              <div class="flex items-center justify-between rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-xs dark:border-white/10 dark:bg-slate-950/60">
                <span class="font-medium text-slate-600 dark:text-slate-300">Có cần sửa không?</span>
                <span
                  class="rounded border px-2 py-0.5 text-[11px] font-bold"
                  :class="NEEDS_FIX_CLS[selectedItem.assessment.needsFix]"
                >
                  {{ PARITY_NEEDS_FIX_LABELS[selectedItem.assessment.needsFix] }}
                </span>
              </div>

              <div class="flex items-center justify-between rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-xs dark:border-white/10 dark:bg-slate-950/60">
                <span class="font-medium text-slate-600 dark:text-slate-300">Bên cần sửa</span>
                <span
                  class="rounded border px-2 py-0.5 text-[11px] font-bold"
                  :class="FIX_TARGET_STYLES[selectedItem.assessment.fixTarget].cls"
                >
                  {{ PARITY_FIX_TARGET_LABELS[selectedItem.assessment.fixTarget] }}
                </span>
              </div>
            </div>

            <div class="grid grid-cols-1 gap-3 rounded-xl border border-black/10 bg-white/85 p-3.5 text-xs leading-relaxed text-slate-800 xl:grid-cols-2 dark:border-white/10 dark:bg-slate-950/65 dark:text-slate-200">
              <div>
                <div class="font-bold text-slate-900 dark:text-white">Giải thích chi tiết</div>
                <p class="mt-0.5">{{ selectedItem.assessment.explanation }}</p>
              </div>
              <div class="border-t border-slate-200/80 pt-2.5 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-3.5 dark:border-slate-800">
                <div class="font-bold text-slate-900 dark:text-white">Khuyến nghị xử lý</div>
                <p class="mt-0.5">{{ selectedItem.assessment.recommendation }}</p>
              </div>
            </div>
          </section>

          <!-- Original Tech Diff Note -->
          <section
            v-if="selectedItem.platformDiffNote"
            class="space-y-1.5 rounded-2xl border border-slate-200 bg-white p-4 text-xs leading-relaxed text-slate-700 shadow-2xs dark:border-slate-800 dark:bg-[#0d1424] dark:text-slate-300"
          >
            <div class="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400">
              <Info class="h-3.5 w-3.5" />
              Ghi chú kỹ thuật đối soát
            </div>
            <p>{{ selectedItem.platformDiffNote }}</p>
          </section>

          <!-- Bridge Parity Notes -->
          <section
            v-if="selectedItem.bridgeParityNotes.length > 0"
            class="space-y-2 rounded-2xl border border-indigo-200 bg-indigo-50/45 p-4 dark:border-indigo-500/30 dark:bg-indigo-500/8"
          >
            <h3 class="text-xs font-bold tracking-wide text-indigo-900 uppercase dark:text-indigo-300">
              Chi tiết khác biệt Mini App Bridge ({{ selectedItem.bridgeParityNotes.length }})
            </h3>
            <div
              v-for="note in selectedItem.bridgeParityNotes"
              :key="note.messageName"
              class="rounded-xl border border-indigo-200/80 bg-white px-3.5 py-2.5 text-xs leading-relaxed text-slate-800 dark:border-indigo-500/25 dark:bg-slate-900/80 dark:text-slate-200"
            >
              <span class="font-mono font-bold text-indigo-700 dark:text-cyan-300">{{ note.messageName }}:</span>
              {{ note.parityNote }}
            </div>
          </section>

          <!-- Side-by-side iOS vs Android -->
          <section
            v-if="selectedItem.iosSummary || selectedItem.androidSummary"
            class="space-y-2.5 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-[#0d1424]"
          >
            <h3 class="text-xs font-bold tracking-wide text-slate-600 uppercase dark:text-slate-400">
              Đối chiếu cách cài đặt iOS ↔ Android
            </h3>
            <div class="grid gap-3 md:grid-cols-2">
              <div class="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 text-xs leading-relaxed text-slate-700 dark:border-slate-700/80 dark:bg-slate-900 dark:text-slate-300">
                <div class="mb-1 text-[11px] font-bold tracking-wide text-slate-800 uppercase dark:text-indigo-300">
                  iOS (Swift)
                </div>
                <p v-if="selectedItem.iosSummary">{{ selectedItem.iosSummary }}</p>
                <p v-else class="italic text-slate-400 dark:text-slate-500">
                  Không áp dụng trên iOS (chỉ Android)
                </p>
              </div>

              <div class="rounded-xl border border-emerald-200 bg-emerald-50/45 p-3.5 text-xs leading-relaxed text-slate-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-slate-300">
                <div class="mb-1 text-[11px] font-bold tracking-wide text-emerald-800 uppercase dark:text-emerald-300">
                  Android (Kotlin / Java)
                </div>
                <p v-if="selectedItem.androidSummary">{{ selectedItem.androidSummary }}</p>
                <p v-else class="italic text-slate-400 dark:text-slate-500">
                  Không áp dụng trên Android (chỉ iOS)
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>

    <CreateVbotWorkTaskModal
      v-model:open="createTaskOpen"
      :draft="activeTaskDraft"
      :fallback-url="vbotWorkUrl"
      @created="handleParityTaskCreated"
    />
  </div>
</template>
