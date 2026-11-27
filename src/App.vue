<script setup lang="ts">
import { defineAsyncComponent, onMounted, provide, ref, watch } from 'vue';
import { Minimize2 } from 'lucide-vue-next';
import dataset from 'virtual:flow-dataset';
import {
  branches as availableBranches,
  defaultBranchId,
  loadBranchDataset,
} from 'virtual:flow-branches';
import FlowCanvas from './components/FlowCanvas.vue';
import AppWalkthroughOverlay from './components/AppWalkthroughOverlay.vue';
import GuideGlossaryModal from './components/GuideGlossaryModal.vue';
import ScenarioFlowDialog from './components/ScenarioFlowDialog.vue';
import SearchModal from './components/SearchModal.vue';
import type { ImpactLaunchContext } from './components/ImpactAnalysisModal.vue';
import type { MiniAppBridgeLaunchContext } from './components/MiniAppBridgeModal.vue';
import type {
  LocalGitStatusResult,
  SourcePeekLaunchContext,
} from './core/sourcePeekClient';
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
  resolveInitialBranchId,
  resolveInitialExplorerState,
  saveExplorerPrefs,
  saveLayoutDirection,
} from './core/explorerPreferences';
import { getNodeDisplayLabel, isVisibleForMode, isVisibleForPlatform } from './core/graphEngine';
import { exportNodeOverviewMarkdown } from './core/publicMarkdownExport';
import type { DraftPatch } from './core/datasetDraftStore';
import {
  loadAppTourCompleted,
  resolveTourStepsForTrack,
  saveAppTourCompleted,
  type AppTourStep,
  type AppTourTrack,
  type GuideQuickAction,
} from './core/appTourEngine';
import { PUBLIC_TOUR_STEPS } from './data/publicGuideData';
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
const SourcePeekModal = __ENABLE_TECH_MODE__
  ? defineAsyncComponent(() => import('./components/SourcePeekModal.vue'))
  : null;

const explorer = createFlowExplorerState(dataset, __ENABLE_TECH_MODE__);
provide(FLOW_EXPLORER_KEY, explorer);

const { pushToast } = useToast();
const searchOpen = ref(false);
const parityOpen = ref(false);
const guideOpen = ref(false);
const tourOpen = ref(false);
const tourSteps = ref<AppTourStep[]>(PUBLIC_TOUR_STEPS);
const tourStepIndex = ref(0);
const tourTrack = ref<AppTourTrack>('overview');
const tourCompleted = ref(loadAppTourCompleted());
const settingsOpen = ref(false);
const settingsInitialTab = ref<'paths' | 'media' | 'backup'>('paths');
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
const governanceTab = ref<GovernanceHubTab>('dashboard');
const sourcePeekOpen = ref(false);
const sourcePeekContext = ref<SourcePeekLaunchContext | null>(null);
const localGitStatus = ref<LocalGitStatusResult | null>(null);
const edgeEditorOpen = ref(false);
const editingEdge = ref<FlowEdgeData | null>(null);
const editingEdgeParentId = ref('');
const scenarioEditorOpen = ref(false);
const editingScenario = ref<Scenario | null>(null);
const editingScenarioParentId = ref<string | null>(null);
const scenarioRecordedIds = ref<string[] | null>(null);
const importPatchInputRef = ref<HTMLInputElement | null>(null);
const branchLoading = ref(false);
let branchSwitchSeq = 0;
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

const openGovernance = (tab: GovernanceHubTab = 'dashboard') => {
  if (!__ENABLE_TECH_MODE__) return;
  miniAppModalOpen.value = false;
  parityOpen.value = false;
  explorer.setAudienceMode('tech');
  governanceTab.value = tab;
  governanceOpen.value = true;
};

const openSourcePeek = (context?: SourcePeekLaunchContext) => {
  if (!__ENABLE_TECH_MODE__) return;
  sourcePeekContext.value = context ?? null;
  sourcePeekOpen.value = true;
};

const refreshLocalGitStatus = async () => {
  if (!__ENABLE_TECH_MODE__ || !import.meta.env.DEV) return;
  const { fetchLocalGitStatus } = await import('./core/sourcePeekClient');
  const res = await fetchLocalGitStatus();
  localGitStatus.value = res.ok ? res.data : null;
};

