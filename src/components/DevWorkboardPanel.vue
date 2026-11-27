<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  ExternalLink,
  Kanban,
  Plus,
  Search,
  Trash2,
} from 'lucide-vue-next';
import { FLOW_EXPLORER_KEY } from '../composables/useFlowExplorer';
import { useToast } from '../composables/useToast';
import { buildBulkNodeUpdatePatches, buildFlatManageableNodes } from '../core/bulkNodeManager';
import type { DraftPatch } from '../core/datasetDraftStore';
import {
  deleteWorkboardTask,
  extractVbotTaskKey,
  updateWorkboardTaskStatus,
  upsertWorkboardTask,
  type DevWorkboardTask,
  type WorkboardPlatform,
  type WorkboardPriority,
  type WorkboardStatus,
} from '../core/devWorkboardStore';
import { getNodeDisplayLabel } from '../core/graphEngine';

const emit = defineEmits<{
  jumpToNode: [nodeId: string];
  applyDraftPatches: [patches: DraftPatch[]];
}>();

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const { pushToast } = useToast();
const query = ref('');
const platformFilter = ref<'all' | WorkboardPlatform>('all');

const newTitle = ref('');
const newUrlOrKey = ref('');
const newPlatform = ref<WorkboardPlatform>('both');
const newPriority = ref<WorkboardPriority>('medium');
const newNodeId = ref('');

const allNodes = computed(() => buildFlatManageableNodes(explorer.dataset));

const filteredTasks = computed(() => {
  const q = query.value.trim().toLowerCase();
  return explorer.workboardTasks.value.filter((t) => {
    if (platformFilter.value !== 'all' && t.platform !== platformFilter.value) return false;
    if (!q) return true;
    const hay = [t.key ?? '', t.title, t.nodeId ?? '', t.note ?? ''].join(' ').toLowerCase();
    return hay.includes(q);
  });
});

