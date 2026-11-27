<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import {
  Check,
  Code2,
  ExternalLink,
  Pin,
  Search,
  Sparkles,
  Table2,
} from 'lucide-vue-next';
import { FLOW_EXPLORER_KEY } from '../composables/useFlowExplorer';
import { useToast } from '../composables/useToast';
import {
  buildBulkNodeUpdatePatches,
  buildFlatManageableNodes,
  type BulkNodeMetaUpdate,
} from '../core/bulkNodeManager';
import type { DraftPatch } from '../core/datasetDraftStore';
import {
  extractCodeRefsByPlatform,
  type SourcePeekLaunchContext,
} from '../core/sourcePeekClient';
import type { NodeStatus } from '../data/schema';

const emit = defineEmits<{
  jumpToNode: [nodeId: string];
  openSourcePeek: [context: SourcePeekLaunchContext];
  applyDraftPatches: [patches: DraftPatch[]];
}>();

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const { pushToast } = useToast();
const query = ref('');
const branchFilter = ref('all');
const statusFilter = ref<'all' | NodeStatus>('all');
const quickFilter = ref<'all' | 'missing_verified' | 'missing_task' | 'parity_diff' | 'stale'>('all');
const selectedIds = ref<Set<string>>(new Set());

const bulkStatus = ref<'' | NodeStatus>('');
const bulkDate = ref('');
const bulkOwner = ref('');
const bulkTaskUrl = ref('');

const rows = computed(() =>
  buildFlatManageableNodes(explorer.dataset, {
    personalNotesByNodeId: explorer.devNotesByNodeId.value,
  }),
);

const branchOptions = computed(() => {
  const map = new Map<string, string>();
  for (const r of rows.value) {
    if (!map.has(r.branchId)) map.set(r.branchId, r.branchLabel);
  }
  return [...map.entries()].map(([id, label]) => ({ id, label }));
});

