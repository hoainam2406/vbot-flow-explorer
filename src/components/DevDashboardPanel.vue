<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import {
  AlertTriangle,
  Check,
  Code2,
  Copy,
  ExternalLink,
  Kanban,
  LayoutDashboard,
  Pin,
  Scale,
  Sparkles,
  Table2,
} from 'lucide-vue-next';
import { FLOW_EXPLORER_KEY } from '../composables/useFlowExplorer';
import { useToast } from '../composables/useToast';
import {
  buildDevDashboardSummary,
  exportDevDashboardMarkdown,
} from '../core/devDashboardEngine';
import { copyTextToClipboard } from '../core/downloadHelper';
import { findNodeById } from '../core/graphEngine';
import type { ParityItem } from '../core/parityAnalyzer';
import {
  extractCodeRefsByPlatform,
  type SourcePeekLaunchContext,
} from '../core/sourcePeekClient';
import { loadParityTriageMap } from '../core/vbotWorkTemplates';
import type { GovernanceHubTab } from './GovernanceHubModal.vue';

const emit = defineEmits<{
  switchTab: [tab: GovernanceHubTab];
  jumpToNode: [nodeId: string];
  openParity: [];
  openSourcePeek: [context: SourcePeekLaunchContext];
}>();

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const { pushToast } = useToast();
const onlyOpenTriage = ref(true);
const copiedReport = ref(false);
const copiedPinPrompt = ref(false);
const triageMap = ref(loadParityTriageMap());

const summary = computed(() =>
  buildDevDashboardSummary(explorer.dataset, {
    pinnedNodeIds: explorer.pinnedNodeIds.value,
    devNotesByNodeId: explorer.devNotesByNodeId.value,
    workboard: { tasks: explorer.workboardTasks.value },
    parityTriageMap: triageMap.value,
  }),
);

const filterParityQueue = (items: ParityItem[]) => {
  if (!onlyOpenTriage.value) return items;
  return items.filter((item) => {
    const st = triageMap.value[item.nodeId] ?? 'open';
    return st === 'open' || st === 'in_progress';
  });
};

const iosQueue = computed(() => filterParityQueue(summary.value.parityQueues.ios));
const androidQueue = computed(() => filterParityQueue(summary.value.parityQueues.android));
const bothQueue = computed(() =>
  filterParityQueue([...summary.value.parityQueues.both, ...summary.value.parityQueues.other]),
);

const copyDevReport = async () => {
  const md = exportDevDashboardMarkdown(summary.value);
  const ok = await copyTextToClipboard(md);
  if (ok) {
    copiedReport.value = true;
    pushToast('Đã copy Báo cáo Tổng quan Dev (.md)', 'success');
    setTimeout(() => {
      copiedReport.value = false;
    }, 1500);
  }
};

const copyPinnedPrompt = async () => {
  const pinnedNodes = summary.value.pinnedSummaries.map((p) => p.node);
  if (pinnedNodes.length === 0) return;
  const [{ buildMultiNodeAiContextPrompt }, { loadDevWorkspaceSettings }] = await Promise.all([
    import('../core/aiContextExport'),
    import('../core/workspaceSettings'),
  ]);
  const prompt = buildMultiNodeAiContextPrompt(pinnedNodes, explorer.dataset, {
    title: `Ngữ cảnh Đang làm (${pinnedNodes.length} node)`,
    platformMode: explorer.platformMode.value,
    settings: loadDevWorkspaceSettings(),
    personalNotesByNodeId: explorer.devNotesByNodeId.value,
  });
  const ok = await copyTextToClipboard(prompt);
  if (ok) {
    copiedPinPrompt.value = true;
    pushToast('Đã copy Multi-Node AI Prompt cho nhóm Đang làm', 'success');
    setTimeout(() => {
      copiedPinPrompt.value = false;
    }, 1500);
  }
};

