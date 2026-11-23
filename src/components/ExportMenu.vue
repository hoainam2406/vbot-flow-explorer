<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue';
import { ChevronDown, Copy, Download, FileCode2, FileImage, FileText, GitFork, Loader2 } from 'lucide-vue-next';
import { FLOW_EXPLORER_KEY } from '../composables/useFlowExplorer';
import { useToast } from '../composables/useToast';
import { computeDagreGraphLayout } from '../composables/useGraphLayout';
import { exportFlowToPng, exportFlowToSvg, type DiagramExportOptions } from '../core/diagramExport';
import { copyTextToClipboard, downloadTextFile, slugifyFilename } from '../core/downloadHelper';
import { getNodeDisplayLabel } from '../core/graphEngine';
import { exportFlowToMermaid } from '../core/mermaidExport';
import { exportNodeOverviewMarkdown } from '../core/publicMarkdownExport';

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const { pushToast } = useToast();
const menuOpen = ref(false);
const exportingPng = ref(false);
const exportError = ref<string | null>(null);
const rootEl = ref<HTMLElement | null>(null);
let errorTimer: ReturnType<typeof setTimeout> | null = null;

const activeScenario = computed(() => {
  const scId = explorer.activeScenarioId.value;
  if (!scId) return null;
  return explorer.visibleFlow.value.activeScenarios.find((s) => s.id === scId) ?? null;
});

const buildDiagramOptions = (): { options: DiagramExportOptions; filenameBase: string } => {
  const flow = explorer.visibleFlow.value;
  const layout = computeDagreGraphLayout(flow.nodes, flow.edges, {
    direction: explorer.layoutDirection.value,
    showCanvasMedia: false,
  });

  const focusNode = explorer.focusRootId.value
    ? explorer.findNode(explorer.focusRootId.value)
    : undefined;
  const focusLabel = focusNode
    ? getNodeDisplayLabel(focusNode, explorer.audienceMode.value)
    : undefined;
  const title = focusLabel ?? explorer.dataset.app.name;

  let subtitle = focusNode ? explorer.dataset.app.name : explorer.dataset.app.tagline;
  const includeTechBadges = __ENABLE_TECH_MODE__ && explorer.audienceMode.value === 'tech';
  if (includeTechBadges) {
    const platText =
      explorer.platformMode.value === 'compare'
        ? 'So sánh iOS vs Android'
        : explorer.platformMode.value === 'ios'
          ? 'iOS'
          : 'Android';
    subtitle = `${subtitle} · Kỹ thuật (${platText})`;
  }

  const childCounts: Record<string, number> = {};
  for (const node of flow.nodes) {
    if (explorer.hasSubtree(node.id)) {
      const cnt = explorer.getChildCount(node.id);
      if (cnt > 0) childCounts[node.id] = cnt;
    }
  }

  const activeEdgeIds = activeScenario.value
    ? new Set(activeScenario.value.edgeIds)
    : undefined;

  return {
    filenameBase: focusLabel ? `vbot-${focusLabel}` : 'vbot-app-flow',
    options: {
      nodes: layout.nodes,
      edges: flow.edges,
      edgeRoutes: layout.edgeRoutes,
      title,
      subtitle,
      activeEdgeIds,
      dimInactive: Boolean(activeScenario.value),
      includeTechBadges,
      platformMode: explorer.platformMode.value,
      childCounts,
      expandedIds: explorer.expandedIds.value,
    },
  };
};

const showError = (msg: string) => {
  exportError.value = msg;
  if (errorTimer) clearTimeout(errorTimer);
  errorTimer = setTimeout(() => {
    exportError.value = null;
  }, 3000);
};

const handleExportPng = async () => {
  if (exportingPng.value) return;
  exportingPng.value = true;
  exportError.value = null;
  try {
    const { options, filenameBase } = buildDiagramOptions();
    await exportFlowToPng(options, filenameBase, 2);
    menuOpen.value = false;
    pushToast('Đã xuất sơ đồ PNG (2×)', 'success');
  } catch (err) {
    showError(err instanceof Error ? err.message : 'Không thể xuất ảnh PNG');
  } finally {
    exportingPng.value = false;
  }
};

const handleExportSvg = () => {
  const { options, filenameBase } = buildDiagramOptions();
  exportFlowToSvg(options, filenameBase);
  menuOpen.value = false;
  pushToast('Đã xuất sơ đồ SVG', 'success');
};

const isTechExport = computed(
  () => __ENABLE_TECH_MODE__ && explorer.audienceMode.value === 'tech',
);

const handleExportMarkdown = async () => {
  const targetNode =
    explorer.selectedNode.value ??
    (explorer.focusRootId.value ? explorer.findNode(explorer.focusRootId.value) : undefined) ??
    explorer.dataset.rootNode;

  let md: string;
  if (__ENABLE_TECH_MODE__ && explorer.audienceMode.value === 'tech') {
    const { exportNodeTechMarkdown } = await import('../core/techMarkdownExport');
    md = exportNodeTechMarkdown(targetNode, explorer.dataset, explorer.platformMode.value, {
      includeSubtree: true,
    });
  } else {
    md = exportNodeOverviewMarkdown(targetNode, explorer.dataset, { includeSubtree: true });
  }

  const exportTitle = getNodeDisplayLabel(targetNode, explorer.audienceMode.value);
  downloadTextFile(`${slugifyFilename(exportTitle)}.md`, md);
  menuOpen.value = false;
  pushToast('Đã tải tài liệu Markdown (.md)', 'success');
};

