<script setup lang="ts">
import { inject, onBeforeUnmount, ref, watch } from 'vue';
import {
  Activity,
  ArrowLeft,
  Bug,
  ClipboardCheck,
  GitCompare,
  Kanban,
  LayoutDashboard,
  Table2,
  Terminal,
  Webhook,
} from 'lucide-vue-next';
import { FLOW_EXPLORER_KEY } from '../composables/useFlowExplorer';
import type { DraftPatch } from '../core/datasetDraftStore';
import type { SourcePeekLaunchContext } from '../core/sourcePeekClient';
import type { FlowBranchInfo } from '../data/schema';
import ApiAtlasPanel from './ApiAtlasPanel.vue';
import BulkNodeTablePanel from './BulkNodeTablePanel.vue';
import DataHealthPanel from './DataHealthPanel.vue';
import DevDashboardPanel from './DevDashboardPanel.vue';
import DevWorkboardPanel from './DevWorkboardPanel.vue';
import FlowSnapshotDiffPanel from './FlowSnapshotDiffPanel.vue';
import LogTracerPanel from './LogTracerPanel.vue';
import QaReleaseHubPanel from './QaReleaseHubPanel.vue';

export type GovernanceHubTab =
  | 'dashboard'
  | 'nodes'
  | 'workboard'
  | 'atlas'
  | 'tracer'
  | 'diff'
  | 'health'
  | 'qa';

const props = defineProps<{
  open: boolean;
  initialTab?: GovernanceHubTab;
  availableBranches?: FlowBranchInfo[];
  activeBranchId?: string;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  'update:tab': [tab: GovernanceHubTab];
  openSourcePeek: [context: SourcePeekLaunchContext];
  applyDraftPatches: [patches: DraftPatch[]];
  openParity: [];
}>();

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const activeTab = ref<GovernanceHubTab>(props.initialTab ?? 'dashboard');

const close = () => emit('update:open', false);

const setTab = (tab: GovernanceHubTab) => {
  activeTab.value = tab;
  emit('update:tab', tab);
};

const jumpToNode = (nodeId: string) => {
  close();
  explorer.setAudienceMode('tech');
  explorer.jumpToNode(nodeId);
};

const onKeyDown = (event: KeyboardEvent) => {
  if (props.open && event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    close();
  }
};

watch(
  () => [props.open, props.initialTab] as const,
  ([isOpen, initTab]) => {
    if (isOpen) {
      if (initTab) activeTab.value = initTab;
      window.addEventListener('keydown', onKeyDown, true);
    } else {
      window.removeEventListener('keydown', onKeyDown, true);
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown, true);
});
</script>

