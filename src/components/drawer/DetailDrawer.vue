<script setup lang="ts">
import { computed, inject } from 'vue';
import { ArrowLeftRight, Focus, GitBranch, Link2, RotateCcw, X } from 'lucide-vue-next';
import { FLOW_EXPLORER_KEY } from '../../composables/useFlowExplorer';
import type { BridgeMessage, MiniAppBridge, NodeKind } from '../../data/schema';
import MediaGallery from './MediaGallery.vue';

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const enableTechMode = __ENABLE_TECH_MODE__;

const KIND_BADGE_MAP: Record<NodeKind, { label: string; cls: string }> = {
  module: { label: 'Module', cls: 'bg-indigo-600 text-white' },
  action: { label: 'Thao tác', cls: 'bg-blue-600 text-white' },
  process: { label: 'Xử lý', cls: 'bg-violet-600 text-white' },
  decision: { label: 'Điều kiện', cls: 'bg-amber-500 text-white' },
  external: { label: 'Hệ thống', cls: 'bg-emerald-600 text-white' },
  error: { label: 'Lỗi / Retry', cls: 'bg-rose-600 text-white' },
};

const node = computed(() => explorer.selectedNode.value);
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

const techSummary = computed(() => {
  if (!__ENABLE_TECH_MODE__ || explorer.audienceMode.value !== 'tech') return null;
  return node.value?.summary.tech ?? null;
});

const miniAppBridgeView = computed(() => {
  if (!__ENABLE_TECH_MODE__ || explorer.audienceMode.value !== 'tech') return null;
  const bridge: MiniAppBridge | undefined = node.value?.techDetail?.miniAppBridge;
  if (!bridge) return null;

  const embedLabels: Record<MiniAppBridge['embedMode'], string> = {
    inline_tab: 'Inline Tab',
    modal: 'Modal',
    sdk_global: 'Global SDK',
  };

  const dirMeta: Record<BridgeMessage['direction'], { label: string; cls: string }> = {
    host_init: {
      label: 'Host → Mini App (Init)',
      cls: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    },
    host_to_miniapp: {
      label: 'Host → Mini App (Event)',
      cls: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    },
    miniapp_to_host: {
      label: 'Mini App → Host (Action)',
      cls: 'border-blue-200 bg-blue-50 text-blue-700',
    },
  };

  return {
    miniAppId: bridge.miniAppId,
    embedLabel: embedLabels[bridge.embedMode],
    transport: bridge.transport,
    messages: bridge.messages.map((msg) => ({
      ...msg,
      dirLabel: dirMeta[msg.direction].label,
      dirCls: dirMeta[msg.direction].cls,
    })),
  };
});

const techSections = computed(() => {
  if (!__ENABLE_TECH_MODE__ || explorer.audienceMode.value !== 'tech') return [];
  const detail = node.value?.techDetail;
  if (!detail) return [];
  return [
    { key: 'inputs', title: 'Inputs', items: detail.inputs ?? [], mono: false },
    { key: 'outputs', title: 'Outputs', items: detail.outputs ?? [], mono: false },
    { key: 'apisOrEvents', title: 'APIs / Events', items: detail.apisOrEvents ?? [], mono: true },
    { key: 'edgeCases', title: 'Edge Cases', items: detail.edgeCases ?? [], mono: false },
    { key: 'codeRefs', title: 'Code Refs', items: detail.codeRefs ?? [], mono: true },
  ].filter((section) => section.items.length > 0);
});

const relatedNodes = computed(() => {
  const ids = node.value?.relatedNodeIds ?? [];
  return ids
    .map((id) => explorer.findNode(id))
    .filter((target): target is NonNullable<typeof target> => Boolean(target));
});
</script>

