<script setup lang="ts">
import { defineAsyncComponent, onMounted, provide, ref, watch } from 'vue';
import { Minimize2 } from 'lucide-vue-next';
import dataset from 'virtual:flow-dataset';
import FlowCanvas from './components/FlowCanvas.vue';
import GuideGlossaryModal from './components/GuideGlossaryModal.vue';
import ScenarioFlowDialog from './components/ScenarioFlowDialog.vue';
import SearchModal from './components/SearchModal.vue';
import type { ImpactLaunchContext } from './components/ImpactAnalysisModal.vue';
import type { MiniAppBridgeLaunchContext } from './components/MiniAppBridgeModal.vue';
import ToastHost from './components/ToastHost.vue';
import TopBar from './components/TopBar.vue';
import DetailDrawer from './components/drawer/DetailDrawer.vue';
import { createFlowExplorerState, FLOW_EXPLORER_KEY } from './composables/useFlowExplorer';
import { computeDagreGraphLayout } from './composables/useGraphLayout';
import { useKeyboardNavigation } from './composables/useKeyboardNavigation';
import { useToast } from './composables/useToast';
import { exportFlowToPng, exportFlowToSvg, type DiagramExportOptions } from './core/diagramExport';
import { copyTextToClipboard, downloadTextFile, slugifyFilename } from './core/downloadHelper';
import { exportFlowToMermaid } from './core/mermaidExport';
import {
  loadSavedExplorerPrefs,
  loadSavedLayoutDirection,
  resolveInitialExplorerState,
  saveExplorerPrefs,
  saveLayoutDirection,
} from './core/explorerPreferences';
import { getNodeDisplayLabel, isVisibleForMode, isVisibleForPlatform } from './core/graphEngine';
import { exportNodeOverviewMarkdown } from './core/publicMarkdownExport';
import type { DraftPatch } from './core/datasetDraftStore';
import type { FlowEdgeData, FlowNodeData, Scenario } from './data/schema';
import type { GovernanceHubTab } from './components/GovernanceHubModal.vue';

const ParityMatrixModal = __ENABLE_TECH_MODE__
  ? defineAsyncComponent(() => import('./components/ParityMatrixModal.vue'))
  : null;
const MiniAppBridgeModal = __ENABLE_TECH_MODE__
  ? defineAsyncComponent(() => import('./components/MiniAppBridgeModal.vue'))
  : null;
const DevSettingsModal = __ENABLE_TECH_MODE__
  ? defineAsyncComponent(() => import('./components/DevSettingsModal.vue'))
  : null;
const ImpactAnalysisModal = __ENABLE_TECH_MODE__
  ? defineAsyncComponent(() => import('./components/ImpactAnalysisModal.vue'))
  : null;
const DraftBanner = __ENABLE_TECH_MODE__
  ? defineAsyncComponent(() => import('./components/DraftBanner.vue'))
  : null;
const AddFlowElementModal = __ENABLE_TECH_MODE__
  ? defineAsyncComponent(() => import('./components/AddFlowElementModal.vue'))
  : null;
const GovernanceHubModal = __ENABLE_TECH_MODE__
  ? defineAsyncComponent(() => import('./components/GovernanceHubModal.vue'))
  : null;
const EdgeEditorPopover = __ENABLE_TECH_MODE__
  ? defineAsyncComponent(() => import('./components/EdgeEditorPopover.vue'))
  : null;
const ScenarioEditorModal = __ENABLE_TECH_MODE__
  ? defineAsyncComponent(() => import('./components/ScenarioEditorModal.vue'))
  : null;

const explorer = createFlowExplorerState(dataset, __ENABLE_TECH_MODE__);
provide(FLOW_EXPLORER_KEY, explorer);

