<script setup lang="ts">
import { computed, defineAsyncComponent, inject, onBeforeUnmount, ref, watch } from 'vue';
import {
  ArrowLeft,
  Check,
  ClipboardList,
  Download,
  FilePenLine,
  FileText,
  Focus,
  GitBranch,
  GitBranchPlus,
  Link2,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-vue-next';
import { FLOW_EXPLORER_KEY } from '../../composables/useFlowExplorer';
import { useToast } from '../../composables/useToast';
import type { DraftPatch } from '../../core/datasetDraftStore';
import { copyTextToClipboard, downloadTextFile, slugifyFilename } from '../../core/downloadHelper';
import type { ImpactAxis } from '../../core/impactAnalyzer';
import {
  getNodeDisplayLabel,
  isVisibleForMode,
  isVisibleForPlatform,
} from '../../core/graphEngine';
import { exportNodeOverviewMarkdown } from '../../core/publicMarkdownExport';
import type { VbotWorkTaskDraft } from '../../core/vbotWorkTemplates';
import type { FlowNodeData, NodeKind } from '../../data/schema';
import type { MiniAppBridgeLaunchContext } from '../MiniAppBridgeModal.vue';
import MediaGallery from './MediaGallery.vue';

const emit = defineEmits<{
  openMiniappBridge: [context: MiniAppBridgeLaunchContext];
  openSettings: [];
  openImpact: [context: { query: string; axis: ImpactAxis }];
  applyDraftPatch: [patch: DraftPatch];
  openAddFlow: [anchorNode: FlowNodeData];
}>();

const TechDetailPanel = __ENABLE_TECH_MODE__
  ? defineAsyncComponent(() => import('./TechDetailPanel.vue'))
  : null;
const NodeEditorPanel = __ENABLE_TECH_MODE__
  ? defineAsyncComponent(() => import('./NodeEditorPanel.vue'))
  : null;
const CreateVbotWorkTaskModal = __ENABLE_TECH_MODE__
  ? defineAsyncComponent(() => import('../CreateVbotWorkTaskModal.vue'))
  : null;

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const { pushToast } = useToast();
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
const displayLabel = computed(() =>
  node.value ? getNodeDisplayLabel(node.value, explorer.audienceMode.value) : '',
);
const previousNodeLabel = computed(() =>
  explorer.previousNode.value
    ? getNodeDisplayLabel(explorer.previousNode.value, explorer.audienceMode.value)
    : null,
);
const isTechView = computed(() => enableTechMode && explorer.audienceMode.value === 'tech');
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
const copiedLink = ref(false);
let copyResetTimer: ReturnType<typeof setTimeout> | null = null;
let linkResetTimer: ReturnType<typeof setTimeout> | null = null;

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
    pushToast('Đã sao chép nội dung Markdown', 'success');
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
  downloadTextFile(`${slugifyFilename(displayLabel.value)}.md`, md);
  pushToast('Đã tải tài liệu Markdown (.md)', 'success');
};

const workTaskModalOpen = ref(false);
const workTaskDraft = ref<VbotWorkTaskDraft | null>(null);
const workFallbackUrl = ref('');

const handleOpenWorkTask = async () => {
  const current = node.value;
  if (!__ENABLE_TECH_MODE__ || !current) return;
  const [{ buildNodeTaskDraft, resolveVbotWorkUrl }, { loadDevWorkspaceSettings }] =
    await Promise.all([
      import('../../core/vbotWorkTemplates'),
      import('../../core/workspaceSettings'),
    ]);
  const fallback = resolveVbotWorkUrl(
    loadDevWorkspaceSettings(),
    explorer.dataset.app.repoConfig,
    'general',
  );
  workFallbackUrl.value = fallback;
  workTaskDraft.value = buildNodeTaskDraft(current, {
    pageUrl: typeof window !== 'undefined' ? window.location.href : undefined,
    platformMode: explorer.platformMode.value,
    fallbackUrl: fallback,
  });
  workTaskModalOpen.value = true;
};

const handleCopyLink = async () => {
  if (typeof window === 'undefined') return;
  const ok = await copyTextToClipboard(window.location.href);
  if (ok) {
    copiedLink.value = true;
    pushToast('Đã sao chép đường dẫn tới mục này', 'success');
    if (linkResetTimer) clearTimeout(linkResetTimer);
    linkResetTimer = setTimeout(() => {
      copiedLink.value = false;
    }, 1500);
  }
};

const editing = ref(false);

watch(
  [() => node.value?.id, () => explorer.audienceMode.value],
  () => {
    editing.value = false;
  },
);