<template>
  <aside
    v-if="node"
    class="z-10 flex h-full w-full shrink-0 flex-col border-l border-slate-200 bg-white shadow-xl sm:w-[400px] lg:w-[440px]"
  >
    <div class="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
      <div class="min-w-0">
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
            class="inline-flex items-center rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700"
          >
            Kỹ thuật
          </span>
        </div>
        <h2 class="text-base leading-snug font-bold text-slate-900">
          {{ node.label }}
        </h2>
      </div>

      <button
        type="button"
        aria-label="Đóng chi tiết"
        class="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        @click="explorer.selectedNodeId.value = null"
      >
        <X class="h-4 w-4" />
      </button>
    </div>

    <div class="flex-1 space-y-5 overflow-y-auto px-5 py-4">
      <div
        v-if="(hasSubtree && childCount > 0) || node.id !== explorer.dataset.rootNode.id"
        class="flex flex-wrap gap-2"
      >
        <button
          v-if="hasSubtree && childCount > 0"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
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
              ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          "
          @click="explorer.setFocusRoot(isFocusedHere ? null : node.id)"
        >
          <RotateCcw v-if="isFocusedHere" class="h-3.5 w-3.5" />
          <Focus v-else class="h-3.5 w-3.5" />
          {{ isFocusedHere ? 'Xem toàn bộ app' : 'Tập trung nhánh này' }}
        </button>
      </div>

      <MediaGallery
        :media="node.media"
        :audience-mode="explorer.audienceMode.value"
      />

      <section class="space-y-1.5">
        <h3 class="text-xs font-bold tracking-wide text-slate-500 uppercase">
          Mô tả tổng quan
        </h3>
        <p class="text-sm leading-relaxed text-slate-700">
          {{ node.summary.overview }}
        </p>
      </section>

      <section
        v-if="enableTechMode && techSummary"
        class="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5"
      >
        <h3 class="text-xs font-bold tracking-wide text-slate-700 uppercase">
          Chi tiết xử lý kỹ thuật
        </h3>
        <p class="text-xs leading-relaxed text-slate-700">
          {{ techSummary }}
        </p>
      </section>

      <section
        v-if="enableTechMode && miniAppBridgeView"
        class="space-y-3 rounded-xl border border-cyan-200 bg-cyan-50/40 p-3.5"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="flex items-center gap-1.5 text-xs font-bold tracking-wide text-cyan-900 uppercase">
            <ArrowLeftRight class="h-3.5 w-3.5 text-cyan-700" />
            Giao tiếp Host App ↔ Mini App
          </h3>
          <span class="rounded-md border border-cyan-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-cyan-800">
            {{ miniAppBridgeView.embedLabel }}
          </span>
        </div>

        <div class="space-y-1 text-xs">
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="font-medium text-slate-600">Mini App ID:</span>
            <code class="rounded border border-cyan-200 bg-white px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-800">
              {{ miniAppBridgeView.miniAppId }}
            </code>
          </div>
          <p v-if="miniAppBridgeView.transport" class="text-[11px] leading-relaxed text-slate-600">
            {{ miniAppBridgeView.transport }}
          </p>
        </div>

        <ul class="space-y-2">
          <li
            v-for="(msg, idx) in miniAppBridgeView.messages"
            :key="`${msg.direction}-${msg.name}-${idx}`"
            class="space-y-1.5 rounded-lg border border-slate-200 bg-white p-2.5 text-xs"
          >
            <div class="flex flex-wrap items-center justify-between gap-1.5">
              <span
                class="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold"
                :class="msg.dirCls"
              >
                {{ msg.dirLabel }}
              </span>
              <code class="font-mono text-[11px] font-bold break-all text-slate-900">
                {{ msg.name }}
              </code>
            </div>

            <div v-if="msg.payload" class="text-[11px] text-slate-600">
              <span class="font-semibold text-slate-700">Payload:</span>
              <code class="ml-1 font-mono break-all text-slate-800">{{ msg.payload }}</code>
            </div>

            <div v-if="msg.response" class="text-[11px] text-slate-600">
              <span class="font-semibold text-slate-700">Response:</span>
              <code class="ml-1 font-mono break-all text-slate-800">{{ msg.response }}</code>
            </div>

            <p v-if="msg.note" class="text-[11px] leading-relaxed text-slate-600">
              {{ msg.note }}
            </p>
          </li>
        </ul>
      </section>

      <template v-if="enableTechMode && techSections.length > 0">
        <section
          v-for="section in techSections"
          :key="section.key"
          class="space-y-1.5"
        >
          <h3 class="text-xs font-bold tracking-wide text-slate-500 uppercase">
            {{ section.title }}
          </h3>
          <ul class="space-y-1.5">
            <li
              v-for="item in section.items"
              :key="item"
              class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"
              :class="section.mono ? 'font-mono break-all text-slate-800' : 'leading-relaxed'"
            >
              {{ item }}
            </li>
          </ul>
        </section>
      </template>

      <section v-if="relatedNodes.length > 0" class="space-y-2 border-t border-slate-100 pt-4">
        <h3 class="flex items-center gap-1.5 text-xs font-bold tracking-wide text-slate-500 uppercase">
          <Link2 class="h-3.5 w-3.5" />
          Liên kết chéo
        </h3>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="target in relatedNodes"
            :key="target.id"
            type="button"
            class="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
            @click="explorer.jumpToNode(target.id)"
          >
            {{ target.label }}
          </button>
        </div>
      </section>
    </div>
  </aside>
</template>