const buildMermaidText = (): { mmd: string; filenameBase: string } => {
  const { filenameBase } = buildDiagramOptions();
  const activeEdgeIds = activeScenario.value
    ? new Set(activeScenario.value.edgeIds)
    : undefined;
  const mmd = exportFlowToMermaid(explorer.visibleFlow.value, {
    direction: explorer.layoutDirection.value,
    mode: explorer.audienceMode.value,
    activeEdgeIds,
  });
  return { mmd, filenameBase };
};

const handleCopyMermaid = async () => {
  const { mmd } = buildMermaidText();
  const ok = await copyTextToClipboard(mmd);
  menuOpen.value = false;
  if (ok) {
    pushToast('Đã sao chép mã Mermaid vào clipboard', 'success');
  } else {
    pushToast('Không thể sao chép vào clipboard', 'error');
  }
};

const handleDownloadMermaid = () => {
  const { mmd, filenameBase } = buildMermaidText();
  downloadTextFile(`${slugifyFilename(filenameBase)}.mmd`, mmd, 'text/plain;charset=utf-8');
  menuOpen.value = false;
  pushToast('Đã tải file Mermaid (.mmd)', 'success');
};

const onDocumentClick = (event: MouseEvent) => {
  if (!menuOpen.value) return;
  const target = event.target as Node | null;
  if (rootEl.value && target && !rootEl.value.contains(target)) {
    menuOpen.value = false;
  }
};

const onDocumentKeyDown = (event: KeyboardEvent) => {
  if (menuOpen.value && event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    menuOpen.value = false;
  }
};

onMounted(() => {
  document.addEventListener('click', onDocumentClick);
  window.addEventListener('keydown', onDocumentKeyDown);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick);
  window.removeEventListener('keydown', onDocumentKeyDown);
  if (errorTimer) clearTimeout(errorTimer);
});
</script>

<template>
  <div ref="rootEl" class="relative">
    <button
      type="button"
      :aria-expanded="menuOpen"
      aria-haspopup="menu"
      class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700/80 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800"
      title="Xuất sơ đồ hoặc tài liệu Markdown"
      @click="menuOpen = !menuOpen"
    >
      <Download class="h-3.5 w-3.5" />
      <span class="hidden sm:inline">Xuất</span>
      <ChevronDown class="h-3 w-3 text-slate-400" />
    </button>

    <div
      v-if="menuOpen"
      role="menu"
      class="absolute right-0 z-40 mt-1.5 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white/95 p-1.5 shadow-xl backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-900/95"
    >
      <button
        type="button"
        role="menuitem"
        :disabled="exportingPng"
        class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60 dark:text-slate-200 dark:hover:bg-slate-800"
        @click="handleExportPng"
      >
        <Loader2 v-if="exportingPng" class="h-4 w-4 shrink-0 animate-spin text-indigo-600 dark:text-cyan-400" />
        <FileImage v-else class="h-4 w-4 shrink-0 text-indigo-600 dark:text-cyan-400" />
        <div>
          <div class="font-semibold text-slate-900 dark:text-slate-100">Tải sơ đồ PNG (2×)</div>
          <div class="text-[10px] text-slate-500 dark:text-slate-400">Ảnh sắc nét nền sáng theo góc nhìn hiện tại</div>
        </div>
      </button>

      <button
        type="button"
        role="menuitem"
        class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
        @click="handleExportSvg"
      >
        <FileCode2 class="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div>
          <div class="font-semibold text-slate-900 dark:text-slate-100">Tải sơ đồ SVG (Vector)</div>
          <div class="text-[10px] text-slate-500 dark:text-slate-400">Phóng to vô hạn cho slide / Figma</div>
        </div>
      </button>

      <div class="my-1 border-t border-slate-100 dark:border-slate-800" />

      <button
        type="button"
        role="menuitem"
        class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
        @click="handleExportMarkdown"
      >
        <FileText class="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div>
          <div class="font-semibold text-slate-900 dark:text-slate-100">
            {{ isTechExport ? 'Tải tài liệu Markdown (.md)' : 'Tải tài liệu hướng dẫn (.md)' }}
          </div>
          <div class="text-[10px] text-slate-500 dark:text-slate-400">
            {{ isTechExport ? 'Xuất node đang chọn hoặc nhánh đang xem' : 'Xuất mục đang chọn hoặc nhánh đang xem' }}
          </div>
        </div>
      </button>

      <div class="my-1 border-t border-slate-100 dark:border-slate-800" />

      <button
        type="button"
        role="menuitem"
        class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
        @click="handleCopyMermaid"
      >
        <Copy class="h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-400" />
        <div>
          <div class="font-semibold text-slate-900 dark:text-slate-100">Copy mã Mermaid</div>
          <div class="text-[10px] text-slate-500 dark:text-slate-400">Dán vào GitLab / GitHub / Notion</div>
        </div>
      </button>

      <button
        type="button"
        role="menuitem"
        class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
        @click="handleDownloadMermaid"
      >
        <GitFork class="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
        <div>
          <div class="font-semibold text-slate-900 dark:text-slate-100">Tải file Mermaid (.mmd)</div>
          <div class="text-[10px] text-slate-500 dark:text-slate-400">Sơ đồ luồng văn bản theo khung nhìn</div>
        </div>
      </button>

      <p
        v-if="exportError"
        class="mt-1 rounded-md bg-rose-50 px-2.5 py-1.5 text-[11px] font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
      >
        {{ exportError }}
      </p>
    </div>
  </div>
</template>
