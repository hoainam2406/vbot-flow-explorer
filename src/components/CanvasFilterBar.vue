<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import {
  AlertTriangle,
  Blocks,
  Filter,
  GitFork,
  ImageOff,
  Network,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-vue-next';
import { FLOW_EXPLORER_KEY } from '../composables/useFlowExplorer';
import type { NodeKind, NodeStatus } from '../data/schema';

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const expanded = ref(false);

const hasImpact = computed(() => Boolean(explorer.impactHighlight.value));
const hasSnapshotDiff = computed(() => Boolean(explorer.snapshotDiffOverlay.value));
const snapshotDiffCount = computed(() => {
  const overlay = explorer.snapshotDiffOverlay.value;
  if (!overlay) return 0;
  return explorer.visibleFlow.value.nodes.filter((n) => Boolean(overlay.nodeStatus[n.id])).length;
});
const hasLens = computed(() => explorer.hasActiveCanvasLens.value);
const matchedCount = computed(() => {
  if (explorer.impactHighlight.value) {
    return explorer.visibleFlow.value.nodes.filter((n) =>
      explorer.impactHighlight.value?.nodeIds.has(n.id),
    ).length;
  }
  return explorer.canvasLensMatchedIds.value?.size ?? 0;
});
const totalVisible = computed(() => explorer.visibleFlow.value.nodes.length);

const toggleKind = (kind: NodeKind) => {
  const cur = explorer.canvasLens.value.kinds;
  const next = cur.includes(kind) ? cur.filter((k) => k !== kind) : [...cur, kind];
  explorer.canvasLens.value = { ...explorer.canvasLens.value, kinds: next };
};

const toggleStatus = (status: NodeStatus) => {
  const cur = explorer.canvasLens.value.statuses;
  const next = cur.includes(status) ? cur.filter((s) => s !== status) : [...cur, status];
  explorer.canvasLens.value = { ...explorer.canvasLens.value, statuses: next };
};
</script>

<template>
  <div class="pointer-events-auto flex flex-col items-start gap-1.5">
    <div
      v-if="hasImpact && explorer.impactHighlight.value"
      class="inline-flex items-center gap-2 rounded-full border border-cyan-300 bg-cyan-50/95 px-3 py-1 text-xs font-semibold text-cyan-900 shadow-sm backdrop-blur-md dark:border-cyan-500/45 dark:bg-cyan-500/15 dark:text-cyan-200"
    >
      <Network class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
      <span>
        Impact: <strong>{{ explorer.impactHighlight.value.label }}</strong> ({{ matchedCount }} node đang hiển thị)
      </span>
      <button
        type="button"
        aria-label="Xóa tô sáng ảnh hưởng"
        class="rounded-full p-0.5 hover:bg-cyan-200/70 dark:hover:bg-cyan-500/30"
        @click="explorer.clearImpactHighlight()"
      >
        <X class="h-3.5 w-3.5" />
      </button>
    </div>

    <div
      v-if="hasSnapshotDiff && explorer.snapshotDiffOverlay.value"
      class="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50/95 px-3 py-1 text-xs font-semibold text-emerald-900 shadow-sm backdrop-blur-md dark:border-emerald-500/45 dark:bg-emerald-500/15 dark:text-emerald-200"
    >
      <Sparkles class="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
      <span>
        Diff: <strong>{{ explorer.snapshotDiffOverlay.value.label }}</strong> ({{ snapshotDiffCount }} node thay đổi đang hiển thị)
      </span>
      <button
        type="button"
        aria-label="Tắt lớp phủ Diff"
        class="rounded-full p-0.5 hover:bg-emerald-200/70 dark:hover:bg-emerald-500/30"
        @click="explorer.clearSnapshotDiffOverlay()"
      >
        <X class="h-3.5 w-3.5" />
      </button>
    </div>

    <div class="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-2xs backdrop-blur-md transition"
        :class="
          hasLens || expanded
            ? 'border-indigo-300 bg-indigo-50/95 text-indigo-800 dark:border-cyan-500/45 dark:bg-cyan-500/15 dark:text-cyan-200'
            : 'border-slate-200/90 bg-white/90 text-slate-600 hover:bg-white dark:border-slate-700/80 dark:bg-slate-900/90 dark:text-slate-300'
        "
        @click="expanded = !expanded"
      >
        <Filter class="h-3 w-3" />
        <span>Lọc Lens</span>
        <span
          v-if="hasLens"
          class="rounded-full bg-indigo-600 px-1.5 py-0.2 font-mono text-[10px] font-bold text-white dark:bg-cyan-400 dark:text-slate-950"
        >
          {{ matchedCount }}/{{ totalVisible }}
        </span>
      </button>

      <template v-if="expanded || hasLens">
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold backdrop-blur-md transition"
          :class="
            explorer.canvasLens.value.onlyParityDiff
              ? 'border-amber-400 bg-amber-100 text-amber-900 dark:border-amber-500/60 dark:bg-amber-500/20 dark:text-amber-200'
              : 'border-slate-200/90 bg-white/90 text-slate-600 hover:bg-white dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-300'
          "
          @click="
            explorer.canvasLens.value = {
              ...explorer.canvasLens.value,
              onlyParityDiff: !explorer.canvasLens.value.onlyParityDiff,
            }
          "
        >
          iOS ≠ Android
        </button>

        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold backdrop-blur-md transition"
          :class="
            explorer.canvasLens.value.onlyMiniAppBridge
              ? 'border-cyan-400 bg-cyan-100 text-cyan-900 dark:border-cyan-500/60 dark:bg-cyan-500/20 dark:text-cyan-200'
              : 'border-slate-200/90 bg-white/90 text-slate-600 hover:bg-white dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-300'
          "
          @click="
            explorer.canvasLens.value = {
              ...explorer.canvasLens.value,
              onlyMiniAppBridge: !explorer.canvasLens.value.onlyMiniAppBridge,
            }
          "
        >
          <Blocks class="h-3 w-3" />
          Mini App Bridge
        </button>

        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold backdrop-blur-md transition"
          :class="
            explorer.canvasLens.value.kinds.includes('error')
              ? 'border-rose-400 bg-rose-100 text-rose-900 dark:border-rose-500/60 dark:bg-rose-500/20 dark:text-rose-200'
              : 'border-slate-200/90 bg-white/90 text-slate-600 hover:bg-white dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-300'
          "
          @click="toggleKind('error')"
        >
          <AlertTriangle class="h-3 w-3" />
          Lỗi / Retry
        </button>

        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold backdrop-blur-md transition"
          :class="
            explorer.canvasLens.value.kinds.includes('decision')
              ? 'border-amber-400 bg-amber-100 text-amber-900 dark:border-amber-500/60 dark:bg-amber-500/20 dark:text-amber-200'
              : 'border-slate-200/90 bg-white/90 text-slate-600 hover:bg-white dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-300'
          "
          @click="toggleKind('decision')"
        >
          <GitFork class="h-3 w-3" />
          Điều kiện
        </button>

        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold backdrop-blur-md transition"
          :class="
            explorer.canvasLens.value.onlyMissingMedia
              ? 'border-violet-400 bg-violet-100 text-violet-900 dark:border-violet-500/60 dark:bg-violet-500/20 dark:text-violet-200'
              : 'border-slate-200/90 bg-white/90 text-slate-600 hover:bg-white dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-300'
          "
          @click="
            explorer.canvasLens.value = {
              ...explorer.canvasLens.value,
              onlyMissingMedia: !explorer.canvasLens.value.onlyMissingMedia,
            }
          "
        >
          <ImageOff class="h-3 w-3" />
          Thiếu Media
        </button>

        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold backdrop-blur-md transition"
          :class="
            explorer.canvasLens.value.statuses.includes('wip') ||
            explorer.canvasLens.value.statuses.includes('needs_review')
              ? 'border-sky-400 bg-sky-100 text-sky-900 dark:border-sky-500/60 dark:bg-sky-500/20 dark:text-sky-200'
              : 'border-slate-200/90 bg-white/90 text-slate-600 hover:bg-white dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-300'
          "
          @click="
            toggleStatus('wip');
            toggleStatus('needs_review');
          "
        >
          <Sparkles class="h-3 w-3" />
          WIP / Review
        </button>

        <button
          v-if="hasLens"
          type="button"
          class="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          @click="explorer.resetCanvasLens()"
        >
          <RotateCcw class="h-3 w-3" />
          Xóa lọc
        </button>
      </template>
    </div>
  </div>
</template>
