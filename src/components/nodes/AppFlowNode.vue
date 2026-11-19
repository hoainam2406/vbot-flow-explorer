<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import { Film, Image as ImageIcon } from 'lucide-vue-next';
import { FLOW_EXPLORER_KEY, getVisibleMedia } from '../../composables/useFlowExplorer';
import { getNodeDisplayLabel } from '../../core/graphEngine';
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

const platformBadge = computed<{ label: string; cls: string } | null>(() => {
  if (!__ENABLE_TECH_MODE__ || explorer.audienceMode.value !== 'tech') return null;
  const platforms = props.data.platforms;
  if (platforms?.length === 1) {
    if (platforms[0] === 'ios') {
      return { label: 'iOS', cls: 'border-slate-700 bg-slate-800 text-white' };
    }
    return { label: 'Android', cls: 'border-emerald-700 bg-emerald-600 text-white' };
  }
  if (explorer.platformMode.value === 'compare') {
    const detail = props.data.techDetail;
    const hasDiff = Boolean(
      detail?.platformDiffNote ||
        detail?.byPlatform?.android ||
        detail?.miniAppBridge?.messages.some((m) => m.hostFnByPlatform?.android || m.parityNote),
    );
    if (hasDiff) {
      return {
        label: 'iOS ≠ Android',
        cls: 'border-amber-300 bg-amber-100 text-amber-900',
      };
    }
  }
  return null;
});

const visibleMedia = computed(() => getVisibleMedia(props.data, explorer.audienceMode.value));
const firstMedia = computed(() => visibleMedia.value[0] ?? null);
const mediaError = ref(false);
const hasRealMedia = computed(() => explorer.dataset.hasRealMedia !== false);
const displayLabel = computed(() =>
  getNodeDisplayLabel(props.data, explorer.audienceMode.value),
);

watch(
  () => firstMedia.value?.src,
  () => {
    mediaError.value = false;
  },
);

const showThumbnail = computed(
  () =>
    hasRealMedia.value &&
    explorer.showCanvasMedia.value &&
    Boolean(firstMedia.value) &&
    !mediaError.value,
);

const canExpand = computed(() => explorer.hasSubtree(props.data.id));
const isExpanded = computed(() => explorer.expandedIds.value.has(props.data.id));
const childCount = computed(() => (canExpand.value ? explorer.getChildCount(props.data.id) : 0));
const isSelected = computed(
  () => explorer.selectedNodeId.value === props.data.id || Boolean(props.selected),
);

const activeScenario = computed(() => explorer.activeScenario.value);
const scenarioStepIndex = computed(() =>
  activeScenario.value ? activeScenario.value.nodeIds.indexOf(props.data.id) : -1,
);
const scenarioStepNumber = computed(() =>
  scenarioStepIndex.value >= 0 ? scenarioStepIndex.value + 1 : null,
);
const activeStepIdx = computed(() => explorer.activeScenarioStepIndex.value);
const isScenarioHit = computed(() => scenarioStepIndex.value >= 0);
const isCurrentScenarioStep = computed(
  () =>
    isScenarioHit.value &&
    activeStepIdx.value !== null &&
    scenarioStepIndex.value === activeStepIdx.value,
);
const isUpcomingScenarioStep = computed(
  () =>
    isScenarioHit.value &&
    activeStepIdx.value !== null &&
    scenarioStepIndex.value > activeStepIdx.value,
);

const scenarioCardClass = computed(() => {
  if (!activeScenario.value) return '';
  if (!isScenarioHit.value) return 'opacity-20';
  if (isCurrentScenarioStep.value) return 'ring-2 ring-blue-600 ring-offset-2 shadow-lg';
  if (isUpcomingScenarioStep.value) return 'opacity-70 ring-1 ring-blue-300';
  return 'ring-2 ring-blue-500 shadow-md';
});

const onSelectNode = () => {
  explorer.selectNode(props.data.id);
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
      scenarioCardClass,
    ]"
    :style="{ width: `${props.data.estimatedWidth}px` }"
    @click="onSelectNode"
    @dblclick.stop="onToggleBranch"
  >
    <span
      v-if="scenarioStepNumber !== null"
      class="absolute -top-2.5 -left-2.5 z-10 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold shadow-sm"
      :class="
        isCurrentScenarioStep
          ? 'bg-blue-600 text-white ring-2 ring-white'
          : isUpcomingScenarioStep
            ? 'border border-blue-300 bg-blue-50 text-blue-700'
            : 'bg-blue-500 text-white'
      "
    >
      {{ scenarioStepNumber }}
    </span>
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
        <span
          v-if="platformBadge"
          class="inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold"
          :class="platformBadge.cls"
        >
          {{ platformBadge.label }}
        </span>
      </div>

      <span
        v-if="hasRealMedia && visibleMedia.length > 0"
        class="inline-flex shrink-0 items-center gap-0.5 rounded bg-white/80 px-1 py-0.5 text-[10px] font-medium text-slate-600"
        title="Có ảnh / video minh họa"
      >
        <Film v-if="firstMedia?.type === 'video'" class="h-3 w-3" />
        <ImageIcon v-else class="h-3 w-3" />
        <span v-if="visibleMedia.length > 1">{{ visibleMedia.length }}</span>
      </span>
    </div>

    <div class="line-clamp-2 text-[13px] leading-snug font-semibold text-slate-900">
      {{ displayLabel }}
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