const toggleEditMode = () => {
  if (!__ENABLE_TECH_MODE__ || !isTechView.value) return;
  editing.value = !editing.value;
};

const handleSaveNodeEdit = (updatedNode: FlowNodeData) => {
  if (!__ENABLE_TECH_MODE__) return;
  emit('applyDraftPatch', {
    id: `patch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    kind: 'update_node',
    nodeId: updatedNode.id,
    node: updatedNode,
  });
  editing.value = false;
};

const handleDeleteNodeEdit = (nodeId: string) => {
  if (!__ENABLE_TECH_MODE__) return;
  emit('applyDraftPatch', {
    id: `patch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    kind: 'delete_node',
    nodeId,
  });
  editing.value = false;
};

const handleOpenAddFlow = () => {
  if (!__ENABLE_TECH_MODE__ || !node.value) return;
  emit('openAddFlow', node.value);
};

const copiedAiPrompt = ref(false);
let aiPromptTimer: ReturnType<typeof setTimeout> | null = null;

const handleCopyAiPrompt = async () => {
  const current = node.value;
  if (!__ENABLE_TECH_MODE__ || !current) return;
  const [{ buildNodeAiContextPrompt }, { loadDevWorkspaceSettings }] = await Promise.all([
    import('../../core/aiContextExport'),
    import('../../core/workspaceSettings'),
  ]);
  const prompt = buildNodeAiContextPrompt(
    current,
    explorer.dataset,
    explorer.platformMode.value,
    loadDevWorkspaceSettings(),
  );
  const ok = await copyTextToClipboard(prompt);
  if (ok) {
    copiedAiPrompt.value = true;
    pushToast('Đã sao chép AI Context Prompt cho node này', 'success');
    if (aiPromptTimer) clearTimeout(aiPromptTimer);
    aiPromptTimer = setTimeout(() => {
      copiedAiPrompt.value = false;
    }, 1800);
  }
};

onBeforeUnmount(() => {
  if (copyResetTimer) clearTimeout(copyResetTimer);
  if (linkResetTimer) clearTimeout(linkResetTimer);
  if (aiPromptTimer) clearTimeout(aiPromptTimer);
});
</script>