<template>
  <section
    v-if="props.open"
    aria-label="Dev Tools — VBot Flow Cockpit"
    class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-slate-50 dark:bg-[#090d16]"
  >
    <header class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3 dark:border-slate-800 dark:bg-[#0d1424]">
      <div class="flex flex-wrap items-center gap-3">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          @click="close"
        >
          <ArrowLeft class="h-3.5 w-3.5" />
          Quay lại Sơ đồ
        </button>

        <div class="flex items-center gap-2">
          <span class="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 dark:bg-cyan-500/15 dark:text-cyan-300">
            <Terminal class="h-4 w-4" />
          </span>
          <div>
            <h1 class="text-sm font-bold text-slate-900 dark:text-slate-100">
              Dev Tools — VBot Flow Cockpit
            </h1>
            <p class="text-[11px] text-slate-500 dark:text-slate-400">
              Tổng quan Dev, Quản lý Node hàng loạt, Workboard VbM, API Atlas, Log Tracer &amp; Branch Release Diff.
            </p>
          </div>
        </div>
      </div>

      <div class="inline-flex max-w-full items-center overflow-x-auto rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold dark:border-slate-700 dark:bg-slate-900">
        <button
          type="button"
          class="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 transition"
          :class="
            activeTab === 'dashboard'
              ? 'bg-white text-indigo-700 shadow-2xs dark:bg-slate-800 dark:text-cyan-300'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          "
          @click="setTab('dashboard')"
        >
          <LayoutDashboard class="h-3.5 w-3.5" />
          Tổng quan
        </button>
        <button
          type="button"
          class="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 transition"
          :class="
            activeTab === 'nodes'
              ? 'bg-white text-indigo-700 shadow-2xs dark:bg-slate-800 dark:text-cyan-300'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          "
          @click="setTab('nodes')"
        >
          <Table2 class="h-3.5 w-3.5" />
          Quản lý Node
        </button>
        <button
          type="button"
          class="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 transition"
          :class="
            activeTab === 'workboard'
              ? 'bg-white text-cyan-700 shadow-2xs dark:bg-slate-800 dark:text-cyan-300'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          "
          @click="setTab('workboard')"
        >
          <Kanban class="h-3.5 w-3.5" />
          Task VbM
        </button>
        <button
          type="button"
          class="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 transition"
          :class="
            activeTab === 'atlas'
              ? 'bg-white text-indigo-700 shadow-2xs dark:bg-slate-800 dark:text-cyan-300'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          "
          @click="setTab('atlas')"
        >
          <Webhook class="h-3.5 w-3.5" />
          API Atlas
        </button>
        <button
          type="button"
          class="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 transition"
          :class="
            activeTab === 'tracer'
              ? 'bg-white text-rose-700 shadow-2xs dark:bg-slate-800 dark:text-rose-300'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          "
          @click="setTab('tracer')"
        >
          <Bug class="h-3.5 w-3.5" />
          Log Tracer
        </button>
        <button
          type="button"
          class="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 transition"
          :class="
            activeTab === 'diff'
              ? 'bg-white text-amber-700 shadow-2xs dark:bg-slate-800 dark:text-amber-300'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          "
          @click="setTab('diff')"
        >
          <GitCompare class="h-3.5 w-3.5" />
          Branch Diff
        </button>
        <button
          type="button"
          class="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 transition"
          :class="
            activeTab === 'health'
              ? 'bg-white text-emerald-700 shadow-2xs dark:bg-slate-800 dark:text-emerald-300'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          "
          @click="setTab('health')"
        >
          <Activity class="h-3.5 w-3.5" />
          Dữ liệu
        </button>
        <button
          type="button"
          class="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] transition"
          :class="
            activeTab === 'qa'
              ? 'bg-white text-slate-900 shadow-2xs dark:bg-slate-800 dark:text-slate-200'
              : 'text-slate-500 hover:text-slate-900 dark:text-slate-500 dark:hover:text-slate-200'
          "
          @click="setTab('qa')"
        >
          <ClipboardCheck class="h-3.5 w-3.5" />
          QA
        </button>
      </div>
    </header>

    <DevDashboardPanel
      v-if="activeTab === 'dashboard'"
      @switch-tab="setTab($event)"
      @jump-to-node="jumpToNode"
      @open-parity="close(); emit('openParity')"
      @open-source-peek="emit('openSourcePeek', $event)"
    />
    <BulkNodeTablePanel
      v-else-if="activeTab === 'nodes'"
      @jump-to-node="jumpToNode"
      @apply-draft-patches="emit('applyDraftPatches', $event)"
      @open-source-peek="emit('openSourcePeek', $event)"
    />
    <DevWorkboardPanel
      v-else-if="activeTab === 'workboard'"
      @jump-to-node="jumpToNode"
      @apply-draft-patches="emit('applyDraftPatches', $event)"
    />
    <ApiAtlasPanel
      v-else-if="activeTab === 'atlas'"
      @jump-to-node="jumpToNode"
      @open-source-peek="emit('openSourcePeek', $event)"
    />
    <LogTracerPanel
      v-else-if="activeTab === 'tracer'"
      @close-hub="close"
      @jump-to-node="jumpToNode"
      @open-source-peek="emit('openSourcePeek', $event)"
    />
    <FlowSnapshotDiffPanel
      v-else-if="activeTab === 'diff'"
      :available-branches="props.availableBranches"
      :active-branch-id="props.activeBranchId"
      @close-hub="close"
    />
    <DataHealthPanel v-else-if="activeTab === 'health'" @jump-to-node="jumpToNode" />
    <QaReleaseHubPanel v-else @close-hub="close" />
  </section>
</template>