const handleCompareBranch = async (targetBranchId: string) => {
  if (!__ENABLE_TECH_MODE__) return;
  try {
    const [{ diffDatasets }, baseDs] = await Promise.all([
      import('./core/flowSnapshotDiff'),
      loadBranchDataset(targetBranchId),
    ]);
    const report = diffDatasets(baseDs, explorer.dataset, {
      baseLabel: `Nhánh ${targetBranchId}`,
      currentLabel: `Nhánh ${explorer.activeBranchId.value}`,
    });
    const statusMap: Record<string, 'added' | 'modified'> = {};
    for (const item of report.items) {
      if (item.entityKind === 'node' && (item.change === 'added' || item.change === 'modified')) {
        statusMap[item.id] = item.change;
      }
    }
    if (Object.keys(statusMap).length === 0) {
      pushToast(`Không có khác biệt node nào so với nhánh ${targetBranchId}`, 'info');
      return;
    }
    explorer.setAudienceMode('tech');
    explorer.setSnapshotDiffOverlay(statusMap, `${targetBranchId} ↔ ${explorer.activeBranchId.value}`);
    pushToast(
      `Đã bật Diff ${targetBranchId} ↔ ${explorer.activeBranchId.value} (${Object.keys(statusMap).length} node)`,
      'success',
    );
  } catch (err) {
    pushToast(
      err instanceof Error ? err.message : `Không thể so sánh với nhánh ${targetBranchId}`,
      'error',
    );
  }
};

const handleHighlightGitDirty = async () => {
  if (!__ENABLE_TECH_MODE__) return;
  await refreshLocalGitStatus();
  const dirtyFiles = [
    ...(localGitStatus.value?.ios?.changedFiles ?? []),
    ...(localGitStatus.value?.android?.changedFiles ?? []),
  ];
  if (dirtyFiles.length === 0) {
    pushToast('Repo local hiện sạch (không có file đang sửa)', 'info');
    return;
  }
  const [
    { buildImpactIndex },
    { analyzePrImpact },
    { MINI_APP_CATALOG, CORE_BRIDGE_SPECS, BRIDGE_PARITY_ALERTS },
    { MINI_APP_PERMISSION_PROFILES },
  ] = await Promise.all([
    import('./core/impactAnalyzer'),
    import('./core/prImpactEngine'),
    import('./data/miniAppBridgeCatalog'),
    import('./data/miniAppPermissionMatrix'),
  ]);
  const index = buildImpactIndex(
    explorer.dataset,
    MINI_APP_CATALOG,
    CORE_BRIDGE_SPECS,
    MINI_APP_PERMISSION_PROFILES,
    BRIDGE_PARITY_ALERTS,
  );
  const prReport = analyzePrImpact(index, dirtyFiles, explorer.dataset);
  if (prReport.affectedNodes.length === 0) {
    pushToast(`${dirtyFiles.length} file đang sửa nhưng chưa khớp node nào trên sơ đồ`, 'info');
    return;
  }
  explorer.setAudienceMode('tech');
  explorer.setImpactHighlight(
    prReport.affectedNodes.map((a) => a.node.id),
    `Git Local (${dirtyFiles.length} file sửa)`,
  );
  pushToast(
    `Đã tô sáng ${prReport.affectedNodes.length} node bị ảnh hưởng bởi Git Local`,
    'success',
  );
};

const openSettings = (tab: 'paths' | 'media' | 'backup' = 'paths') => {
  if (!__ENABLE_TECH_MODE__) return;
  settingsInitialTab.value = tab;
  settingsOpen.value = true;
};

const startAppTour = async (requestedTrack?: AppTourTrack) => {
  const track: AppTourTrack =
    __ENABLE_TECH_MODE__ &&
    (requestedTrack === 'tech' ||
      (!requestedTrack && explorer.audienceMode.value === 'tech'))
      ? 'tech'
      : 'overview';

  miniAppModalOpen.value = false;
  parityOpen.value = false;
  governanceOpen.value = false;
  guideOpen.value = false;
  searchOpen.value = false;
  settingsOpen.value = false;
  impactOpen.value = false;
  explorer.setZenMode(false);

  let techSteps: AppTourStep[] | null = null;
  if (track === 'tech' && __ENABLE_TECH_MODE__) {
    explorer.setAudienceMode('tech');
    const handbookMod = await import('./data/techGuideHandbookData');
    techSteps = handbookMod.TECH_TOUR_STEPS;
  }

  tourTrack.value = track;
  tourSteps.value = resolveTourStepsForTrack(PUBLIC_TOUR_STEPS, techSteps, track);
  tourStepIndex.value = 0;
  tourOpen.value = true;
};