<template>
  <aside
    v-if="node"
    class="z-10 flex h-full w-full shrink-0 flex-col border-l border-slate-200 bg-white shadow-xl transition-[width] duration-200 max-sm:fixed max-sm:inset-y-0 max-sm:right-0 max-sm:z-30 dark:border-slate-800 dark:bg-[#0d1424]"
    :class="drawerWidthClass"
  >
    <div class="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
      <div class="min-w-0 flex-1">
        <button
          v-if="previousNodeLabel"
          type="button"
          class="mb-2 inline-flex max-w-full items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:border-cyan-500/40 dark:hover:bg-cyan-500/15 dark:hover:text-cyan-300"
          :title="`Quay lại: ${previousNodeLabel}`"
          @click="explorer.goBack()"
        >
          <ArrowLeft class="h-3 w-3 shrink-0" />
          <span class="truncate">Quay lại: {{ previousNodeLabel }}</span>
        </button>

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
            class="inline-flex items-center rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            Kỹ thuật
          </span>
        </div>
        <h2 class="text-base leading-snug font-bold text-slate-900 dark:text-slate-100">
          {{ displayLabel }}
        </h2>
      </div>

      <div class="flex shrink-0 items-center gap-1">
        <button
          type="button"
          :aria-label="copiedLink ? 'Đã sao chép đường dẫn' : 'Sao chép đường dẫn tới mục này'"
          :title="copiedLink ? 'Đã sao chép đường dẫn' : 'Sao chép đường dẫn tới mục này'"
          class="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          @click="handleCopyLink"
        >
          <Check v-if="copiedLink" class="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <Link2 v-else class="h-4 w-4" />
        </button>

        <button
          type="button"
          aria-label="Đóng chi tiết"
          class="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          @click="explorer.selectedNodeId.value = null"
        >
          <X class="h-4 w-4" />
        </button>
      </div>
    </div>

    <div class="flex-1 space-y-5 overflow-y-auto px-5 py-4">
      <div class="flex flex-wrap gap-2">
        <button
          v-if="hasSubtree && childCount > 0"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-cyan-500/35 dark:bg-cyan-500/12 dark:text-cyan-300 dark:hover:bg-cyan-500/20"
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
              ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300'
              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-800'
          "
          @click="explorer.setFocusRoot(isFocusedHere ? null : node.id)"
        >
          <RotateCcw v-if="isFocusedHere" class="h-3.5 w-3.5" />
          <Focus v-else class="h-3.5 w-3.5" />
          {{ isFocusedHere ? 'Xem toàn bộ app' : 'Tập trung nhánh này' }}
        </button>

        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-800"
          @click="handleCopyMd"
        >
          <Check v-if="copiedMd" class="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          <FileText v-else class="h-3.5 w-3.5" />
          {{
            copiedMd
              ? isTechView
                ? 'Đã copy MD'
                : 'Đã sao chép'
              : isTechView
                ? 'Copy MD'
                : 'Sao chép mô tả'
          }}
        </button>

        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-800"
          @click="handleDownloadMd"
        >
          <Download class="h-3.5 w-3.5" />
          {{ isTechView ? 'Tải .md' : 'Tải tài liệu' }}
        </button>

        <button
          v-if="enableTechMode && isTechView"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-800 transition hover:bg-indigo-100 dark:border-indigo-500/35 dark:bg-indigo-500/15 dark:text-indigo-200 dark:hover:bg-indigo-500/25"
          title="Sao chép gói ngữ cảnh kỹ thuật để dán vào IDE"
          @click="handleCopyAiPrompt"
        >
          <Check v-if="copiedAiPrompt" class="h-3.5 w-3.5 text-emerald-500" />
          <Sparkles v-else class="h-3.5 w-3.5" />
          {{ copiedAiPrompt ? 'Đã copy AI Prompt' : 'Copy AI Prompt' }}
        </button>

        <button
          v-if="enableTechMode && isTechView"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-1.5 text-xs font-semibold text-cyan-800 transition hover:bg-cyan-100 dark:border-cyan-500/35 dark:bg-cyan-500/15 dark:text-cyan-300 dark:hover:bg-cyan-500/25"
          title="Tạo Task lên VBot Work (mặc định dự án vbot-mobile, Hoài Nam)"
          @click="handleOpenWorkTask"
        >
          <ClipboardList class="h-3.5 w-3.5" />
          Tạo Task VBot Work
        </button>

        <button
          v-if="enableTechMode && isTechView"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition"
          :class="
            editing
              ? 'border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-500/50 dark:bg-amber-500/20 dark:text-amber-200'
              : 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-500/35 dark:bg-amber-500/12 dark:text-amber-300 dark:hover:bg-amber-500/20'
          "
          @click="toggleEditMode"
        >
          <FilePenLine class="h-3.5 w-3.5" />
          {{ editing ? 'Đang sửa' : 'Chỉnh sửa' }}
        </button>

        <button
          v-if="enableTechMode && isTechView"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-500/35 dark:bg-emerald-500/12 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
          @click="handleOpenAddFlow"
        >
          <GitBranchPlus class="h-3.5 w-3.5" />
          + Thêm bước
        </button>
      </div>

      <component
        :is="NodeEditorPanel"
        v-if="NodeEditorPanel && enableTechMode && isTechView && editing"
        :node="node"
        :can-delete="node.id !== explorer.dataset.rootNode.id"
        @save="handleSaveNodeEdit"
        @delete-node="handleDeleteNodeEdit"
        @cancel="editing = false"
      />

      <template v-else>
        <MediaGallery
          :media="node.media"
          :audience-mode="explorer.audienceMode.value"
        />

        <section class="space-y-1.5">
          <h3 class="text-xs font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400">
            Mô tả tổng quan
          </h3>
          <p class="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
            {{ node.summary.overview }}
          </p>
        </section>

        <component
          :is="TechDetailPanel"
          v-if="TechDetailPanel && explorer.audienceMode.value === 'tech'"
          :node="node"
          :platform-mode="explorer.platformMode.value"
          @open-miniapp-bridge="emit('openMiniappBridge', $event)"
          @open-settings="emit('openSettings')"
          @open-impact="emit('openImpact', $event)"
        />

        <section v-if="relatedNodes.length > 0" class="space-y-2 border-t border-slate-100 pt-4 dark:border-slate-800">
          <h3 class="flex items-center gap-1.5 text-xs font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400">
            <Link2 class="h-3.5 w-3.5" />
            Liên kết chéo
          </h3>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="target in relatedNodes"
              :key="target.id"
              type="button"
              class="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:border-cyan-500/40 dark:hover:bg-cyan-500/10 dark:hover:text-cyan-300"
              @click="explorer.jumpToNode(target.id)"
            >
              {{ getNodeDisplayLabel(target, explorer.audienceMode.value) }}
            </button>
          </div>
        </section>
      </template>
    </div>

    <component
      :is="CreateVbotWorkTaskModal"
      v-if="CreateVbotWorkTaskModal && enableTechMode"
      v-model:open="workTaskModalOpen"
      :draft="workTaskDraft"
      :fallback-url="workFallbackUrl"
    />
  </aside>
</template>