const COLUMNS: Array<{ id: WorkboardStatus; label: string; cls: string }> = [
  { id: 'todo', label: 'Todo', cls: 'border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/60' },
  { id: 'doing', label: 'Đang làm', cls: 'border-cyan-200 bg-cyan-50/50 dark:border-cyan-500/30 dark:bg-cyan-500/8' },
  { id: 'review', label: 'Review', cls: 'border-amber-200 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-500/8' },
  { id: 'done', label: 'Xong', cls: 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-500/30 dark:bg-emerald-500/8' },
];

const tasksByStatus = (status: WorkboardStatus) =>
  filteredTasks.value.filter((t) => t.status === status);

const handleCreateTask = () => {
  if (!newTitle.value.trim()) {
    pushToast('Nhập tiêu đề công việc trước khi thêm', 'info');
    return;
  }
  const rawRef = newUrlOrKey.value.trim();
  const isUrl = /^https?:\/\//i.test(rawRef);
  const key = extractVbotTaskKey(rawRef) ?? extractVbotTaskKey(newTitle.value) ?? undefined;
  const next = upsertWorkboardTask({
    title: newTitle.value.trim(),
    key,
    url: isUrl ? rawRef : undefined,
    status: 'todo',
    platform: newPlatform.value,
    priority: newPriority.value,
    nodeId: newNodeId.value || undefined,
  });
  explorer.setWorkboardTasks(next.tasks);
  newTitle.value = '';
  newUrlOrKey.value = '';
  newNodeId.value = '';
  pushToast('Đã thêm task vào Dev Workboard', 'success');
};

const importFromLinkedNodes = () => {
  const existingKeys = new Set(
    explorer.workboardTasks.value.map((t) => `${t.nodeId ?? ''}::${t.url ?? t.key ?? ''}`),
  );
  let added = 0;
  let nextTasks = explorer.workboardTasks.value;

  for (const row of allNodes.value) {
    if (!row.workTaskUrl) continue;
    const dedup = `${row.node.id}::${row.workTaskUrl}`;
    if (existingKeys.has(dedup)) continue;
    const key = extractVbotTaskKey(row.workTaskUrl) ?? undefined;
    const nextState = upsertWorkboardTask({
      title: row.nodeLabel,
      key,
      url: row.workTaskUrl,
      status: row.status === 'stable' ? 'done' : 'doing',
      platform:
        row.node.platforms?.length === 1 ? row.node.platforms[0]! : 'both',
      priority: 'medium',
      nodeId: row.node.id,
    });
    nextTasks = nextState.tasks;
    added += 1;
  }

  explorer.setWorkboardTasks(nextTasks);
  pushToast(
    added > 0
      ? `Đã nhập ${added} task từ các node có workTaskUrl`
      : 'Tất cả node có workTaskUrl đã nằm trên Workboard',
    'info',
  );
};

const moveTask = (taskId: string, delta: -1 | 1) => {
  const order: WorkboardStatus[] = ['todo', 'doing', 'review', 'done'];
  const task = explorer.workboardTasks.value.find((t) => t.id === taskId);
  if (!task) return;
  const idx = order.indexOf(task.status);
  const nextStatus = order[idx + delta];
  if (!nextStatus) return;
  const next = updateWorkboardTaskStatus(taskId, nextStatus);
  explorer.setWorkboardTasks(next.tasks);
};

const removeTask = (taskId: string) => {
  const next = deleteWorkboardTask(taskId);
  explorer.setWorkboardTasks(next.tasks);
};

const syncTaskDoneToNodeDraft = (task: DevWorkboardTask) => {
  if (!task.nodeId) return;
  const today = new Date().toISOString().slice(0, 10);
  const patches = buildBulkNodeUpdatePatches(explorer.dataset, [task.nodeId], {
    status: 'stable',
    lastVerifiedAt: today,
    ...(task.url && /^https?:\/\//i.test(task.url) ? { workTaskUrl: task.url } : {}),
  });
  if (patches.length > 0) {
    emit('applyDraftPatches', patches);
  }
};

const resolveNodeName = (nodeId?: string): string | null => {
  if (!nodeId) return null;
  const node = explorer.findNode(nodeId);
  return node ? getNodeDisplayLabel(node, 'tech') : nodeId;
};
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden text-xs">
    <!-- Quick Add & Filters -->
    <div class="space-y-3 border-b border-slate-200 bg-white px-5 py-3.5 dark:border-slate-800 dark:bg-slate-900/80">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 class="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-slate-100">
            <Kanban class="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
            Dev Workboard &amp; Liên kết Task VbM-* (Static-First)
          </h3>
          <p class="mt-0.5 text-slate-500 dark:text-slate-400">
            Quản lý task theo từng node (lưu localStorage, hoạt động 100% trên GitHub Pages). Badge mã task tự động hiện trên sơ đồ.
          </p>
        </div>

        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 font-semibold text-indigo-800 hover:bg-indigo-100 dark:border-cyan-500/35 dark:bg-cyan-500/15 dark:text-cyan-200"
          @click="importFromLinkedNodes"
        >
          <Download class="h-3.5 w-3.5" />
          Tự nhập từ Node có link Task
        </button>
      </div>

      <div class="grid grid-cols-1 gap-2 sm:grid-cols-12">
        <input
          v-model="newTitle"
          type="text"
          placeholder="Tiêu đề task (VD: Đồng bộ toast lỗi DTMF #3 Android)..."
          class="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 sm:col-span-4 dark:border-slate-700 dark:bg-slate-950"
          @keydown.enter.prevent="handleCreateTask"
        />
        <input
          v-model="newUrlOrKey"
          type="text"
          placeholder="Mã VbM-832 hoặc link VBot Work..."
          class="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono sm:col-span-3 dark:border-slate-700 dark:bg-slate-950"
        />
        <select
          v-model="newNodeId"
          class="rounded-lg border border-slate-200 bg-white px-2 py-1.5 sm:col-span-2 dark:border-slate-700 dark:bg-slate-800"
        >
          <option value="">-- Gắn vào Node --</option>
          <option v-for="r in allNodes" :key="r.node.id" :value="r.node.id">
            {{ r.nodeLabel }}
          </option>
        </select>
        <select
          v-model="newPlatform"
          class="rounded-lg border border-slate-200 bg-white px-2 py-1.5 sm:col-span-1 dark:border-slate-700 dark:bg-slate-800"
        >
          <option value="both">2 HĐH</option>
          <option value="ios">iOS</option>
          <option value="android">Android</option>
        </select>
        <button
          type="button"
          class="inline-flex items-center justify-center gap-1 rounded-lg bg-cyan-600 px-3 py-1.5 font-bold text-white hover:bg-cyan-500 sm:col-span-2"
          @click="handleCreateTask"
        >
          <Plus class="h-3.5 w-3.5" />
          Thêm Task
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <div class="relative min-w-48 flex-1">
          <Search class="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            v-model="query"
            type="text"
            placeholder="Lọc task theo mã VbM-..., tiêu đề, node..."
            class="w-full rounded-lg border border-slate-200 bg-slate-50 py-1 pr-3 pl-8 text-xs dark:border-slate-700 dark:bg-slate-950"
          />
        </div>
        <select
          v-model="platformFilter"
          class="rounded-lg border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-700 dark:bg-slate-800"
        >
          <option value="all">Mọi nền tảng</option>
          <option value="ios">iOS</option>
          <option value="android">Android</option>
          <option value="both">Cả 2 bên</option>
        </select>
      </div>
    </div>

    <!-- 4-Column Kanban -->
    <div class="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-4 md:grid-cols-2 xl:grid-cols-4">
      <div
        v-for="(col, colIdx) in COLUMNS"
        :key="col.id"
        class="flex min-h-[240px] flex-col rounded-xl border p-3"
        :class="col.cls"
      >
        <div class="mb-2.5 flex items-center justify-between font-bold text-slate-900 dark:text-slate-100">
          <span>{{ col.label }}</span>
          <span class="rounded-full bg-white px-2 py-0.5 font-mono text-[10px] dark:bg-slate-800">
            {{ tasksByStatus(col.id).length }}
          </span>
        </div>

        <div class="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
          <p v-if="tasksByStatus(col.id).length === 0" class="py-8 text-center text-[11px] text-slate-400">
            Trống
          </p>
          <div
            v-for="task in tasksByStatus(col.id)"
            :key="task.id"
            class="space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-2xs dark:border-slate-700/80 dark:bg-slate-900/90"
          >
            <div class="flex flex-wrap items-center justify-between gap-1">
              <div class="flex flex-wrap items-center gap-1">
                <a
                  v-if="task.url"
                  :href="task.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-indigo-700 hover:underline dark:bg-cyan-500/15 dark:text-cyan-300"
                >
                  {{ task.key || 'Link' }}
                  <ExternalLink class="h-2.5 w-2.5" />
                </a>
                <span
                  v-else-if="task.key"
                  class="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  {{ task.key }}
                </span>
                <span class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {{ task.platform }}
                </span>
              </div>
              <button
                type="button"
                class="rounded p-1 text-slate-400 hover:text-rose-500"
                title="Xóa task"
                @click="removeTask(task.id)"
              >
                <Trash2 class="h-3 w-3" />
              </button>
            </div>

            <div class="font-semibold text-slate-900 dark:text-slate-100">
              {{ task.title }}
            </div>

            <button
              v-if="task.nodeId"
              type="button"
              class="inline-flex max-w-full items-center gap-1 truncate rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10.5px] font-medium text-slate-700 hover:border-indigo-300 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              @click="emit('jumpToNode', task.nodeId)"
            >
              <span class="truncate">{{ resolveNodeName(task.nodeId) }}</span>
              <ExternalLink class="h-2.5 w-2.5 shrink-0" />
            </button>

            <div class="flex items-center justify-between gap-1 border-t border-slate-100 pt-2 dark:border-slate-800">
              <div class="flex items-center gap-1">
                <button
                  v-if="colIdx > 0"
                  type="button"
                  class="rounded border border-slate-200 bg-slate-50 p-1 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
                  title="Chuyển sang cột trước"
                  @click="moveTask(task.id, -1)"
                >
                  <ArrowLeft class="h-3 w-3" />
                </button>
                <button
                  v-if="colIdx < COLUMNS.length - 1"
                  type="button"
                  class="rounded border border-slate-200 bg-slate-50 p-1 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
                  title="Chuyển sang cột tiếp theo"
                  @click="moveTask(task.id, 1)"
                >
                  <ArrowRight class="h-3 w-3" />
                </button>
              </div>

              <button
                v-if="task.nodeId && task.status === 'done'"
                type="button"
                class="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-500"
                title="Đánh dấu node là stable + hôm nay + gắn workTaskUrl vào Draft Patch"
                @click="syncTaskDoneToNodeDraft(task)"
              >
                <Check class="h-2.5 w-2.5" />
                Cập nhật Node
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
