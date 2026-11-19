<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import { Film, Image as ImageIcon } from 'lucide-vue-next';
import { FLOW_EXPLORER_KEY, getVisibleMedia } from '../../composables/useFlowExplorer';
import type { PositionedFlowNodeData } from '../../composables/useGraphLayout';
import type { NodeKind } from '../../data/schema';

const props = defineProps<{
  id: string;
  data: PositionedFlowNodeData;
  sourcePosition?: Position;
  targetPosition?: Position;
  selected?: boolean;
}>();

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const KIND_STYLE_MAP: Record<NodeKind, { label: string; card: string; badge: string }> = {
  module: {
    label: 'Module',
    card: 'border-indigo-300 bg-indigo-50/95',
    badge: 'bg-indigo-600 text-white',
  },
  miniapp: {
    label: 'Mini App',
    card: 'border-cyan-400 bg-cyan-50/95',
    badge: 'bg-cyan-600 text-white',
  },
  action: {
    label: 'Thao tác',
    card: 'border-blue-300 bg-blue-50/95',
    badge: 'bg-blue-600 text-white',
  },
  process: {
    label: 'Xử lý',
    card: 'border-violet-300 bg-violet-50/95',
    badge: 'bg-violet-600 text-white',
  },
  decision: {
    label: 'Điều kiện',
    card: 'border-amber-300 bg-amber-50/95',
    badge: 'bg-amber-500 text-white',
  },
  external: {
    label: 'Hệ thống',
    card: 'border-emerald-300 bg-emerald-50/95',
    badge: 'bg-emerald-600 text-white',
  },
  error: {
    label: 'Lỗi / Retry',
    card: 'border-rose-300 bg-rose-50/95',
    badge: 'bg-rose-600 text-white',
  },
};

const enableTechMode = __ENABLE_TECH_MODE__;
const kindMeta = computed(() => KIND_STYLE_MAP[props.data.kind]);
const isTechNode = computed(() => enableTechMode && props.data.audience === 'tech');
const hasMiniAppBridge = computed(() => {
  if (!__ENABLE_TECH_MODE__ || explorer.audienceMode.value !== 'tech') return false;
  return Boolean(props.data.techDetail?.miniAppBridge);
});

const visibleMedia = computed(() => getVisibleMedia(props.data, explorer.audienceMode.value));
const firstMedia = computed(() => visibleMedia.value[0] ?? null);
const mediaError = ref(false);

watch(
  () => firstMedia.value?.src,
  () => {
    mediaError.value = false;
  },
);

const showThumbnail = computed(
  () => explorer.showCanvasMedia.value && Boolean(firstMedia.value) && !mediaError.value,
);

const canExpand = computed(() => explorer.hasSubtree(props.data.id));
const isExpanded = computed(() => explorer.expandedIds.value.has(props.data.id));
const childCount = computed(() => (canExpand.value ? explorer.getChildCount(props.data.id) : 0));
const isSelected = computed(
  () => explorer.selectedNodeId.value === props.data.id || Boolean(props.selected),
);

const activeScenario = computed(() => {
  const scId = explorer.activeScenarioId.value;
  if (!scId) return null;
  return explorer.visibleFlow.value.activeScenarios.find((s) => s.id === scId) ?? null;
});

const isScenarioHit = computed(() =>
  activeScenario.value ? activeScenario.value.nodeIds.includes(props.data.id) : false,
);
const isDimmed = computed(() => Boolean(activeScenario.value) && !isScenarioHit.value);

const onSelectNode = () => {
  explorer.selectedNodeId.value = props.data.id;
};

const onToggleBranch = () => {
  if (canExpand.value && childCount.value > 0) {
    explorer.toggleExpand(props.data.id);
  }
};
</script>

<template>
  <div
    class="group relative cursor-pointer rounded-xl border px-3.5 py-2.5 shadow-sm transition-all duration-200 select-none hover:shadow-md"
    :class="[
      kindMeta.card,
      isSelected ? 'ring-2 ring-slate-900 ring-offset-1' : '',
      isScenarioHit ? 'ring-2 ring-blue-500 shadow-md' : '',
      isDimmed ? 'opacity-25' : 'opacity-100',
    ]"
    :style="{ width: `${props.data.estimatedWidth}px` }"
    @click="onSelectNode"
    @dblclick.stop="onToggleBranch"
  >
    <Handle
      type="target"
      :position="targetPosition ?? Position.Left"
      class="!h-2 !w-2 !border-white !bg-slate-400"
    />

    <div class="mb-1.5 flex items-center justify-between gap-1.5">
      <div class="flex min-w-0 items-center gap-1">
        <span
          class="inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide"
          :class="kindMeta.badge"
        >
          {{ kindMeta.label }}
        </span>
        <span
          v-if="isTechNode"
          class="inline-flex shrink-0 items-center rounded-md border border-slate-300 bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700"
        >
          Kỹ thuật
        </span>
        <span
          v-if="enableTechMode && hasMiniAppBridge && props.data.kind !== 'miniapp'"
          class="inline-flex shrink-0 items-center rounded-md border border-cyan-300 bg-cyan-50 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-800"
        >
          Mini App
        </span>
      </div>

      <span
        v-if="visibleMedia.length > 0"
        class="inline-flex shrink-0 items-center gap-0.5 rounded bg-white/80 px-1 py-0.5 text-[10px] font-medium text-slate-600"
        title="Có ảnh / video minh họa"
      >
        <Film v-if="firstMedia?.type === 'video'" class="h-3 w-3" />
        <ImageIcon v-else class="h-3 w-3" />
        <span v-if="visibleMedia.length > 1">{{ visibleMedia.length }}</span>
      </span>
    </div>

    <div class="line-clamp-2 text-[13px] leading-snug font-semibold text-slate-900">
      {{ props.data.label }}
    </div>

    <div
      v-if="showThumbnail && firstMedia"
      class="mt-2 h-20 w-full overflow-hidden rounded-lg border border-slate-200/80 bg-white"
    >
      <video
        v-if="firstMedia.type === 'video'"
        :src="firstMedia.src"
        autoplay
        loop
        muted
        playsinline
        class="h-full w-full object-cover"
        @error="mediaError = true"
      />
      <img
        v-else
        :src="firstMedia.src"
        :alt="firstMedia.caption"
        loading="lazy"
        class="h-full w-full object-cover"
        @error="mediaError = true"
      />
    </div>

    <button
      v-if="canExpand && childCount > 0"
      type="button"
      :aria-label="isExpanded ? 'Thu gọn nhánh' : 'Bung nhánh con'"
      :title="isExpanded ? 'Thu gọn nhánh con' : `Bung ${childCount} bước con`"
      class="absolute top-1/2 -right-3.5 z-10 flex h-7 min-w-7 -translate-y-1/2 items-center justify-center rounded-full border border-slate-300 bg-white px-1.5 text-[11px] font-bold text-slate-700 shadow-sm transition hover:border-indigo-500 hover:bg-indigo-600 hover:text-white"
      @click.stop="onToggleBranch"
    >
      {{ isExpanded ? '−' : `+${childCount}` }}
    </button>

    <Handle
      type="source"
      :position="sourcePosition ?? Position.Right"
      class="!h-2 !w-2 !border-white !bg-slate-400"
    />
  </div>
</template>