const { pushToast } = useToast();
const searchOpen = ref(false);
const parityOpen = ref(false);
const guideOpen = ref(false);
const settingsOpen = ref(false);
const impactOpen = ref(false);
const impactLaunchContext = ref<ImpactLaunchContext | null>(null);
const miniAppModalOpen = ref(false);
const miniAppLaunchContext = ref<MiniAppBridgeLaunchContext | null>(null);
const draftPatches = ref<DraftPatch[]>([]);
const localDevWritable = ref(false);
const savingDraft = ref(false);
const addFlowOpen = ref(false);
const addFlowAnchor = ref<FlowNodeData | null>(null);
const governanceOpen = ref(false);
const governanceTab = ref<GovernanceHubTab>('qa');
const edgeEditorOpen = ref(false);
const editingEdge = ref<FlowEdgeData | null>(null);
const editingEdgeParentId = ref('');
const scenarioEditorOpen = ref(false);
const editingScenario = ref<Scenario | null>(null);
const editingScenarioParentId = ref<string | null>(null);
const scenarioRecordedIds = ref<string[] | null>(null);
const importPatchInputRef = ref<HTMLInputElement | null>(null);
const hydrated = ref(false);

const openMiniAppBridge = (context?: MiniAppBridgeLaunchContext) => {
  if (!__ENABLE_TECH_MODE__) return;
  parityOpen.value = false;
  governanceOpen.value = false;
  miniAppLaunchContext.value = context ?? null;
  miniAppModalOpen.value = true;
};

const openParity = () => {
  if (!__ENABLE_TECH_MODE__) return;
  miniAppModalOpen.value = false;
  governanceOpen.value = false;
  explorer.setAudienceMode('tech');
  parityOpen.value = true;
};

const openGovernance = (tab: GovernanceHubTab = 'qa') => {
  if (!__ENABLE_TECH_MODE__) return;
  miniAppModalOpen.value = false;
  parityOpen.value = false;
  explorer.setAudienceMode('tech');
  governanceTab.value = tab;
  governanceOpen.value = true;
};

const openSettings = () => {
  if (!__ENABLE_TECH_MODE__) return;
  settingsOpen.value = true;
};

const openImpact = (context?: ImpactLaunchContext) => {
  if (!__ENABLE_TECH_MODE__) return;
  impactLaunchContext.value = context ?? null;
  impactOpen.value = true;
};

const openAddFlow = (anchorNode: FlowNodeData) => {
  if (!__ENABLE_TECH_MODE__) return;
  addFlowAnchor.value = anchorNode;
  addFlowOpen.value = true;
};

const handleEditEdge = (edgeId: string) => {
  if (!__ENABLE_TECH_MODE__) return;
  const branchEdge = explorer.dataset.branchEdges.find((e) => e.id === edgeId);
  if (branchEdge) {
    editingEdgeParentId.value = explorer.dataset.rootNode.id;
    editingEdge.value = branchEdge;
    edgeEditorOpen.value = true;
    return;
  }
  for (const [parentId, sub] of Object.entries(explorer.dataset.subtreesByParentId)) {
    const found = sub.edges.find((e) => e.id === edgeId);
    if (found) {
      editingEdgeParentId.value = parentId;
      editingEdge.value = found;
      edgeEditorOpen.value = true;
      return;
    }
  }
  pushToast('Cạnh tự nối tắt hoặc cạnh mở nhánh không thể sửa trực tiếp.', 'info');
};

const handleSaveEdge = async (payload: {
  parentId: string;
  edgeId: string;
  edge: FlowEdgeData;
}) => {
  await handleApplyDraftPatch({
    id: `patch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    kind: 'update_edge',
    parentId: payload.parentId,
    edgeId: payload.edgeId,
    edge: payload.edge,
  });
};

const handleDeleteEdge = async (payload: { parentId: string; edgeId: string }) => {
  await handleApplyDraftPatch({
    id: `patch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    kind: 'delete_edge',
    parentId: payload.parentId,
    edgeId: payload.edgeId,
  });
};