const filteredRows = computed(() => {
  const q = query.value.trim().toLowerCase();
  return rows.value.filter((r) => {
    if (branchFilter.value !== 'all' && r.branchId !== branchFilter.value) return false;
    if (statusFilter.value !== 'all' && r.status !== statusFilter.value) return false;
    if (quickFilter.value === 'missing_verified' && !r.isMissingVerified) return false;
    if (quickFilter.value === 'missing_task' && Boolean(r.workTaskUrl)) return false;
    if (quickFilter.value === 'parity_diff' && !r.hasDiff) return false;
    if (quickFilter.value === 'stale' && !r.isStale) return false;
    if (!q) return true;
    const hay = [
      r.node.id,
      r.nodeLabel,
      r.branchLabel,
      r.owner,
      r.taskKey,
      r.parityCode ?? '',
      r.personalNote,
    ]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
});

const allFilteredSelected = computed(() => {
  if (filteredRows.value.length === 0) return false;
  return filteredRows.value.every((r) => selectedIds.value.has(r.node.id));
});

const toggleSelectRow = (nodeId: string) => {
  const next = new Set(selectedIds.value);
  if (next.has(nodeId)) next.delete(nodeId);
  else next.add(nodeId);
  selectedIds.value = next;
};

const toggleSelectAllFiltered = () => {
  const next = new Set(selectedIds.value);
  if (allFilteredSelected.value) {
    for (const r of filteredRows.value) next.delete(r.node.id);
  } else {
    for (const r of filteredRows.value) next.add(r.node.id);
  }
  selectedIds.value = next;
};

const applyBulkUpdate = () => {
  if (selectedIds.value.size === 0) return;
  const update: BulkNodeMetaUpdate = {};
  if (bulkStatus.value) update.status = bulkStatus.value;
  if (bulkDate.value.trim()) update.lastVerifiedAt = bulkDate.value.trim();
  if (bulkOwner.value.trim()) update.owner = bulkOwner.value.trim();
  if (bulkTaskUrl.value.trim()) update.workTaskUrl = bulkTaskUrl.value.trim();

  if (
    !update.status &&
    !update.lastVerifiedAt &&
    !update.owner &&
    !update.workTaskUrl
  ) {
    pushToast('Hãy chọn ít nhất 1 trường cần cập nhật hàng loạt', 'info');
    return;
  }

  const patches = buildBulkNodeUpdatePatches(
    explorer.dataset,
    [...selectedIds.value],
    update,
  );
  if (patches.length === 0) {
    pushToast('Không tạo được patch hợp lệ (kiểm tra lại định dạng ngày YYYY-MM-DD hoặc URL)', 'error');
    return;
  }

  emit('applyDraftPatches', patches);
  selectedIds.value = new Set();
  bulkStatus.value = '';
  bulkDate.value = '';
  bulkOwner.value = '';
  bulkTaskUrl.value = '';
};

const openSourceForRow = (nodeId: string) => {
  const row = rows.value.find((r) => r.node.id === nodeId);
  if (!row) return;
  const grouped = extractCodeRefsByPlatform(row.node);
  if (grouped.ios.length === 0 && grouped.android.length === 0) {
    pushToast('Node này chưa gắn codeRefs', 'info');
    return;
  }
  emit('openSourcePeek', {
    title: row.nodeLabel,
    nodeId,
    iosRef: grouped.ios[0],
    androidRef: grouped.android[0],
    iosRefs: grouped.ios,
    androidRefs: grouped.android,
  });
};

const STATUS_BADGE: Record<NodeStatus, string> = {
  stable: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300',
  wip: 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300',
  needs_review: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
  deprecated: 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden text-xs">
    <!-- Filter Bar -->
    <div class="space-y-2.5 border-b border-slate-200 bg-white px-5 py-3.5 dark:border-slate-800 dark:bg-slate-900/80">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <Table2 class="h-4 w-4 text-indigo-600 dark:text-cyan-400" />
          <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">
            Quản lý Node hàng loạt ({{ filteredRows.length }}/{{ rows.length }})
          </h3>
        </div>
        <div class="flex flex-wrap items-center gap-1.5">
          <button
            v-for="qf in [
              { id: 'all', label: 'Tất cả' },
              { id: 'missing_verified', label: 'Thiếu ngày kiểm' },
              { id: 'stale', label: 'Quá hạn >60 ngày' },
              { id: 'parity_diff', label: 'Có lệch Parity' },
              { id: 'missing_task', label: 'Chưa gắn Task' },
            ] as const"
            :key="qf.id"
            type="button"
            class="rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition"
            :class="
              quickFilter === qf.id
                ? 'border-indigo-600 bg-indigo-600 text-white dark:border-cyan-500 dark:bg-cyan-500 dark:text-slate-950'
                : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
            "
            @click="quickFilter = qf.id"
          >
            {{ qf.label }}
          </button>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <div class="relative min-w-56 flex-1">
          <Search class="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            v-model="query"
            type="text"
            placeholder="Tìm tên node, ID, owner, mã VbM-..., mã Parity..."
            class="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pr-3 pl-9 text-xs text-slate-900 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>
        <select
          v-model="branchFilter"
          class="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
        >
          <option value="all">Mọi nhánh</option>
          <option v-for="b in branchOptions" :key="b.id" :value="b.id">{{ b.label }}</option>
        </select>
        <select
          v-model="statusFilter"
          class="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
        >
          <option value="all">Mọi trạng thái</option>
          <option value="stable">stable</option>
          <option value="wip">wip</option>
          <option value="needs_review">needs_review</option>
          <option value="deprecated">deprecated</option>
        </select>
      </div>

      <!-- Bulk Action Bar -->
      <div
        v-if="selectedIds.size > 0"
        class="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/80 p-2.5 dark:border-cyan-500/40 dark:bg-cyan-500/12"
      >
        <span class="inline-flex items-center gap-1 font-bold text-indigo-900 dark:text-cyan-200">
          <Sparkles class="h-3.5 w-3.5" />
          Đã chọn {{ selectedIds.size }} node:
        </span>
        <select
          v-model="bulkStatus"
          class="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="">-- Đổi Status --</option>
          <option value="stable">stable</option>
          <option value="wip">wip</option>
          <option value="needs_review">needs_review</option>
          <option value="deprecated">deprecated</option>
        </select>
        <div class="flex items-center gap-1">
          <input
            v-model="bulkDate"
            type="text"
            placeholder="YYYY-MM-DD"
            class="w-28 rounded border border-slate-200 bg-white px-2 py-1 font-mono text-[11px] dark:border-slate-700 dark:bg-slate-900"
          />
          <button
            type="button"
            class="rounded border border-slate-300 bg-white px-2 py-1 text-[10.5px] font-semibold hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
            @click="bulkDate = new Date().toISOString().slice(0, 10)"
          >
            Hôm nay
          </button>
        </div>
        <input
          v-model="bulkOwner"
          type="text"
          placeholder="Owner..."
          class="w-28 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-900"
        />
        <input
          v-model="bulkTaskUrl"
          type="url"
          placeholder="https://work.vpmedia.vn/..."
          class="w-44 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-900"
        />
        <button
          type="button"
          class="ml-auto inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1 font-bold text-white hover:bg-indigo-500 dark:bg-cyan-500 dark:text-slate-950"
          @click="applyBulkUpdate"
        >
          <Check class="h-3.5 w-3.5" />
          Áp dụng vào Draft Patch
        </button>
      </div>
    </div>

    <!-- Table -->
    <div class="min-h-0 flex-1 overflow-auto p-4">
      <table class="w-full border-collapse overflow-hidden rounded-xl border border-slate-200 bg-white text-left dark:border-slate-800 dark:bg-slate-900/80">
        <thead class="bg-slate-50 text-[10.5px] font-bold tracking-wide text-slate-500 uppercase dark:bg-slate-900 dark:text-slate-400">
          <tr class="border-b border-slate-200 dark:border-slate-800">
            <th class="w-8 px-3 py-2.5">
              <input
                type="checkbox"
                :checked="allFilteredSelected"
                aria-label="Chọn tất cả"
                @change="toggleSelectAllFiltered"
              />
            </th>
            <th class="px-3 py-2.5">Node / ID</th>
            <th class="px-3 py-2.5">Nhánh</th>
            <th class="px-3 py-2.5">Status</th>
            <th class="px-3 py-2.5">Parity</th>
            <th class="px-3 py-2.5">CodeRefs</th>
            <th class="px-3 py-2.5">Kiểm lần cuối</th>
            <th class="px-3 py-2.5">Task</th>
            <th class="px-3 py-2.5 text-right">Thao tác</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
          <tr
            v-for="row in filteredRows"
            :key="row.node.id"
            class="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
          >
            <td class="px-3 py-2">
              <input
                type="checkbox"
                :checked="selectedIds.has(row.node.id)"
                @change="toggleSelectRow(row.node.id)"
              />
            </td>
            <td class="max-w-xs px-3 py-2">
              <div class="truncate font-semibold text-slate-900 dark:text-slate-100">
                {{ row.nodeLabel }}
              </div>
              <div class="font-mono text-[10px] text-slate-400">{{ row.node.id }}</div>
            </td>
            <td class="px-3 py-2 text-[11px] text-slate-600 dark:text-slate-300">
              {{ row.branchLabel }}
            </td>
            <td class="px-3 py-2">
              <span class="rounded px-1.5 py-0.5 font-mono text-[10px] font-bold" :class="STATUS_BADGE[row.status]">
                {{ row.status }}
              </span>
            </td>
            <td class="px-3 py-2 font-mono text-[10.5px]">
              <span
                v-if="row.parityCode"
                class="rounded bg-amber-100 px-1.5 py-0.5 font-bold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
              >
                {{ row.parityCode }}
              </span>
              <span v-else-if="row.hasDiff" class="text-amber-600">Diff</span>
              <span v-else class="text-slate-400">-</span>
            </td>
            <td class="px-3 py-2 font-mono text-[10.5px] text-slate-600 dark:text-slate-300">
              iOS:{{ row.iosRefCount }} · AND:{{ row.androidRefCount }}
            </td>
            <td class="px-3 py-2 font-mono text-[11px]">
              <span
                v-if="row.lastVerifiedAt"
                :class="row.isStale ? 'font-bold text-rose-600 dark:text-rose-400' : 'text-slate-600 dark:text-slate-300'"
              >
                {{ row.lastVerifiedAt }}
              </span>
              <span v-else class="text-slate-400">Chưa kiểm</span>
            </td>
            <td class="px-3 py-2 font-mono text-[10.5px]">
              <a
                v-if="row.workTaskUrl"
                :href="row.workTaskUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1 font-bold text-indigo-600 hover:underline dark:text-cyan-300"
              >
                {{ row.taskKey || 'Task' }}
                <ExternalLink class="h-2.5 w-2.5" />
              </a>
              <span v-else class="text-slate-400">-</span>
            </td>
            <td class="px-3 py-2 text-right">
              <div class="inline-flex items-center gap-1">
                <button
                  type="button"
                  class="rounded p-1 transition"
                  :class="
                    explorer.pinnedNodeIds.value.includes(row.node.id)
                      ? 'text-amber-500'
                      : 'text-slate-400 hover:text-amber-500'
                  "
                  title="Ghim vào Đang làm"
                  @click="explorer.togglePinnedNode(row.node.id)"
                >
                  <Pin class="h-3.5 w-3.5" />
                </button>
                <button
                  v-if="row.iosRefCount > 0 || row.androidRefCount > 0"
                  type="button"
                  class="rounded p-1 text-slate-400 hover:text-cyan-500"
                  title="Soi Code Swift ↔ Kotlin"
                  @click="openSourceForRow(row.node.id)"
                >
                  <Code2 class="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  class="rounded p-1 text-slate-400 hover:text-indigo-600"
                  title="Xem trên sơ đồ"
                  @click="emit('jumpToNode', row.node.id)"
                >
                  <ExternalLink class="h-3.5 w-3.5" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
