<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue';
import { ChevronDown, Download, FileCode2, FileImage, FileText, Loader2 } from 'lucide-vue-next';
import { FLOW_EXPLORER_KEY } from '../composables/useFlowExplorer';
import { computeDagreGraphLayout } from '../composables/useGraphLayout';
import { exportFlowToPng, exportFlowToSvg, type DiagramExportOptions } from '../core/diagramExport';
import { downloadTextFile, slugifyFilename } from '../core/downloadHelper';
import { exportNodeOverviewMarkdown } from '../core/publicMarkdownExport';

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

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
    direction: 'LR',
    showCanvasMedia: false,
  });

  const focusNode = explorer.focusRootId.value
    ? explorer.findNode(explorer.focusRootId.value)
    : undefined;
  const title = focusNode ? focusNode.label : explorer.dataset.app.name;

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
    filenameBase: focusNode ? `vbot-${focusNode.label}` : 'vbot-app-flow',
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
};

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

  downloadTextFile(`${slugifyFilename(targetNode.label)}.md`, md);
  menuOpen.value = false;
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
      class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
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
      class="absolute right-0 z-40 mt-1.5 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
    >
      <button
        type="button"
        role="menuitem"
        :disabled="exportingPng"
        class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
        @click="handleExportPng"
      >
        <Loader2 v-if="exportingPng" class="h-4 w-4 shrink-0 animate-spin text-indigo-600" />
        <FileImage v-else class="h-4 w-4 shrink-0 text-indigo-600" />
        <div>
          <div class="font-semibold text-slate-900">Tải sơ đồ PNG (2×)</div>
          <div class="text-[10px] text-slate-500">Ảnh sắc nét nền sáng theo góc nhìn hiện tại</div>
        </div>
      </button>

      <button
        type="button"
        role="menuitem"
        class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-100"
        @click="handleExportSvg"
      >
        <FileCode2 class="h-4 w-4 shrink-0 text-emerald-600" />
        <div>
          <div class="font-semibold text-slate-900">Tải sơ đồ SVG (Vector)</div>
          <div class="text-[10px] text-slate-500">Phóng to vô hạn cho slide / Figma</div>
        </div>
      </button>

      <div class="my-1 border-t border-slate-100" />

      <button
        type="button"
        role="menuitem"
        class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-100"
        @click="handleExportMarkdown"
      >
        <FileText class="h-4 w-4 shrink-0 text-amber-600" />
        <div>
          <div class="font-semibold text-slate-900">Tải tài liệu Markdown (.md)</div>
          <div class="text-[10px] text-slate-500">Xuất node đang chọn hoặc nhánh đang xem</div>
        </div>
      </button>

      <p
        v-if="exportError"
        class="mt-1 rounded-md bg-rose-50 px-2.5 py-1.5 text-[11px] font-medium text-rose-700"
      >
        {{ exportError }}
      </p>
    </div>
  </div>
</template>
