<script setup lang="ts">
import { defineAsyncComponent, onMounted, provide, ref, watch } from 'vue';
import { Minimize2 } from 'lucide-vue-next';
import dataset from 'virtual:flow-dataset';
import FlowCanvas from './components/FlowCanvas.vue';
import GuideGlossaryModal from './components/GuideGlossaryModal.vue';
import ScenarioFlowDialog from './components/ScenarioFlowDialog.vue';
import SearchModal from './components/SearchModal.vue';
import type { MiniAppBridgeLaunchContext } from './components/MiniAppBridgeModal.vue';
import ToastHost from './components/ToastHost.vue';
import TopBar from './components/TopBar.vue';
import DetailDrawer from './components/drawer/DetailDrawer.vue';
import { createFlowExplorerState, FLOW_EXPLORER_KEY } from './composables/useFlowExplorer';
import { computeDagreGraphLayout } from './composables/useGraphLayout';
import { useKeyboardNavigation } from './composables/useKeyboardNavigation';
import { useToast } from './composables/useToast';
import { exportFlowToPng, exportFlowToSvg, type DiagramExportOptions } from './core/diagramExport';
import { downloadTextFile, slugifyFilename } from './core/downloadHelper';
import {
  loadSavedExplorerPrefs,
  loadSavedLayoutDirection,
  resolveInitialExplorerState,
  saveExplorerPrefs,
  saveLayoutDirection,
} from './core/explorerPreferences';
import { getNodeDisplayLabel, isVisibleForMode, isVisibleForPlatform } from './core/graphEngine';
import { exportNodeOverviewMarkdown } from './core/publicMarkdownExport';

const ParityMatrixModal = __ENABLE_TECH_MODE__
  ? defineAsyncComponent(() => import('./components/ParityMatrixModal.vue'))
  : null;
const MiniAppBridgeModal = __ENABLE_TECH_MODE__
  ? defineAsyncComponent(() => import('./components/MiniAppBridgeModal.vue'))
  : null;

const explorer = createFlowExplorerState(dataset, __ENABLE_TECH_MODE__);
provide(FLOW_EXPLORER_KEY, explorer);

const { pushToast } = useToast();
const searchOpen = ref(false);
const parityOpen = ref(false);
const guideOpen = ref(false);
const miniAppModalOpen = ref(false);
const miniAppLaunchContext = ref<MiniAppBridgeLaunchContext | null>(null);
const hydrated = ref(false);

const openMiniAppBridge = (context?: MiniAppBridgeLaunchContext) => {
  if (!__ENABLE_TECH_MODE__) return;
  miniAppLaunchContext.value = context ?? null;
  miniAppModalOpen.value = true;
};

const buildPaletteDiagramOptions = (): { options: DiagramExportOptions; filenameBase: string } => {
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

  const activeScenario = explorer.activeScenario.value;
  return {
    filenameBase: focusLabel ? `vbot-${focusLabel}` : 'vbot-app-flow',
    options: {
      nodes: layout.nodes,
      edges: flow.edges,
      edgeRoutes: layout.edgeRoutes,
      title,
      subtitle,
      activeEdgeIds: activeScenario ? new Set(activeScenario.edgeIds) : undefined,
      dimInactive: Boolean(activeScenario),
      includeTechBadges,
      platformMode: explorer.platformMode.value,
      childCounts,
      expandedIds: explorer.expandedIds.value,
    },
  };
};

const handlePaletteExportPng = async () => {
  try {
    const { options, filenameBase } = buildPaletteDiagramOptions();
    await exportFlowToPng(options, filenameBase, 2);
    pushToast('Đã xuất sơ đồ PNG (2×)', 'success');
  } catch (err) {
    pushToast(err instanceof Error ? err.message : 'Không thể xuất ảnh PNG', 'error');
  }
};

const handlePaletteExportSvg = () => {
  const { options, filenameBase } = buildPaletteDiagramOptions();
  exportFlowToSvg(options, filenameBase);
  pushToast('Đã xuất sơ đồ SVG', 'success');
};

const handlePaletteExportMd = async () => {
  const targetNode =
    explorer.selectedNode.value ??
    (explorer.focusRootId.value ? explorer.findNode(explorer.focusRootId.value) : undefined) ??
    explorer.dataset.rootNode;

  let md: string;
  if (__ENABLE_TECH_MODE__ && explorer.audienceMode.value === 'tech') {
    const { exportNodeTechMarkdown } = await import('./core/techMarkdownExport');
    md = exportNodeTechMarkdown(targetNode, explorer.dataset, explorer.platformMode.value, {
      includeSubtree: true,
    });
  } else {
    md = exportNodeOverviewMarkdown(targetNode, explorer.dataset, { includeSubtree: true });
  }
  const exportTitle = getNodeDisplayLabel(targetNode, explorer.audienceMode.value);
  downloadTextFile(`${slugifyFilename(exportTitle)}.md`, md);
  pushToast('Đã tải tài liệu Markdown (.md)', 'success');
};

