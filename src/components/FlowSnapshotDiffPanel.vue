<script setup lang="ts">
import { computed, inject, onMounted, ref, shallowRef } from 'vue';
import {
  Check,
  Copy,
  Download,
  Eye,
  GitBranch,
  Loader2,
  Upload,
} from 'lucide-vue-next';
import { FLOW_EXPLORER_KEY } from '../composables/useFlowExplorer';
import { useToast } from '../composables/useToast';
import { copyTextToClipboard, downloadTextFile } from '../core/downloadHelper';
import {
  createDatasetSnapshot,
  diffDatasets,
  exportSnapshotDiffChangelogMarkdown,
  parseDatasetSnapshotJson,
} from '../core/flowSnapshotDiff';
import type { MergedFlowDataset } from '../data/schema';

const emit = defineEmits<{
  closeHub: [];
}>();

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const { pushToast } = useToast();
const baseDataset = shallowRef<MergedFlowDataset | null>(null);
const baseLabel = ref('Snapshot gốc');
const kindFilter = ref<'all' | 'node' | 'edge' | 'scenario'>('all');
const changeFilter = ref<'all' | 'added' | 'modified' | 'removed'>('all');
const gitSnapshotAvailable = ref(false);
const recentCommits = ref<Array<{ hash: string; date: string; subject: string }>>([]);
const selectedGitRef = ref('HEAD~1');
const loadingGitSnap = ref(false);
const copiedChangelog = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);

onMounted(async () => {
  if (import.meta.env.DEV) {
    try {
      const statusResp = await fetch('/__vbot-dev/status');
      if (statusResp.ok) {
        const st = (await statusResp.json()) as { capabilities?: { gitSnapshot?: boolean } };
        gitSnapshotAvailable.value = Boolean(st.capabilities?.gitSnapshot);
        if (gitSnapshotAvailable.value) {
          const listResp = await fetch('/__vbot-dev/git/dataset-snapshot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'list_refs' }),
          });
          if (listResp.ok) {
            const listData = (await listResp.json()) as {
              commits?: Array<{ hash: string; date: string; subject: string }>;
            };
            recentCommits.value = listData.commits ?? [];
            if (recentCommits.value[1]) {
              selectedGitRef.value = recentCommits.value[1].hash;
            }
          }
        }
      }
    } catch {
      gitSnapshotAvailable.value = false;
    }
  }
});

const diffReport = computed(() => {
  if (!baseDataset.value) return null;
  return diffDatasets(baseDataset.value, explorer.dataset, {
    baseLabel: baseLabel.value,
    currentLabel: 'Dataset hiện tại',
  });
});

const visibleItems = computed(() => {
  if (!diffReport.value) return [];
  return diffReport.value.items.filter((i) => {
    if (kindFilter.value !== 'all' && i.entityKind !== kindFilter.value) return false;
    if (changeFilter.value !== 'all' && i.change !== changeFilter.value) return false;
    return true;
  });
});

