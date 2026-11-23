<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FileDiff,
  FilePenLine,
  Loader2,
  Save,
  Trash2,
  Undo2,
  Upload,
} from 'lucide-vue-next';
import {
  buildDraftDiffSummary,
  summarizeDraftPatch,
  type DraftPatch,
} from '../core/datasetDraftStore';
import type { MergedFlowDataset } from '../data/schema';

const props = defineProps<{
  patches: DraftPatch[];
  baseDataset: MergedFlowDataset;
  currentDataset: MergedFlowDataset;
  localDevWritable: boolean;
  saving: boolean;
}>();

const emit = defineEmits<{
  undo: [];
  discardAll: [];
  saveLocal: [];
  downloadPatch: [];
  copyPatch: [];
  importPatchFile: [rawJson: string];
}>();

const showList = ref(false);
const showDiff = ref(false);
const importInputRef = ref<HTMLInputElement | null>(null);

const diffSummary = computed(() =>
  showDiff.value ? buildDraftDiffSummary(props.baseDataset, props.currentDataset) : null,
);

const onFileSelected = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const raw = await file.text();
    emit('importPatchFile', raw);
  } catch {
    // handled by parent toast
  }
};
</script>

<template>
  <div
    v-if="props.patches.length > 0"
    class="relative z-20 flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50/90 px-4 py-1.5 text-xs text-amber-950 dark:border-amber-500/35 dark:bg-amber-500/12 dark:text-amber-100"
  >
    <div class="flex items-center gap-2">
      <FilePenLine class="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-300" />
      <span>
        Đang xem <strong>{{ props.patches.length }} thay đổi nháp</strong> (lưu tạm trong trình duyệt)
      </span>
      <button
        type="button"
        class="inline-flex items-center gap-1 rounded border border-amber-300 bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-amber-900 hover:bg-white dark:border-amber-500/40 dark:bg-slate-900 dark:text-amber-200"
        @click="showList = !showList; showDiff = false"
      >
        Chi tiết
        <ChevronUp v-if="showList" class="h-3 w-3" />
        <ChevronDown v-else class="h-3 w-3" />
      </button>

      <button
        type="button"
        class="inline-flex items-center gap-1 rounded border border-indigo-300 bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-indigo-800 hover:bg-white dark:border-cyan-500/40 dark:bg-slate-900 dark:text-cyan-200"
        @click="showDiff = !showDiff; showList = false"
      >
        <FileDiff class="h-3 w-3" />
        Xem Diff
      </button>
    </div>

    <div class="flex flex-wrap items-center gap-1.5">
      <input
        ref="importInputRef"
        type="file"
        accept="application/json,.json"
        class="hidden"
        @change="onFileSelected"
      />
      <button
        type="button"
        class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        @click="importInputRef?.click()"
      >
        <Upload class="h-3 w-3" />
        Nhập Patch
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-slate-900 dark:text-amber-200"
        @click="emit('undo')"
      >
        <Undo2 class="h-3 w-3" />
        Hoàn tác
      </button>

      <button
        type="button"
        class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        @click="emit('copyPatch')"
      >
        <Copy class="h-3 w-3" />
        Copy Patch
      </button>

      <button
        type="button"
        class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        @click="emit('downloadPatch')"
      >
        <Download class="h-3 w-3" />
        Tải Patch (.json)
      </button>

      <button
        v-if="props.localDevWritable"
        type="button"
        :disabled="props.saving"
        class="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1 text-[11px] font-bold text-white shadow-xs hover:bg-emerald-500 disabled:opacity-60"
        @click="emit('saveLocal')"
      >
        <Loader2 v-if="props.saving" class="h-3 w-3 animate-spin" />
        <Save v-else class="h-3 w-3" />
        Lưu vào data/*.json
      </button>

      <button
        type="button"
        class="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-500/35 dark:bg-slate-900 dark:text-rose-300"
        @click="emit('discardAll')"
      >
        <Trash2 class="h-3 w-3" />
        Hủy nháp
      </button>
    </div>

    <div
      v-if="showList"
      class="mt-1.5 w-full rounded-xl border border-amber-200 bg-white/95 p-2.5 text-[11px] text-slate-700 dark:border-amber-500/30 dark:bg-slate-900/95 dark:text-slate-300"
    >
      <ul class="max-h-36 space-y-1 overflow-y-auto">
        <li v-for="(p, idx) in props.patches" :key="p.id" class="font-mono">
          {{ idx + 1 }}. {{ summarizeDraftPatch(p) }}
        </li>
      </ul>
    </div>

    <div
      v-if="showDiff && diffSummary"
      class="mt-1.5 w-full space-y-2 rounded-xl border border-indigo-200 bg-white/95 p-3 text-[11px] text-slate-700 dark:border-cyan-500/30 dark:bg-slate-900/95 dark:text-slate-300"
    >
      <div class="flex flex-wrap gap-2 font-semibold">
        <span class="rounded bg-emerald-100 px-2 py-0.5 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
          +{{ diffSummary.nodesAdded }} Node
        </span>
        <span class="rounded bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
          ~{{ diffSummary.nodesModified }} Sửa Node
        </span>
        <span class="rounded bg-rose-100 px-2 py-0.5 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300">
          -{{ diffSummary.nodesRemoved }} Xóa Node
        </span>
        <span class="rounded bg-slate-100 px-2 py-0.5 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          Cạnh: {{ diffSummary.edgesChanged }} · Kịch bản: {{ diffSummary.scenariosChanged }}
        </span>
      </div>
      <ul class="max-h-40 space-y-1 overflow-y-auto font-mono text-[10.5px]">
        <li v-for="item in diffSummary.items" :key="`${item.kind}-${item.change}-${item.id}`">
          [{{ item.change.toUpperCase() }} · {{ item.kind }}] {{ item.label }} ({{ item.id }})
          <span v-if="item.changedFields.length > 0" class="text-indigo-600 dark:text-cyan-300">
            → {{ item.changedFields.join(', ') }}
          </span>
        </li>
      </ul>
    </div>
  </div>
</template>
