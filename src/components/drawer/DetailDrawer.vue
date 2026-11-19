<script setup lang="ts">
import { computed, defineAsyncComponent, inject, onBeforeUnmount, ref } from 'vue';
import { Check, Download, FileText, Focus, GitBranch, Link2, RotateCcw, X } from 'lucide-vue-next';
import { FLOW_EXPLORER_KEY } from '../../composables/useFlowExplorer';
import { copyTextToClipboard, downloadTextFile, slugifyFilename } from '../../core/downloadHelper';
import { isVisibleForMode, isVisibleForPlatform } from '../../core/graphEngine';
import { exportNodeOverviewMarkdown } from '../../core/publicMarkdownExport';
import type { NodeKind } from '../../data/schema';
import MediaGallery from './MediaGallery.vue';

const TechDetailPanel = __ENABLE_TECH_MODE__
  ? defineAsyncComponent(() => import('./TechDetailPanel.vue'))
  : null;

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const enableTechMode = __ENABLE_TECH_MODE__;

const KIND_BADGE_MAP: Record<NodeKind, { label: string; cls: string }> = {
  module: { label: 'Module', cls: 'bg-indigo-600 text-white' },
  miniapp: { label: 'Mini App', cls: 'bg-cyan-600 text-white' },
  action: { label: 'Thao tác', cls: 'bg-blue-600 text-white' },
  process: { label: 'Xử lý', cls: 'bg-violet-600 text-white' },
  decision: { label: 'Điều kiện', cls: 'bg-amber-500 text-white' },
  external: { label: 'Hệ thống', cls: 'bg-emerald-600 text-white' },
  error: { label: 'Lỗi / Retry', cls: 'bg-rose-600 text-white' },
};

const node = computed(() => explorer.selectedNode.value);
const kindMeta = computed(() => (node.value ? KIND_BADGE_MAP[node.value.kind] : null));
const isTechNode = computed(() => enableTechMode && node.value?.audience === 'tech');

const hasSubtree = computed(() =>
  node.value ? explorer.hasSubtree(node.value.id) : false,
);
const isExpanded = computed(() =>
  node.value ? explorer.expandedIds.value.has(node.value.id) : false,
);
const childCount = computed(() =>
  node.value && hasSubtree.value ? explorer.getChildCount(node.value.id) : 0,
);
const isFocusedHere = computed(
  () => Boolean(node.value) && explorer.focusRootId.value === node.value?.id,
);

const relatedNodes = computed(() => {
  const ids = node.value?.relatedNodeIds ?? [];
  const mode = explorer.audienceMode.value;
  const plat = explorer.platformMode.value;
  return ids
    .map((id) => explorer.findNode(id))
    .filter((target): target is NonNullable<typeof target> => Boolean(target))
    .filter(
      (target) =>
        isVisibleForMode(target.audience, mode) &&
        isVisibleForPlatform(target.platforms, mode, plat),
    );
});

const isCompareDrawer = computed(
  () =>
    __ENABLE_TECH_MODE__ &&
    explorer.audienceMode.value === 'tech' &&
    explorer.platformMode.value === 'compare',
);

const drawerWidthClass = computed(() =>
  isCompareDrawer.value
    ? 'sm:w-[540px] lg:w-[680px] xl:w-[740px]'
    : 'sm:w-[400px] lg:w-[440px]',
);

const copiedMd = ref(false);
let copyResetTimer: ReturnType<typeof setTimeout> | null = null;

const buildCurrentNodeMarkdown = async (): Promise<string> => {
  const current = node.value;
  if (!current) return '';
  if (__ENABLE_TECH_MODE__ && explorer.audienceMode.value === 'tech') {
    const { exportNodeTechMarkdown } = await import('../../core/techMarkdownExport');
    return exportNodeTechMarkdown(current, explorer.dataset, explorer.platformMode.value, {
      includeSubtree: true,
    });
  }
  return exportNodeOverviewMarkdown(current, explorer.dataset, { includeSubtree: true });
};