const findScenarioOwnerParentId = (scenarioId: string): string | null => {
  for (const [parentId, sub] of Object.entries(explorer.dataset.subtreesByParentId)) {
    if (sub.scenarios?.some((s) => s.id === scenarioId)) return parentId;
  }
  return null;
};

const handleCreateScenario = () => {
  if (!__ENABLE_TECH_MODE__) return;
  editingScenario.value = null;
  const preferredParent =
    (explorer.focusRootId.value && explorer.dataset.subtreesByParentId[explorer.focusRootId.value]
      ? explorer.focusRootId.value
      : null) ??
    [...explorer.expandedIds.value].find((id) => Boolean(explorer.dataset.subtreesByParentId[id])) ??
    Object.keys(explorer.dataset.subtreesByParentId)[0] ??
    null;
  editingScenarioParentId.value = preferredParent;
  scenarioRecordedIds.value = null;
  scenarioEditorOpen.value = true;
};

const handleEditScenario = (sc: Scenario) => {
  if (!__ENABLE_TECH_MODE__) return;
  editingScenario.value = sc;
  editingScenarioParentId.value = findScenarioOwnerParentId(sc.id);
  scenarioRecordedIds.value = null;
  scenarioEditorOpen.value = true;
};

const handlePickScenarioOnCanvas = (payload: { parentId: string; nodeIds: string[] }) => {
  if (!__ENABLE_TECH_MODE__) return;
  editingScenarioParentId.value = payload.parentId;
  explorer.selectScenario(null);
  explorer.startScenarioRecording(payload.parentId, payload.nodeIds);
  pushToast('Click vào các node trên sơ đồ để thêm/bỏ bước kịch bản', 'info');
};

const handleFinishScenarioRecording = () => {
  if (!__ENABLE_TECH_MODE__) return;
  scenarioRecordedIds.value = [...explorer.scenarioRecordingNodeIds.value];
  explorer.stopScenarioRecording();
  scenarioEditorOpen.value = true;
};

const handleImportPatchFile = async (rawJson: string) => {
  if (!__ENABLE_TECH_MODE__) return;
  const { parseImportedPatchesJson } = await import('./core/datasetDraftStore');
  const parsed = parseImportedPatchesJson(rawJson);
  if (!parsed.ok) {
    pushToast(parsed.error, 'error');
    return;
  }
  const merged = [...draftPatches.value, ...parsed.patches];
  await syncDraftOverlay(merged, true);
  if (draftPatches.value.length === merged.length) {
    pushToast(`Đã nhập ${parsed.patches.length} thao tác từ Patch JSON`, 'success');
  }
};

const triggerImportPatchFromPalette = () => {
  if (!__ENABLE_TECH_MODE__) return;
  importPatchInputRef.value?.click();
};

const onPalettePatchFileSelected = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const text = await file.text();
  await handleImportPatchFile(text);
};

const syncDraftOverlay = async (patches: DraftPatch[], persist = true) => {
  if (!__ENABLE_TECH_MODE__) return;
  const { applyDraftPatchesToDataset, clearDraftPatches, saveDraftPatches } = await import(
    './core/datasetDraftStore'
  );
  if (patches.length === 0) {
    if (persist) clearDraftPatches();
    draftPatches.value = [];
    explorer.setDatasetOverride(null);
    return;
  }
  const result = applyDraftPatchesToDataset(explorer.baseDataset, patches);
  if (result.errors.length > 0) {
    pushToast(result.errors[0], 'error');
    return;
  }
  draftPatches.value = patches;
  if (persist) saveDraftPatches(patches);
  explorer.setDatasetOverride(result.dataset);
};

const handleApplyDraftPatch = async (patch: DraftPatch) => {
  if (!__ENABLE_TECH_MODE__) return;
  const next = [...draftPatches.value, patch];
  await syncDraftOverlay(next, true);
  if (draftPatches.value.length === next.length) {
    const { summarizeDraftPatch } = await import('./core/datasetDraftStore');
    pushToast(`Đã ghi nháp: ${summarizeDraftPatch(patch)}`, 'success');
  }
};

