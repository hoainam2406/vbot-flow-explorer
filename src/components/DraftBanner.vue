<script setup lang="ts">
import { ref } from 'vue';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FilePenLine,
  Loader2,
  Save,
  Trash2,
  Undo2,
} from 'lucide-vue-next';
import { summarizeDraftPatch, type DraftPatch } from '../core/datasetDraftStore';

const props = defineProps<{
  patches: DraftPatch[];
  localDevWritable: boolean;
  saving: boolean;
}>();

const emit = defineEmits<{
  undo: [];
  discardAll: [];
  saveLocal: [];
  downloadPatch: [];
  copyPatch: [];
}>();

const showList = ref(false);
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
        @click="showList = !showList"
      >
        Chi tiết
        <ChevronUp v-if="showList" class="h-3 w-3" />
        <ChevronDown v-else class="h-3 w-3" />
      </button>
    </div>

    <div class="flex flex-wrap items-center gap-1.5">
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
  </div>
</template>