const openSourcePeekForNode = (nodeId: string) => {
  const node = findNodeById(explorer.dataset, nodeId);
  if (!node) return;
  const grouped = extractCodeRefsByPlatform(node);
  if (grouped.ios.length === 0 && grouped.android.length === 0) {
    pushToast('Node này chưa gắn codeRefs', 'info');
    return;
  }
  emit('openSourcePeek', {
    title: node.techLabel || node.label,
    nodeId,
    iosRef: grouped.ios[0],
    androidRef: grouped.android[0],
    iosRefs: grouped.ios,
    androidRefs: grouped.android,
  });
};
</script>

<template>
  <div class="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 text-xs">
    <!-- Header Bar -->
    <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/80">
      <div>
        <h3 class="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-slate-100">
          <LayoutDashboard class="h-4 w-4 text-indigo-600 dark:text-cyan-400" />
          Dev Home Dashboard · Nhánh <code class="font-mono text-emerald-700 dark:text-emerald-300">{{ summary.branchLabel }}</code>
        </h3>
        <p class="mt-0.5 text-slate-500 dark:text-slate-400">
          Toàn cảnh việc iOS / Android cần đồng bộ, node WIP/quá hạn kiểm, Working Pins và Task Workboard cá nhân (chạy 100% tĩnh).
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          @click="emit('switchTab', 'nodes')"
        >
          <Table2 class="h-3.5 w-3.5 text-indigo-500" />
          Quản lý Node
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          @click="emit('switchTab', 'workboard')"
        >
          <Kanban class="h-3.5 w-3.5 text-cyan-500" />
          Task VbM
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          @click="emit('openParity')"
        >
          <Scale class="h-3.5 w-3.5 text-amber-500" />
          Parity Matrix
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 font-bold text-white hover:bg-indigo-500 dark:bg-cyan-500 dark:text-slate-950"
          @click="copyDevReport"
        >
          <Check v-if="copiedReport" class="h-3.5 w-3.5" />
          <Copy v-else class="h-3.5 w-3.5" />
          {{ copiedReport ? 'Đã copy Báo cáo' : 'Copy Báo cáo Dev (.md)' }}
        </button>
      </div>
    </div>

    <!-- 5 KPI Cards -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <div class="rounded-xl border border-rose-200 bg-rose-50/70 p-3.5 dark:border-rose-500/35 dark:bg-rose-500/10">
        <div class="text-[10.5px] font-bold text-rose-700 uppercase dark:text-rose-300">Parity Action Needed</div>
        <div class="mt-1 text-2xl font-extrabold text-rose-900 dark:text-rose-100">
          {{ summary.totals.parityActionNeeded }}
        </div>
        <div class="mt-0.5 text-[11px] text-rose-700/80 dark:text-rose-300/80">
          +{{ summary.totals.parityLogicDiff }} mục logic_diff
        </div>
      </div>

      <div class="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 dark:border-amber-500/35 dark:bg-amber-500/10">
        <div class="text-[10.5px] font-bold text-amber-800 uppercase dark:text-amber-300">WIP / Cần Review</div>
        <div class="mt-1 text-2xl font-extrabold text-amber-950 dark:text-amber-100">
          {{ summary.totals.wipCount + summary.totals.needsReviewCount }}
        </div>
        <div class="mt-0.5 text-[11px] text-amber-800/80 dark:text-amber-300/80">
          {{ summary.totals.wipCount }} WIP · {{ summary.totals.needsReviewCount }} Review
        </div>
      </div>

      <div class="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900/80">
        <div class="text-[10.5px] font-bold text-slate-500 uppercase dark:text-slate-400">Quá hạn / Thiếu ngày kiểm</div>
        <div class="mt-1 text-2xl font-extrabold text-slate-900 dark:text-slate-100">
          {{ summary.totals.staleCount }}
        </div>
        <div class="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
          {{ summary.totals.missingVerifiedCount }} node chưa có lastVerifiedAt
        </div>
      </div>

      <div class="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3.5 dark:border-indigo-500/35 dark:bg-indigo-500/10">
        <div class="text-[10.5px] font-bold text-indigo-800 uppercase dark:text-indigo-300">Đang làm (Pins)</div>
        <div class="mt-1 text-2xl font-extrabold text-indigo-950 dark:text-indigo-100">
          {{ summary.totals.pinnedCount }}
        </div>
        <div class="mt-0.5 text-[11px] text-indigo-700/80 dark:text-indigo-300/80">
          Ghim từ DetailDrawer
        </div>
      </div>

      <div class="rounded-xl border border-cyan-200 bg-cyan-50/60 p-3.5 dark:border-cyan-500/35 dark:bg-cyan-500/10">
        <div class="text-[10.5px] font-bold text-cyan-800 uppercase dark:text-cyan-300">Task Workboard</div>
        <div class="mt-1 text-2xl font-extrabold text-cyan-950 dark:text-cyan-100">
          {{ summary.totals.activeWorkboardTasks }}
        </div>
        <div class="mt-0.5 text-[11px] text-cyan-800/80 dark:text-cyan-300/80">
          {{ summary.totals.linkedTaskNodes }} node có workTaskUrl
        </div>
      </div>
    </div>

    <!-- 3-Column Parity Work Queues -->
    <div class="space-y-2.5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/80">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h4 class="font-bold text-slate-900 dark:text-slate-100">
          Hàng đợi Parity cần xử lý theo nền tảng
        </h4>
        <label class="inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
          <input v-model="onlyOpenTriage" type="checkbox" class="rounded" />
          <span>Chỉ hiện mục chưa xong (Open / In Progress)</span>
        </label>
      </div>

      <div class="grid gap-3 lg:grid-cols-3">
        <div
          v-for="col in [
            { id: 'ios', title: 'Việc iOS (Swift)', items: iosQueue, cls: 'border-indigo-200 bg-indigo-50/40 dark:border-indigo-500/30 dark:bg-indigo-500/8' },
            { id: 'android', title: 'Việc Android (Kotlin)', items: androidQueue, cls: 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-500/30 dark:bg-emerald-500/8' },
            { id: 'both', title: 'Cả 2 bên / Chờ chốt', items: bothQueue, cls: 'border-amber-200 bg-amber-50/40 dark:border-amber-500/30 dark:bg-amber-500/8' },
          ]"
          :key="col.id"
          class="flex max-h-80 flex-col rounded-xl border p-3"
          :class="col.cls"
        >
          <div class="mb-2 flex items-center justify-between font-bold text-slate-900 dark:text-slate-100">
            <span>{{ col.title }}</span>
            <span class="rounded-full bg-white px-2 py-0.5 font-mono text-[10px] dark:bg-slate-800">
              {{ col.items.length }}
            </span>
          </div>
          <p v-if="col.items.length === 0" class="py-6 text-center text-[11px] text-slate-500">
            Không có mục tồn đọng.
          </p>
          <ul v-else class="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
            <li
              v-for="item in col.items"
              :key="item.nodeId"
              class="rounded-lg border border-slate-200/80 bg-white p-2.5 dark:border-slate-700/80 dark:bg-slate-900/90"
            >
              <div class="flex items-center justify-between gap-1.5">
                <span class="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-800 dark:bg-slate-800 dark:text-cyan-300">
                  {{ item.code }}
                </span>
                <div class="flex items-center gap-1">
                  <button
                    type="button"
                    class="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-cyan-600 dark:hover:bg-slate-800"
                    title="Soi Code Swift ↔ Kotlin"
                    @click="openSourcePeekForNode(item.nodeId)"
                  >
                    <Code2 class="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    class="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800"
                    title="Mở trên sơ đồ"
                    @click="emit('jumpToNode', item.nodeId)"
                  >
                    <ExternalLink class="h-3 w-3" />
                  </button>
                </div>
              </div>
              <div class="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                {{ item.nodeLabel }}
              </div>
              <p class="mt-0.5 line-clamp-2 text-[11px] text-slate-500 dark:text-slate-400">
                {{ item.assessment.recommendation }}
              </p>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Bottom 2 Columns: Pinned Working Nodes & Watchlist -->
    <div class="grid gap-4 lg:grid-cols-2">
      <div class="space-y-2.5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/80">
        <div class="flex items-center justify-between gap-2">
          <h4 class="flex items-center gap-1.5 font-bold text-slate-900 dark:text-slate-100">
            <Pin class="h-3.5 w-3.5 text-amber-500" />
            Node đang ghim &amp; Ghi chú Dev ({{ summary.pinnedSummaries.length }})
          </h4>
          <button
            v-if="summary.pinnedSummaries.length > 0"
            type="button"
            class="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-800 hover:bg-indigo-100 dark:border-cyan-500/35 dark:bg-cyan-500/15 dark:text-cyan-200"
            @click="copyPinnedPrompt"
          >
            <Check v-if="copiedPinPrompt" class="h-3 w-3 text-emerald-500" />
            <Sparkles v-else class="h-3 w-3" />
            {{ copiedPinPrompt ? 'Đã copy' : 'AI Prompt nhóm' }}
          </button>
        </div>

        <p v-if="summary.pinnedSummaries.length === 0" class="py-6 text-center text-slate-500">
          Chưa ghim node nào. Mở một node trên sơ đồ và bấm icon Pin ở góc trên drawer để theo dõi tại đây.
        </p>
        <ul v-else class="space-y-2">
          <li
            v-for="pin in summary.pinnedSummaries"
            :key="pin.node.id"
            class="rounded-lg border border-amber-200/80 bg-amber-50/40 p-2.5 dark:border-amber-500/30 dark:bg-amber-500/10"
          >
            <div class="flex items-center justify-between gap-2">
              <button
                type="button"
                class="font-bold text-slate-900 hover:text-indigo-600 dark:text-slate-100 dark:hover:text-cyan-300"
                @click="emit('jumpToNode', pin.node.id)"
              >
                {{ pin.label }}
              </button>
              <button
                type="button"
                class="text-[11px] text-slate-400 hover:text-rose-500"
                @click="explorer.togglePinnedNode(pin.node.id)"
              >
                Bỏ ghim
              </button>
            </div>
            <p v-if="pin.note" class="mt-1 text-[11px] text-amber-900 dark:text-amber-200">
              {{ pin.note }}
            </p>
          </li>
        </ul>
      </div>

      <div class="space-y-2.5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/80">
        <div class="flex items-center justify-between gap-2">
          <h4 class="flex items-center gap-1.5 font-bold text-slate-900 dark:text-slate-100">
            <AlertTriangle class="h-3.5 w-3.5 text-amber-500" />
            Node WIP / Review / Quá hạn kiểm ({{ summary.attentionNodes.length }})
          </h4>
          <button
            type="button"
            class="text-[11px] font-semibold text-indigo-600 hover:underline dark:text-cyan-300"
            @click="emit('switchTab', 'nodes')"
          >
            Sửa hàng loạt →
          </button>
        </div>

        <p v-if="summary.attentionNodes.length === 0" class="py-6 text-center text-slate-500">
          Toàn bộ node đều ổn định và đã được kiểm gần đây.
        </p>
        <ul v-else class="max-h-64 space-y-1.5 overflow-y-auto pr-1">
          <li
            v-for="row in summary.attentionNodes"
            :key="row.node.id"
            class="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/60"
          >
            <div class="min-w-0">
              <div class="truncate font-semibold text-slate-900 dark:text-slate-100">
                {{ row.nodeLabel }}
              </div>
              <div class="text-[10.5px] text-slate-500">
                {{ row.branchLabel }} · status: <span class="font-mono">{{ row.status }}</span>
                <template v-if="row.lastVerifiedAt"> · kiểm: {{ row.lastVerifiedAt }}</template>
              </div>
            </div>
            <button
              type="button"
              class="shrink-0 rounded border border-slate-200 bg-white px-2 py-1 text-[10.5px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              @click="emit('jumpToNode', row.node.id)"
            >
              Mở
            </button>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