const handleUndoDraftPatch = async () => {
  if (!__ENABLE_TECH_MODE__ || draftPatches.value.length === 0) return;
  await syncDraftOverlay(draftPatches.value.slice(0, -1), true);
  pushToast('Đã hoàn tác thao tác nháp gần nhất', 'info');
};

const handleDiscardDraftPatches = async () => {
  if (!__ENABLE_TECH_MODE__) return;
  await syncDraftOverlay([], true);
  pushToast('Đã hủy toàn bộ thay đổi nháp', 'info');
};

const handleCopyDraftPatch = async () => {
  if (!__ENABLE_TECH_MODE__ || draftPatches.value.length === 0) return;
  const ok = await copyTextToClipboard(JSON.stringify({ patches: draftPatches.value }, null, 2));
  pushToast(
    ok ? 'Đã sao chép Patch JSON' : 'Không thể sao chép Patch JSON',
    ok ? 'success' : 'error',
  );
};

const handleDownloadDraftPatch = () => {
  if (!__ENABLE_TECH_MODE__ || draftPatches.value.length === 0) return;
  downloadTextFile(
    `vbot-flow-patches-${Date.now()}.json`,
    JSON.stringify({ patches: draftPatches.value }, null, 2),
  );
  pushToast('Đã tải file Patch JSON', 'success');
};

const handleSaveLocalDraft = async () => {
  if (!__ENABLE_TECH_MODE__ || !localDevWritable.value || draftPatches.value.length === 0) return;
  savingDraft.value = true;
  try {
    const resp = await fetch('/__vbot-dev/apply-patches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patches: draftPatches.value }),
    });
    const data = (await resp.json()) as {
      ok?: boolean;
      changedFiles?: string[];
      error?: string;
      errors?: string[];
    };
    if (!resp.ok || !data.ok) {
      pushToast(data.errors?.[0] ?? data.error ?? 'Lưu vào data/*.json thất bại', 'error');
      return;
    }
    await syncDraftOverlay([], true);
    const filesText = (data.changedFiles ?? []).join(', ') || 'data/*.json';
    pushToast(`Đã lưu vào ${filesText}`, 'success');
  } catch (err) {
    pushToast(
      err instanceof Error ? err.message : 'Không thể kết nối server local để lưu',
      'error',
    );
  } finally {
    savingDraft.value = false;
  }
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