const applyInitialState = () => {
  const savedDir = loadSavedLayoutDirection();
  if (savedDir) {
    explorer.setLayoutDirection(savedDir);
  }

  const initial = resolveInitialExplorerState({
    allowTechMode: __ENABLE_TECH_MODE__,
    search: window.location.search,
    hash: window.location.hash,
    savedPrefs: __ENABLE_TECH_MODE__ ? loadSavedExplorerPrefs() : null,
  });

  if (__ENABLE_TECH_MODE__) {
    explorer.setAudienceMode(initial.audienceMode);
    explorer.setPlatformMode(initial.platformMode);
  }

  if (initial.focusNodeId) {
    const focusNode = explorer.findNode(initial.focusNodeId);
    if (
      focusNode &&
      isVisibleForMode(focusNode.audience, explorer.audienceMode.value) &&
      isVisibleForPlatform(
        focusNode.platforms,
        explorer.audienceMode.value,
        explorer.platformMode.value,
      )
    ) {
      explorer.setFocusRoot(initial.focusNodeId);
    }
  }

  if (initial.selectedNodeId) {
    const targetNode = explorer.findNode(initial.selectedNodeId);
    if (
      targetNode &&
      isVisibleForMode(targetNode.audience, explorer.audienceMode.value) &&
      isVisibleForPlatform(
        targetNode.platforms,
        explorer.audienceMode.value,
        explorer.platformMode.value,
      )
    ) {
      explorer.jumpToNode(initial.selectedNodeId, { recordHistory: false });
    }
  }

  hydrated.value = true;
};

const syncToUrl = () => {
  const params = new URLSearchParams();
  if (explorer.focusRootId.value) {
    params.set('focus', explorer.focusRootId.value);
  }
  if (explorer.selectedNodeId.value) {
    params.set('node', explorer.selectedNodeId.value);
  }
  if (__ENABLE_TECH_MODE__) {
    params.set('mode', explorer.audienceMode.value);
    if (explorer.audienceMode.value === 'tech') {
      params.set('platform', explorer.platformMode.value);
    }
  }
  const qs = params.toString();
  const base = window.location.pathname + window.location.search;
  const nextHash = qs ? `#/?${qs}` : '';
  const target = `${base}${nextHash}`;
  const current = window.location.pathname + window.location.search + window.location.hash;
  if (current !== target) {
    window.history.replaceState(null, '', target);
  }
};

useKeyboardNavigation({
  explorer,
  isAnyModalOpen: () =>
    searchOpen.value ||
    parityOpen.value ||
    guideOpen.value ||
    miniAppModalOpen.value ||
    explorer.scenarioDialogOpen.value,
  onToggleSearch: () => {
    searchOpen.value = !searchOpen.value;
  },
  onOpenGuide: () => {
    guideOpen.value = true;
  },
});

const exitZenMode = () => {
  explorer.setZenMode(false);
  pushToast('Đã thoát Zen Mode', 'info');
};

onMounted(() => {
  applyInitialState();
  syncToUrl();
});

watch(
  [
    () => explorer.focusRootId.value,
    () => explorer.selectedNodeId.value,
    () => explorer.audienceMode.value,
    () => explorer.platformMode.value,
  ],
  () => {
    if (!hydrated.value) return;
    syncToUrl();
    if (__ENABLE_TECH_MODE__) {
      saveExplorerPrefs({
        audienceMode: explorer.audienceMode.value,
        platformMode: explorer.platformMode.value,
      });
    }
  },
);

watch(
  () => explorer.layoutDirection.value,
  (dir) => {
    if (!hydrated.value) return;
    saveLayoutDirection(dir);
  },
);
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden bg-slate-50 dark:bg-[#090d16]">
    <TopBar
      v-if="!explorer.zenMode.value"
      @open-search="searchOpen = true"
      @open-parity="parityOpen = true"
      @open-guide="guideOpen = true"
      @open-miniapp-bridge="openMiniAppBridge()"
    />

    <div class="relative flex min-h-0 flex-1 overflow-hidden">
      <FlowCanvas
        class="min-w-0 flex-1"
        @open-guide="guideOpen = true"
        @open-parity="parityOpen = true"
      />

      <Transition name="vbot-drawer">
        <DetailDrawer
          v-if="explorer.selectedNode.value"
          @open-miniapp-bridge="openMiniAppBridge"
        />
      </Transition>

      <Transition name="vbot-toast">
        <button
          v-if="explorer.zenMode.value"
          type="button"
          class="absolute top-3 right-4 z-30 inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-lg backdrop-blur-md transition hover:bg-white dark:border-slate-700/80 dark:bg-slate-900/90 dark:text-slate-200 dark:hover:bg-slate-800"
          @click="exitZenMode"
        >
          <Minimize2 class="h-3.5 w-3.5 text-indigo-600 dark:text-cyan-400" />
          <span>Thoát trình chiếu</span>
          <kbd class="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.2 font-mono text-[10px] text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            Z / Esc
          </kbd>
        </button>
      </Transition>
    </div>

    <SearchModal
      v-model:open="searchOpen"
      @open-parity="parityOpen = true"
      @open-guide="guideOpen = true"
      @open-miniapp-bridge="openMiniAppBridge()"
      @export-png="handlePaletteExportPng"
      @export-svg="handlePaletteExportSvg"
      @export-md="handlePaletteExportMd"
    />
    <GuideGlossaryModal v-model:open="guideOpen" />
    <ScenarioFlowDialog />
    <component :is="ParityMatrixModal" v-if="ParityMatrixModal" v-model:open="parityOpen" />
    <component
      :is="MiniAppBridgeModal"
      v-if="MiniAppBridgeModal"
      v-model:open="miniAppModalOpen"
      :initial-context="miniAppLaunchContext"
    />
    <ToastHost />
  </div>
</template>
