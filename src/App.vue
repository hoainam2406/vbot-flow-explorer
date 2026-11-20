<script setup lang="ts">
import { defineAsyncComponent, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue';
import dataset from 'virtual:flow-dataset';
import FlowCanvas from './components/FlowCanvas.vue';
import GuideGlossaryModal from './components/GuideGlossaryModal.vue';
import ScenarioFlowDialog from './components/ScenarioFlowDialog.vue';
import SearchModal from './components/SearchModal.vue';
import type { MiniAppBridgeLaunchContext } from './components/MiniAppBridgeModal.vue';
import TopBar from './components/TopBar.vue';
import DetailDrawer from './components/drawer/DetailDrawer.vue';
import { createFlowExplorerState, FLOW_EXPLORER_KEY } from './composables/useFlowExplorer';
import {
  loadSavedExplorerPrefs,
  resolveInitialExplorerState,
  saveExplorerPrefs,
} from './core/explorerPreferences';
import { isVisibleForMode, isVisibleForPlatform } from './core/graphEngine';

const ParityMatrixModal = __ENABLE_TECH_MODE__
  ? defineAsyncComponent(() => import('./components/ParityMatrixModal.vue'))
  : null;
const MiniAppBridgeModal = __ENABLE_TECH_MODE__
  ? defineAsyncComponent(() => import('./components/MiniAppBridgeModal.vue'))
  : null;

const explorer = createFlowExplorerState(dataset, __ENABLE_TECH_MODE__);
provide(FLOW_EXPLORER_KEY, explorer);

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

const applyInitialState = () => {
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

const onGlobalKeyDown = (event: KeyboardEvent) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    searchOpen.value = true;
    return;
  }
  if (
    event.key === 'Escape' &&
    !event.defaultPrevented &&
    !searchOpen.value &&
    !parityOpen.value &&
    !guideOpen.value &&
    !miniAppModalOpen.value &&
    !explorer.scenarioDialogOpen.value &&
    explorer.selectedNodeId.value
  ) {
    explorer.selectedNodeId.value = null;
  }
};

onMounted(() => {
  applyInitialState();
  syncToUrl();
  window.addEventListener('keydown', onGlobalKeyDown);
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

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeyDown);
});
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden bg-slate-50">
    <TopBar
      @open-search="searchOpen = true"
      @open-parity="parityOpen = true"
      @open-guide="guideOpen = true"
      @open-miniapp-bridge="openMiniAppBridge()"
    />

    <div class="relative flex min-h-0 flex-1 overflow-hidden">
      <FlowCanvas class="min-w-0 flex-1" @open-guide="guideOpen = true" />
      <DetailDrawer @open-miniapp-bridge="openMiniAppBridge" />
    </div>

    <SearchModal v-model:open="searchOpen" />
    <GuideGlossaryModal v-model:open="guideOpen" />
    <ScenarioFlowDialog />
    <component :is="ParityMatrixModal" v-if="ParityMatrixModal" v-model:open="parityOpen" />
    <component
      :is="MiniAppBridgeModal"
      v-if="MiniAppBridgeModal"
      v-model:open="miniAppModalOpen"
      :initial-context="miniAppLaunchContext"
    />
  </div>
</template>