const handleTourClose = (completed: boolean) => {
  tourOpen.value = false;
  if (completed) {
    saveAppTourCompleted(true);
    tourCompleted.value = true;
    pushToast(
      'Đã hoàn tất Tour hướng dẫn! Bạn có thể bấm phím ? bất kỳ lúc nào để mở Sổ tay.',
      'success',
    );
  }
};

watch(
  () => [tourOpen.value, tourStepIndex.value] as const,
  ([isOpen, idx]) => {
    if (!isOpen) return;
    const step = tourSteps.value[idx];
    if (
      step?.ensureSampleExpanded &&
      explorer.visibleFlow.value.activeScenarios.length === 0 &&
      explorer.findNode('mod-calling')
    ) {
      if (!explorer.expandedIds.value.has('mod-calling')) {
        explorer.toggleExpand('mod-calling');
      }
    }
  },
);

const handleGuideQuickAction = (action: GuideQuickAction) => {
  if (action.type === 'start_tour') {
    void startAppTour(action.track);
    return;
  }
  if (action.type === 'open_search') {
    searchOpen.value = true;
    return;
  }
  if (action.type === 'toggle_zen') {
    const next = explorer.toggleZenMode();
    pushToast(next ? 'Đã bật Zen Mode (Esc hoặc Z để thoát)' : 'Đã thoát Zen Mode', 'info');
    return;
  }
  if (action.type === 'toggle_direction') {
    const next = explorer.toggleLayoutDirection();
    saveLayoutDirection(next);
    pushToast(next === 'TB' ? 'Sơ đồ hướng dọc (TB)' : 'Sơ đồ hướng ngang (LR)', 'info');
    return;
  }
  if (action.type === 'jump_node') {
    miniAppModalOpen.value = false;
    parityOpen.value = false;
    governanceOpen.value = false;
    if (action.platform && __ENABLE_TECH_MODE__) {
      explorer.setAudienceMode('tech');
      explorer.setPlatformMode(action.platform);
    }
    if (explorer.findNode(action.nodeId)) {
      if (action.expand && !explorer.expandedIds.value.has(action.nodeId)) {
        explorer.toggleExpand(action.nodeId);
      }
      explorer.jumpToNode(action.nodeId);
    }
    return;
  }

  if (!__ENABLE_TECH_MODE__) return;

  if (action.type === 'open_governance') {
    openGovernance(action.tab);
  } else if (action.type === 'open_parity') {
    openParity();
  } else if (action.type === 'open_miniapp_studio') {
    explorer.setAudienceMode('tech');
    openMiniAppBridge({ tab: action.tab ?? 'sandbox' });
  } else if (action.type === 'open_settings') {
    explorer.setAudienceMode('tech');
    openSettings(action.tab ?? 'paths');
  } else if (action.type === 'open_impact') {
    explorer.setAudienceMode('tech');
    openImpact();
  }
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
  const currentBranch = explorer.activeBranchId.value;
  if (patches.length === 0) {
    if (persist) clearDraftPatches(currentBranch);
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
  if (persist) saveDraftPatches(patches, currentBranch);
  explorer.setDatasetOverride(result.dataset);
};

const handleSwitchBranch = async (
  nextBranchId: string,
  options?: { silent?: boolean; force?: boolean },
) => {
  if (!__ENABLE_TECH_MODE__) return;
  if (!availableBranches.some((b) => b.id === nextBranchId)) {
    pushToast(`Không tìm thấy nhánh "${nextBranchId}"`, 'error');
    return;
  }
  if (!options?.force && nextBranchId === explorer.activeBranchId.value) return;

  const reqSeq = ++branchSwitchSeq;
  branchLoading.value = true;
  try {
    const loaded = await loadBranchDataset(nextBranchId);
    if (reqSeq !== branchSwitchSeq) return;
    explorer.setBaseDataset(loaded, nextBranchId);

    const { loadDraftPatches } = await import('./core/datasetDraftStore');
    const savedDrafts = loadDraftPatches(nextBranchId);
    await syncDraftOverlay(savedDrafts, false);

    if (!options?.silent) {
      pushToast(`Đã chuyển sang nhánh ${nextBranchId}`, 'success');
    }
  } catch (err) {
    if (reqSeq === branchSwitchSeq) {
      pushToast(
        err instanceof Error ? err.message : `Không thể tải dữ liệu nhánh ${nextBranchId}`,
        'error',
      );
    }
  } finally {
    if (reqSeq === branchSwitchSeq) {
      branchLoading.value = false;
    }
  }
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

const handleApplyDraftPatches = async (patches: DraftPatch[]) => {
  if (!__ENABLE_TECH_MODE__ || patches.length === 0) return;
  const next = [...draftPatches.value, ...patches];
  await syncDraftOverlay(next, true);
  if (draftPatches.value.length === next.length) {
    pushToast(`Đã ghi nháp ${patches.length} cập nhật node`, 'success');
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
      body: JSON.stringify({
        patches: draftPatches.value,
        branchId: explorer.activeBranchId.value,
      }),
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
        gtab === 'dashboard' ||
        gtab === 'nodes' ||
        gtab === 'workboard' ||
        gtab === 'atlas' ||
        gtab === 'tracer' ||
        gtab === 'health' ||
        gtab === 'diff' ||
        gtab === 'qa'
          ? gtab
          : 'dashboard';
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
    if (availableBranches.length > 1 && explorer.activeBranchId.value) {
      params.set('branch', explorer.activeBranchId.value);
    }
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
    tourOpen.value ||
    settingsOpen.value ||
    impactOpen.value ||
    addFlowOpen.value ||
    governanceOpen.value ||
    edgeEditorOpen.value ||
    scenarioEditorOpen.value ||
    miniAppModalOpen.value ||
    sourcePeekOpen.value ||
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
    const savedPrefs = loadSavedExplorerPrefs();
    const initialBranchId = resolveInitialBranchId({
      allowTechMode: __ENABLE_TECH_MODE__,
      search: window.location.search,
      hash: window.location.hash,
      savedPrefs,
      availableBranchIds: availableBranches.map((b) => b.id),
      defaultBranchId,
    });
    if (initialBranchId && initialBranchId !== defaultBranchId) {
      await handleSwitchBranch(initialBranchId, { silent: true, force: true });
    } else {
      const { loadDraftPatches } = await import('./core/datasetDraftStore');
      const saved = loadDraftPatches(explorer.activeBranchId.value);
      if (saved.length > 0) {
        await syncDraftOverlay(saved, false);
      }
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
      void refreshLocalGitStatus();
    }
  }
  applyInitialState();
  syncToUrl();
});

watch(
  [
    () => explorer.activeBranchId.value,
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
        branchId: explorer.activeBranchId.value,
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
  () => settingsOpen.value,
  (isOpen) => {
    if (!isOpen) {
      void refreshLocalGitStatus();
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
      :available-branches="availableBranches"
      :active-branch-id="explorer.activeBranchId.value"
      :branch-loading="branchLoading"
      :local-git-status="localGitStatus"
      @switch-branch="handleSwitchBranch($event)"
      @compare-branch="handleCompareBranch($event)"
      @highlight-git-dirty="handleHighlightGitDirty()"
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
          @start-tour="startAppTour($event)"
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
            @open-source-peek="openSourcePeek($event)"
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
        :base-branch-dataset="dataset"
        :base-branch-id="defaultBranchId"
        class="min-h-0 min-w-0 flex-1"
        @open-source-peek="openSourcePeek($event)"
      />
      <component
        :is="GovernanceHubModal"
        v-if="GovernanceHubModal && governanceOpen"
        v-model:open="governanceOpen"
        :initial-tab="governanceTab"
        :available-branches="availableBranches"
        :active-branch-id="explorer.activeBranchId.value"
        class="min-h-0 min-w-0 flex-1"
        @update:tab="governanceTab = $event"
        @open-source-peek="openSourcePeek($event)"
        @apply-draft-patches="handleApplyDraftPatches($event)"
        @open-parity="openParity()"
      />
    </div>

    <SearchModal
      v-model:open="searchOpen"
      @open-parity="openParity()"
      @open-guide="guideOpen = true"
      @start-tour="startAppTour($event)"
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
      :tour-completed="tourCompleted"
      @open-mini-app-studio="openMiniAppBridge({ tab: 'sandbox' })"
      @run-action="handleGuideQuickAction"
    />
    <AppWalkthroughOverlay
      v-model:step-index="tourStepIndex"
      :open="tourOpen"
      :steps="tourSteps"
      :track-label="tourTrack === 'tech' ? 'Tour Dev Toàn tập' : 'Tour Tổng quan'"
      @close="handleTourClose"
    />
    <ScenarioFlowDialog />
    <component
      :is="DevSettingsModal"
      v-if="DevSettingsModal"
      v-model:open="settingsOpen"
      :initial-tab="settingsInitialTab"
    />
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
    <component
      :is="SourcePeekModal"
      v-if="SourcePeekModal"
      v-model:open="sourcePeekOpen"
      :context="sourcePeekContext"
      @open-settings="openSettings()"
    />
    <ToastHost />
  </div>
</template>