const handlePaletteExportMermaid = async () => {
  const activeScenario = explorer.activeScenario.value;
  const mmd = exportFlowToMermaid(explorer.visibleFlow.value, {
    direction: explorer.layoutDirection.value,
    mode: explorer.audienceMode.value,
    activeEdgeIds: activeScenario ? new Set(activeScenario.edgeIds) : undefined,
  });
  const ok = await copyTextToClipboard(mmd);
  pushToast(
    ok ? 'Đã sao chép mã Mermaid vào clipboard' : 'Không thể sao chép vào clipboard',
    ok ? 'success' : 'error',
  );
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

    const hashQuery = window.location.hash.includes('?')
      ? window.location.hash.slice(window.location.hash.indexOf('?'))
      : '';
    const mergedParams = new URLSearchParams(hashQuery || window.location.search);
    const bridgeParam = mergedParams.get('bridge');
    const appParam = mergedParams.get('app');
    const validBridgeTabs = new Set<NonNullable<MiniAppBridgeLaunchContext['tab']>>([
      'sandbox',
      'simulator',
      'protocol',
      'catalog',
      'permissions',
      'parity',
    ]);
    const viewParam = mergedParams.get('view');
    if (bridgeParam && validBridgeTabs.has(bridgeParam as NonNullable<MiniAppBridgeLaunchContext['tab']>)) {
      explorer.setAudienceMode('tech');
      openMiniAppBridge({
        tab: bridgeParam as NonNullable<MiniAppBridgeLaunchContext['tab']>,
        miniAppId: appParam && appParam.startsWith('vb-ma-') ? appParam : undefined,
      });
    } else if (viewParam === 'parity') {
      openParity();
    } else if (viewParam === 'governance') {
      const gtab = mergedParams.get('gtab');
      const validGtab: GovernanceHubTab =
        gtab === 'health' || gtab === 'diff' || gtab === 'qa' ? gtab : 'qa';
      openGovernance(validGtab);
    }
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
      if (miniAppModalOpen.value && miniAppLaunchContext.value?.tab) {
        params.set('bridge', miniAppLaunchContext.value.tab);
        if (miniAppLaunchContext.value.miniAppId) {
          params.set('app', miniAppLaunchContext.value.miniAppId);
        }
      } else if (parityOpen.value) {
        params.set('view', 'parity');
      } else if (governanceOpen.value) {
        params.set('view', 'governance');
        params.set('gtab', governanceTab.value);
      }
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
    settingsOpen.value ||
    impactOpen.value ||
    addFlowOpen.value ||
    governanceOpen.value ||
    edgeEditorOpen.value ||
    scenarioEditorOpen.value ||
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

onMounted(async () => {
  if (__ENABLE_TECH_MODE__) {
    const { loadDraftPatches } = await import('./core/datasetDraftStore');
    const saved = loadDraftPatches();
    if (saved.length > 0) {
      await syncDraftOverlay(saved, false);
    }
    if (import.meta.env.DEV) {
      try {
        const resp = await fetch('/__vbot-dev/status');
        if (resp.ok) {
          const data = (await resp.json()) as { writable?: boolean };
          localDevWritable.value = Boolean(data.writable);
        }
      } catch {
        localDevWritable.value = false;
      }
    }
  }
  applyInitialState();
  syncToUrl();
});

watch(
  [
    () => explorer.focusRootId.value,
    () => explorer.selectedNodeId.value,
    () => explorer.audienceMode.value,
    () => explorer.platformMode.value,
    () => miniAppModalOpen.value,
    () => parityOpen.value,
    () => governanceOpen.value,
    () => governanceTab.value,
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
  () => explorer.audienceMode.value,
  (mode) => {
    if (mode !== 'tech') {
      if (miniAppModalOpen.value) miniAppModalOpen.value = false;
      if (parityOpen.value) parityOpen.value = false;
      if (governanceOpen.value) governanceOpen.value = false;
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
      :mini-app-studio-open="miniAppModalOpen"
      :parity-page-open="parityOpen"
      :governance-page-open="governanceOpen"
      @open-search="searchOpen = true"
      @open-parity="openParity()"
      @close-parity="parityOpen = false"
      @open-guide="guideOpen = true"
      @open-settings="openSettings()"
      @open-miniapp-bridge="openMiniAppBridge()"
      @close-miniapp-bridge="miniAppModalOpen = false"
      @open-governance="openGovernance()"
      @close-governance="governanceOpen = false"
    />

    <input
      v-if="GovernanceHubModal"
      ref="importPatchInputRef"
      type="file"
      accept="application/json,.json"
      class="hidden"
      @change="onPalettePatchFileSelected"
    />

    <component
      :is="DraftBanner"
      v-if="DraftBanner && draftPatches.length > 0 && !explorer.zenMode.value"
      :patches="draftPatches"
      :base-dataset="explorer.baseDataset"
      :current-dataset="explorer.dataset"
      :local-dev-writable="localDevWritable"
      :saving="savingDraft"
      @undo="handleUndoDraftPatch"
      @discard-all="handleDiscardDraftPatches"
      @save-local="handleSaveLocalDraft"
      @download-patch="handleDownloadDraftPatch"
      @copy-patch="handleCopyDraftPatch"
      @import-patch-file="handleImportPatchFile"
    />

    <div class="relative flex min-h-0 flex-1 overflow-hidden">
      <div v-show="!miniAppModalOpen && !parityOpen && !governanceOpen" class="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <FlowCanvas
          class="min-w-0 flex-1"
          @open-guide="guideOpen = true"
          @open-parity="openParity()"
          @edit-edge="handleEditEdge"
          @create-scenario="handleCreateScenario"
          @edit-scenario="handleEditScenario"
          @finish-scenario-recording="handleFinishScenarioRecording"
        />

        <Transition name="vbot-drawer">
          <DetailDrawer
            v-if="explorer.selectedNode.value"
            @open-miniapp-bridge="openMiniAppBridge"
            @open-settings="openSettings()"
            @open-impact="openImpact($event)"
            @apply-draft-patch="handleApplyDraftPatch"
            @open-add-flow="openAddFlow"
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

      <component
        :is="MiniAppBridgeModal"
        v-if="MiniAppBridgeModal && miniAppModalOpen"
        v-model:open="miniAppModalOpen"
        :initial-context="miniAppLaunchContext"
        class="min-h-0 min-w-0 flex-1"
      />
      <component
        :is="ParityMatrixModal"
        v-if="ParityMatrixModal && parityOpen"
        v-model:open="parityOpen"
        class="min-h-0 min-w-0 flex-1"
      />
      <component
        :is="GovernanceHubModal"
        v-if="GovernanceHubModal && governanceOpen"
        v-model:open="governanceOpen"
        :initial-tab="governanceTab"
        class="min-h-0 min-w-0 flex-1"
        @update:tab="governanceTab = $event"
      />
    </div>

    <SearchModal
      v-model:open="searchOpen"
      @open-parity="openParity()"
      @open-guide="guideOpen = true"
      @open-settings="openSettings()"
      @open-impact="openImpact()"
      @open-miniapp-bridge="openMiniAppBridge()"
      @open-governance="openGovernance($event)"
      @import-patch="triggerImportPatchFromPalette"
      @export-png="handlePaletteExportPng"
      @export-svg="handlePaletteExportSvg"
      @export-md="handlePaletteExportMd"
      @export-mermaid="handlePaletteExportMermaid"
    />
    <GuideGlossaryModal
      v-model:open="guideOpen"
      @open-mini-app-studio="openMiniAppBridge({ tab: 'sandbox' })"
    />
    <ScenarioFlowDialog />
    <component :is="DevSettingsModal" v-if="DevSettingsModal" v-model:open="settingsOpen" />
    <component
      :is="ImpactAnalysisModal"
      v-if="ImpactAnalysisModal"
      v-model:open="impactOpen"
      :initial-context="impactLaunchContext"
      @open-miniapp-bridge="openMiniAppBridge"
      @open-settings="openSettings()"
    />
    <component
      :is="AddFlowElementModal"
      v-if="AddFlowElementModal"
      v-model:open="addFlowOpen"
      :anchor-node="addFlowAnchor"
      @submit-patch="handleApplyDraftPatch"
    />
    <component
      :is="EdgeEditorPopover"
      v-if="EdgeEditorPopover"
      v-model:open="edgeEditorOpen"
      :edge="editingEdge"
      :parent-id="editingEdgeParentId"
      @save="handleSaveEdge"
      @delete-edge="handleDeleteEdge"
    />
    <component
      :is="ScenarioEditorModal"
      v-if="ScenarioEditorModal"
      v-model:open="scenarioEditorOpen"
      :initial-parent-id="editingScenarioParentId"
      :initial-scenario="editingScenario"
      :recorded-node-ids="scenarioRecordedIds"
      @submit-patch="handleApplyDraftPatch"
      @pick-on-canvas="handlePickScenarioOnCanvas"
    />
    <ToastHost />
  </div>
</template>