const handleCopyMd = async () => {
  const md = await buildCurrentNodeMarkdown();
  if (!md) return;
  const ok = await copyTextToClipboard(md);
  if (ok) {
    copiedMd.value = true;
    if (copyResetTimer) clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(() => {
      copiedMd.value = false;
    }, 2000);
  }
};

const handleDownloadMd = async () => {
  const current = node.value;
  if (!current) return;
  const md = await buildCurrentNodeMarkdown();
  if (!md) return;
  downloadTextFile(`${slugifyFilename(current.label)}.md`, md);
};

onBeforeUnmount(() => {
  if (copyResetTimer) clearTimeout(copyResetTimer);
});
</script>

<template>
  <aside
    v-if="node"
    class="z-10 flex h-full w-full shrink-0 flex-col border-l border-slate-200 bg-white shadow-xl transition-[width] duration-200"
    :class="drawerWidthClass"
  >
    <div class="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
      <div class="min-w-0">
        <div class="mb-1.5 flex flex-wrap items-center gap-1.5">
          <span
            v-if="kindMeta"
            class="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold"
            :class="kindMeta.cls"
          >
            {{ kindMeta.label }}
          </span>
          <span
            v-if="isTechNode"
            class="inline-flex items-center rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700"
          >
            Kỹ thuật
          </span>
        </div>
        <h2 class="text-base leading-snug font-bold text-slate-900">
          {{ node.label }}
        </h2>
      </div>

      <button
        type="button"
        aria-label="Đóng chi tiết"
        class="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        @click="explorer.selectedNodeId.value = null"
      >
        <X class="h-4 w-4" />
      </button>
    </div>

    <div class="flex-1 space-y-5 overflow-y-auto px-5 py-4">
      <div class="flex flex-wrap gap-2">
        <button
          v-if="hasSubtree && childCount > 0"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
          @click="explorer.toggleExpand(node.id)"
        >
          <GitBranch class="h-3.5 w-3.5" />
          {{ isExpanded ? 'Thu gọn nhánh con' : `Bung nhánh con (+${childCount})` }}
        </button>

        <button
          v-if="node.id !== explorer.dataset.rootNode.id && hasSubtree"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition"
          :class="
            isFocusedHere
              ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          "
          @click="explorer.setFocusRoot(isFocusedHere ? null : node.id)"
        >
          <RotateCcw v-if="isFocusedHere" class="h-3.5 w-3.5" />
          <Focus v-else class="h-3.5 w-3.5" />
          {{ isFocusedHere ? 'Xem toàn bộ app' : 'Tập trung nhánh này' }}
        </button>

        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          @click="handleCopyMd"
        >
          <Check v-if="copiedMd" class="h-3.5 w-3.5 text-emerald-600" />
          <FileText v-else class="h-3.5 w-3.5" />
          {{ copiedMd ? 'Đã copy MD' : 'Copy MD' }}
        </button>

        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          @click="handleDownloadMd"
        >
          <Download class="h-3.5 w-3.5" />
          Tải .md
        </button>
      </div>

      <MediaGallery
        :media="node.media"
        :audience-mode="explorer.audienceMode.value"
      />

      <section class="space-y-1.5">
        <h3 class="text-xs font-bold tracking-wide text-slate-500 uppercase">
          Mô tả tổng quan
        </h3>
        <p class="text-sm leading-relaxed text-slate-700">
          {{ node.summary.overview }}
        </p>
      </section>

      <component
        :is="TechDetailPanel"
        v-if="TechDetailPanel && explorer.audienceMode.value === 'tech'"
        :node="node"
        :platform-mode="explorer.platformMode.value"
      />

      <section v-if="relatedNodes.length > 0" class="space-y-2 border-t border-slate-100 pt-4">
        <h3 class="flex items-center gap-1.5 text-xs font-bold tracking-wide text-slate-500 uppercase">
          <Link2 class="h-3.5 w-3.5" />
          Liên kết chéo
        </h3>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="target in relatedNodes"
            :key="target.id"
            type="button"
            class="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
            @click="explorer.jumpToNode(target.id)"
          >
            {{ target.label }}
          </button>
        </div>
      </section>
    </div>
  </aside>
</template>
