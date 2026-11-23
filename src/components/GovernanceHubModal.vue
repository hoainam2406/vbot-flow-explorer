<script setup lang="ts">
import { inject, onBeforeUnmount, ref, watch } from 'vue';
import {
  Activity,
  ArrowLeft,
  ClipboardCheck,
  GitCompare,
  ShieldCheck,
} from 'lucide-vue-next';
import { FLOW_EXPLORER_KEY } from '../composables/useFlowExplorer';
import DataHealthPanel from './DataHealthPanel.vue';
import FlowSnapshotDiffPanel from './FlowSnapshotDiffPanel.vue';
import QaReleaseHubPanel from './QaReleaseHubPanel.vue';

export type GovernanceHubTab = 'qa' | 'health' | 'diff';

const props = defineProps<{
  open: boolean;
  initialTab?: GovernanceHubTab;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  'update:tab': [tab: GovernanceHubTab];
}>();

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const activeTab = ref<GovernanceHubTab>(props.initialTab ?? 'qa');

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
    aria-label="QA và Quản trị Hub"
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
            <ShieldCheck class="h-4 w-4" />
          </span>
          <div>
            <h1 class="text-sm font-bold text-slate-900 dark:text-slate-100">
              QA &amp; Quản trị Luồng VBot
            </h1>
            <p class="text-[11px] text-slate-500 dark:text-slate-400">
              Theo dõi đợt Release QA, Sức khỏe Dữ liệu &amp; Upload Media, và So sánh Phiên bản Luồng.
            </p>
          </div>
        </div>
      </div>

      <div class="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold dark:border-slate-700 dark:bg-slate-900">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition"
          :class="
            activeTab === 'qa'
              ? 'bg-white text-indigo-700 shadow-2xs dark:bg-slate-800 dark:text-cyan-300'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          "
          @click="setTab('qa')"
        >
          <ClipboardCheck class="h-3.5 w-3.5" />
          QA Release Hub
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition"
          :class="
            activeTab === 'health'
              ? 'bg-white text-emerald-700 shadow-2xs dark:bg-slate-800 dark:text-emerald-300'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          "
          @click="setTab('health')"
        >
          <Activity class="h-3.5 w-3.5" />
          Sức khỏe Dữ liệu &amp; Media
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition"
          :class="
            activeTab === 'diff'
              ? 'bg-white text-amber-700 shadow-2xs dark:bg-slate-800 dark:text-amber-300'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          "
          @click="setTab('diff')"
        >
          <GitCompare class="h-3.5 w-3.5" />
          Snapshot Diff
        </button>
      </div>
    </header>

    <QaReleaseHubPanel v-if="activeTab === 'qa'" @close-hub="close" />
    <DataHealthPanel v-else-if="activeTab === 'health'" @jump-to-node="jumpToNode" />
    <FlowSnapshotDiffPanel v-else @close-hub="close" />
  </section>
</template>