const downloadCurrentSnapshot = () => {
  const snap = createDatasetSnapshot(explorer.dataset);
  downloadTextFile(
    `vbot-flow-snapshot-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(snap, null, 2) + '\n',
    'application/json;charset=utf-8',
  );
  pushToast('Đã tải file Snapshot dataset hiện tại (.json)', 'success');
};

const handleImportSnapshot = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = parseDatasetSnapshotJson(text);
    if (!parsed.ok) {
      pushToast(parsed.error, 'error');
      return;
    }
    baseDataset.value = parsed.dataset;
    baseLabel.value = parsed.label;
    pushToast(`Đã nạp snapshot "${parsed.label}" để đối chiếu`, 'success');
  } catch {
    pushToast('Không thể đọc file snapshot (.json)', 'error');
  }
};

const loadGitSnapshot = async (refArg?: string) => {
  const refToUse = (refArg ?? selectedGitRef.value).trim();
  if (!refToUse) return;
  loadingGitSnap.value = true;
  try {
    const resp = await fetch('/__vbot-dev/git/dataset-snapshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'snapshot', gitRef: refToUse }),
    });
    const data = (await resp.json()) as {
      ok?: boolean;
      ref?: string;
      commitDate?: string;
      dataset?: MergedFlowDataset;
      error?: string;
    };
    if (!resp.ok || !data.ok || !data.dataset) {
      pushToast(data.error ?? 'Không đọc được snapshot từ git ref này', 'error');
      return;
    }
    baseDataset.value = data.dataset;
    baseLabel.value = `${data.ref}${data.commitDate ? ` (${data.commitDate})` : ''}`;
    pushToast(`Đã tải dữ liệu tại commit ${baseLabel.value}`, 'success');
  } catch (err) {
    pushToast(err instanceof Error ? err.message : 'Lỗi kết nối git snapshot', 'error');
  } finally {
    loadingGitSnap.value = false;
  }
};

const applyOverlayToCanvas = () => {
  if (!diffReport.value) return;
  const map: Record<string, 'added' | 'modified'> = {};
  for (const item of diffReport.value.items) {
    if (item.entityKind === 'node' && (item.change === 'added' || item.change === 'modified')) {
      map[item.id] = item.change;
    }
  }
  if (Object.keys(map).length === 0) {
    pushToast('Không có node mới/sửa nào để hiển thị trên sơ đồ.', 'info');
    return;
  }
  explorer.setAudienceMode('tech');
  explorer.setSnapshotDiffOverlay(map, baseLabel.value);
  emit('closeHub');
  pushToast(`Đã bật lớp phủ Diff (${Object.keys(map).length} node) lên sơ đồ`, 'success');
};

const copyChangelog = async () => {
  if (!diffReport.value) return;
  const md = exportSnapshotDiffChangelogMarkdown(diffReport.value);
  const ok = await copyTextToClipboard(md);
  if (ok) {
    copiedChangelog.value = true;
    pushToast('Đã copy Changelog Markdown', 'success');
    setTimeout(() => {
      copiedChangelog.value = false;
    }, 1500);
  }
};

const CHANGE_BADGE: Record<string, { label: string; cls: string }> = {
  added: {
    label: 'Mới thêm',
    cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300',
  },
  modified: {
    label: 'Đã sửa',
    cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
  },
  removed: {
    label: 'Đã xóa',
    cls: 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300',
  },
};
</script>

<template>
  <div class="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 text-xs">
    <input
      ref="fileInputRef"
      type="file"
      accept="application/json,.json"
      class="hidden"
      @change="handleImportSnapshot"
    />

    <div class="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/80">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">
            So sánh Phiên bản Luồng (Flow Snapshot Diff)
          </h3>
          <p class="mt-0.5 text-slate-500 dark:text-slate-400">
            Lưu snapshot dataset hoặc nạp file/commit git cũ để tô màu thay đổi lên sơ đồ và xuất Changelog cho BA / Dev / QA.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            @click="downloadCurrentSnapshot"
          >
            <Download class="h-3.5 w-3.5" />
            Lưu Snapshot hiện tại
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 font-bold text-white hover:bg-indigo-500 dark:bg-cyan-500 dark:text-slate-950"
            @click="fileInputRef?.click()"
          >
            <Upload class="h-3.5 w-3.5" />
            Nạp file Snapshot cũ (.json)
          </button>
        </div>
      </div>

      <div
        v-if="gitSnapshotAvailable"
        class="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800"
      >
        <span class="font-semibold text-slate-700 dark:text-slate-300">Hoặc chọn Commit Git cũ (local):</span>
        <select
          v-if="recentCommits.length > 0"
          v-model="selectedGitRef"
          class="max-w-md rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-[11px] dark:border-slate-700 dark:bg-slate-800"
        >
          <option v-for="c in recentCommits" :key="c.hash" :value="c.hash">
            {{ c.hash }} ({{ c.date }}) — {{ c.subject }}
          </option>
        </select>
        <input
          v-model="selectedGitRef"
          type="text"
          placeholder="HEAD~1"
          class="w-28 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-[11px] dark:border-slate-700 dark:bg-slate-900"
        />
        <button
          type="button"
          :disabled="loadingGitSnap"
          class="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 font-bold text-indigo-800 hover:bg-indigo-100 dark:border-cyan-500/35 dark:bg-cyan-500/15 dark:text-cyan-300"
          @click="loadGitSnapshot()"
        >
          <Loader2 v-if="loadingGitSnap" class="h-3.5 w-3.5 animate-spin" />
          <GitBranch v-else class="h-3.5 w-3.5" />
          So sánh với Commit này
        </button>
      </div>
    </div>

    <div
      v-if="!diffReport"
      class="rounded-xl border border-dashed border-slate-300 bg-white/80 p-10 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400"
    >
      Hãy nạp 1 file Snapshot (.json) hoặc chọn commit Git ở trên để xem chi tiết thay đổi.
    </div>

    <template v-else>
      <div class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/80">
        <div class="flex flex-wrap items-center gap-2">
          <span class="rounded-full bg-emerald-100 px-2.5 py-0.5 font-bold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
            +{{ diffReport.summary.nodesAdded }} Node mới
          </span>
          <span class="rounded-full bg-amber-100 px-2.5 py-0.5 font-bold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
            ~{{ diffReport.summary.nodesModified }} Node sửa
          </span>
          <span class="rounded-full bg-rose-100 px-2.5 py-0.5 font-bold text-rose-800 dark:bg-rose-500/20 dark:text-rose-300">
            -{{ diffReport.summary.nodesRemoved }} Node xóa
          </span>
          <span class="text-slate-500">
            Edges: +{{ diffReport.summary.edgesAdded }}/~{{ diffReport.summary.edgesModified }}/-{{ diffReport.summary.edgesRemoved }} ·
            Kịch bản: +{{ diffReport.summary.scenariosAdded }}/~{{ diffReport.summary.scenariosModified }}/-{{ diffReport.summary.scenariosRemoved }}
          </span>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white hover:bg-emerald-500"
            @click="applyOverlayToCanvas"
          >
            <Eye class="h-3.5 w-3.5" />
            Bật lớp phủ Diff lên Sơ đồ
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            @click="copyChangelog"
          >
            <Check v-if="copiedChangelog" class="h-3.5 w-3.5 text-emerald-500" />
            <Copy v-else class="h-3.5 w-3.5" />
            Copy Changelog (.md)
          </button>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <select v-model="kindFilter" class="rounded-lg border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-700 dark:bg-slate-900">
          <option value="all">Mọi thành phần</option>
          <option value="node">Node</option>
          <option value="edge">Edge</option>
          <option value="scenario">Kịch bản</option>
        </select>
        <select v-model="changeFilter" class="rounded-lg border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-700 dark:bg-slate-900">
          <option value="all">Mọi thay đổi</option>
          <option value="added">Mới thêm</option>
          <option value="modified">Đã sửa</option>
          <option value="removed">Đã xóa</option>
        </select>
      </div>

      <ul class="space-y-1.5">
        <li
          v-for="item in visibleItems"
          :key="`${item.entityKind}-${item.change}-${item.id}`"
          class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/75"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="rounded px-1.5 py-0.5 text-[10px] font-bold" :class="CHANGE_BADGE[item.change].cls">
                {{ CHANGE_BADGE[item.change].label }}
              </span>
              <span class="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {{ item.entityKind }}
              </span>
              <strong class="text-slate-900 dark:text-slate-100">{{ item.label }}</strong>
              <span class="font-mono text-[10px] text-slate-400">({{ item.id }})</span>
            </div>
            <span v-if="item.changedFields.length > 0" class="font-mono text-[10.5px] text-indigo-600 dark:text-cyan-300">
              {{ item.changedFields.join(', ') }}
            </span>
          </div>
        </li>
      </ul>
    </template>
  </div>
</template>
