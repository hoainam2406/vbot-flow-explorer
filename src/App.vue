<script setup lang="ts">
import { onBeforeUnmount, onMounted, provide, ref, watch } from 'vue';
import dataset from 'virtual:flow-dataset';
import FlowCanvas from './components/FlowCanvas.vue';
import SearchModal from './components/SearchModal.vue';
import TopBar from './components/TopBar.vue';
import DetailDrawer from './components/drawer/DetailDrawer.vue';
import { createFlowExplorerState, FLOW_EXPLORER_KEY } from './composables/useFlowExplorer';

const explorer = createFlowExplorerState(dataset, __ENABLE_TECH_MODE__);
provide(FLOW_EXPLORER_KEY, explorer);

const searchOpen = ref(false);

const parseUrlState = () => {
  const searchParams = new URLSearchParams(window.location.search);
  const rawHash = window.location.hash.replace(/^#/, '');
  const hashQuery = rawHash.includes('?') ? rawHash.split('?')[1] : rawHash.replace(/^\/+/, '');
  const hashParams = new URLSearchParams(hashQuery);

  const focus = hashParams.get('focus') ?? searchParams.get('focus');
  if (focus && explorer.findNode(focus)) {
    explorer.setFocusRoot(focus);
  }

  if (__ENABLE_TECH_MODE__) {
    const mode = hashParams.get('mode') ?? searchParams.get('mode');
    if (mode === 'tech' || mode === 'overview') {
      explorer.setAudienceMode(mode);
    }
  }
};

const syncToUrl = () => {
  const params = new URLSearchParams();
  if (explorer.focusRootId.value) {
    params.set('focus', explorer.focusRootId.value);
  }
  if (__ENABLE_TECH_MODE__ && explorer.audienceMode.value === 'tech') {
    params.set('mode', 'tech');
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
  if (event.key === 'Escape' && !event.defaultPrevented && !searchOpen.value && explorer.selectedNodeId.value) {
    explorer.selectedNodeId.value = null;
  }
};

onMounted(() => {
  parseUrlState();
  syncToUrl();
  window.addEventListener('keydown', onGlobalKeyDown);
});

watch(
  [() => explorer.focusRootId.value, () => explorer.audienceMode.value],
  () => {
    syncToUrl();
  },
);

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeyDown);
});
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden bg-slate-50">
    <TopBar @open-search="searchOpen = true" />

    <div class="relative flex min-h-0 flex-1 overflow-hidden">
      <FlowCanvas class="min-w-0 flex-1" />
      <DetailDrawer />
    </div>

    <SearchModal v-model:open="searchOpen" />
  </div>
</template>
