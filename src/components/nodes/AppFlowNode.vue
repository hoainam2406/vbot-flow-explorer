<script setup lang="ts">
import { computed, inject, ref, watch, type Component } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import {
  AlertTriangle,
  Blocks,
  Cpu,
  Film,
  GitFork,
  Globe,
  Image as ImageIcon,
  Layers,
  MousePointerClick,
} from 'lucide-vue-next';
import { FLOW_EXPLORER_KEY, getVisibleMedia } from '../../composables/useFlowExplorer';
import { getNodeDisplayLabel } from '../../core/graphEngine';
import { resolveMediaUrl } from '../../core/mediaUrl';
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

interface KindStyleMeta {
  label: string;
  stripe: string;
  badge: string;
  icon: Component;
  liveDot?: boolean;
}

const KIND_STYLE_MAP: Record<NodeKind, KindStyleMeta> = {
  module: {
    label: 'Module',
    stripe: 'bg-indigo-500 dark:bg-indigo-400',
    badge: 'bg-indigo-500/12 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300',
    icon: Layers,
  },
  miniapp: {
    label: 'Mini App',
    stripe: 'bg-cyan-500 dark:bg-cyan-400',
    badge: 'bg-cyan-500/12 text-cyan-800 dark:bg-cyan-400/15 dark:text-cyan-300',
    icon: Blocks,
    liveDot: true,
  },
  action: {
    label: 'Thao tác',
    stripe: 'bg-blue-500 dark:bg-blue-400',
    badge: 'bg-blue-500/12 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300',
    icon: MousePointerClick,
  },
  process: {
    label: 'Xử lý',
    stripe: 'bg-violet-500 dark:bg-violet-400',
    badge: 'bg-violet-500/12 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300',
    icon: Cpu,
  },
  decision: {
    label: 'Điều kiện',
    stripe: 'bg-amber-500 dark:bg-amber-400',
    badge: 'bg-amber-500/15 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300',
    icon: GitFork,
  },
  external: {
    label: 'Hệ thống',
    stripe: 'bg-emerald-500 dark:bg-emerald-400',
    badge: 'bg-emerald-500/12 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300',
    icon: Globe,
    liveDot: true,
  },
  error: {
    label: 'Lỗi / Retry',
    stripe: 'bg-rose-500 dark:bg-rose-400',
    badge: 'bg-rose-500/12 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300',
    icon: AlertTriangle,
  },
};

const enableTechMode = __ENABLE_TECH_MODE__;
const kindMeta = computed(() => KIND_STYLE_MAP[props.data.kind]);
const isTechView = computed(() => enableTechMode && explorer.audienceMode.value === 'tech');
const isTechNode = computed(() => isTechView.value && props.data.audience === 'tech');

const hasMiniAppBridge = computed(() => {
  if (!__ENABLE_TECH_MODE__ || explorer.audienceMode.value !== 'tech') return false;
  return Boolean(props.data.techDetail?.miniAppBridge);
});

const techMicroStats = computed<Array<{ label: string; tone: string }>>(() => {
  if (!__ENABLE_TECH_MODE__ || explorer.audienceMode.value !== 'tech') return [];
  const detail = props.data.techDetail;
  if (!detail) return [];

  const plat = explorer.platformMode.value;
  const apiSet = new Set<string>(detail.apisOrEvents ?? []);
  const refSet = new Set<string>(detail.codeRefs ?? []);

  if (plat !== 'android' && detail.byPlatform?.ios) {
    for (const a of detail.byPlatform.ios.apisOrEvents ?? []) apiSet.add(a);
    for (const r of detail.byPlatform.ios.codeRefs ?? []) refSet.add(r);
  }
  if (plat !== 'ios' && detail.byPlatform?.android) {
    for (const a of detail.byPlatform.android.apisOrEvents ?? []) apiSet.add(a);
    for (const r of detail.byPlatform.android.codeRefs ?? []) refSet.add(r);
  }

  const stats: Array<{ label: string; tone: string }> = [];
  if (apiSet.size > 0) {
    stats.push({
      label: `API ${apiSet.size}`,
      tone: 'border-slate-200/80 bg-slate-100/80 text-slate-600 dark:border-slate-700/80 dark:bg-slate-800/80 dark:text-slate-300',
    });
  }
  const msgCount = detail.miniAppBridge?.messages.length ?? 0;
  if (msgCount > 0) {
    stats.push({
      label: `SDK ${msgCount}`,
      tone: 'border-cyan-200/80 bg-cyan-50/90 text-cyan-700 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-300',
    });
  }
  if (refSet.size > 0) {
    stats.push({
      label: `Files ${refSet.size}`,
      tone: 'border-indigo-200/80 bg-indigo-50/80 text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300',
    });
  }
  return stats;
});

const platformBadge = computed<{ label: string; cls: string } | null>(() => {
  if (!__ENABLE_TECH_MODE__ || explorer.audienceMode.value !== 'tech') return null;
  const platforms = props.data.platforms;
  if (platforms?.length === 1) {
    if (platforms[0] === 'ios') {
      return {
        label: 'iOS',
        cls: 'border-slate-700 bg-slate-800 text-white dark:border-slate-600 dark:bg-slate-700',
      };
    }
    return {
      label: 'Android',
      cls: 'border-emerald-700 bg-emerald-600 text-white dark:border-emerald-500/50 dark:bg-emerald-600/90',
    };
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
        cls: 'border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300',
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
const isVerticalLayout = computed(() => explorer.layoutDirection.value === 'TB');

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

const lineageState = computed<'none' | 'hit' | 'dim'>(() => {
  if (activeScenario.value) return 'none';
  const lineage = explorer.hoveredLineage.value;
  if (!lineage) return 'none';
  return lineage.nodeIds.has(props.data.id) ? 'hit' : 'dim';
});

const scenarioCardClass = computed(() => {
  if (!activeScenario.value) {
    if (lineageState.value === 'dim') return 'opacity-35 saturate-50';
    if (lineageState.value === 'hit') {
      return 'border-indigo-400/80 dark:border-cyan-400/70 shadow-md';
    }
    return '';
  }
  if (!isScenarioHit.value) return 'opacity-20';
  if (isCurrentScenarioStep.value) {
    return 'vbot-node-active-pulse ring-2 ring-blue-600 ring-offset-2 ring-offset-slate-50 dark:ring-cyan-400 dark:ring-offset-[#090d16] shadow-lg';
  }
  if (isUpcomingScenarioStep.value) {
    return 'opacity-70 ring-1 ring-blue-300 dark:ring-cyan-500/40';
  }
  return 'ring-2 ring-blue-500 dark:ring-cyan-500/75 shadow-md';
});

const onSelectNode = () => {
  explorer.selectNode(props.data.id);
};

const onToggleBranch = () => {
  if (canExpand.value && childCount.value > 0) {
    explorer.toggleExpand(props.data.id);
  }
};

const onMouseEnter = () => {
  explorer.setHoveredNode(props.data.id);
};

const onMouseLeave = () => {
  if (explorer.hoveredNodeId.value === props.data.id) {
    explorer.setHoveredNode(null);
  }
};
</script>

<template>
  <div
    class="group relative cursor-pointer rounded-xl border border-slate-200/90 bg-white/95 py-2.5 pr-3.5 pl-4 shadow-sm backdrop-blur-sm transition-all duration-200 select-none hover:border-slate-300 hover:shadow-md dark:border-slate-700/75 dark:bg-slate-900/92 dark:shadow-[0_6px_24px_-8px_rgba(0,0,0,0.75)] dark:hover:border-slate-500/80"
    :class="[
      isSelected
        ? 'ring-2 ring-indigo-500/90 ring-offset-2 ring-offset-slate-50 dark:ring-cyan-400/85 dark:ring-offset-[#090d16]'
        : '',
      scenarioCardClass,
    ]"
    :style="{ width: `${props.data.estimatedWidth}px` }"
    @click="onSelectNode"
    @dblclick.stop="onToggleBranch"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
  >
    <!-- Left accent stripe -->
    <span
      class="pointer-events-none absolute inset-y-0 left-0 w-[3.5px] rounded-l-xl"
      :class="kindMeta.stripe"
    />

    <span
      v-if="scenarioStepNumber !== null"
      class="absolute -top-2.5 -left-2.5 z-10 flex h-5 min-w-5 items-center justify-center rounded-full px-1 font-mono text-[10px] font-bold shadow-sm"
      :class="
        isCurrentScenarioStep
          ? 'bg-blue-600 text-white ring-2 ring-white dark:bg-cyan-500 dark:text-slate-950 dark:ring-slate-900'
          : isUpcomingScenarioStep
            ? 'border border-blue-300 bg-blue-50 text-blue-700 dark:border-cyan-500/40 dark:bg-slate-800 dark:text-cyan-300'
            : 'bg-blue-500 text-white dark:bg-cyan-600 dark:text-white'
      "
    >
      {{ scenarioStepNumber }}
    </span>

    <Handle
      type="target"
      :position="targetPosition ?? Position.Left"
      class="!h-2 !w-2 !border-white !bg-slate-400 dark:!border-slate-900 dark:!bg-slate-500"
    />

    <div class="mb-1.5 flex items-center justify-between gap-1.5">
      <div class="flex min-w-0 flex-wrap items-center gap-1">
        <span
          class="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide"
          :class="kindMeta.badge"
        >
          <component :is="kindMeta.icon" class="h-2.5 w-2.5 shrink-0" />
          <span>{{ kindMeta.label }}</span>
          <span
            v-if="kindMeta.liveDot"
            class="h-1.5 w-1.5 rounded-full bg-current opacity-80"
          />
        </span>

        <span
          v-if="isTechNode"
          class="inline-flex shrink-0 items-center rounded-md border border-slate-300/80 bg-slate-100/90 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 dark:border-slate-600/80 dark:bg-slate-800 dark:text-slate-300"
        >
          Kỹ thuật
        </span>

        <span
          v-if="enableTechMode && hasMiniAppBridge && props.data.kind !== 'miniapp'"
          class="inline-flex shrink-0 items-center rounded-md border border-cyan-300/80 bg-cyan-50 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-800 dark:border-cyan-500/35 dark:bg-cyan-500/10 dark:text-cyan-300"
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
        class="inline-flex shrink-0 items-center gap-0.5 rounded bg-slate-100/90 px-1 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
        title="Có ảnh / video minh họa"
      >
        <Film v-if="firstMedia?.type === 'video'" class="h-3 w-3" />
        <ImageIcon v-else class="h-3 w-3" />
        <span v-if="visibleMedia.length > 1">{{ visibleMedia.length }}</span>
      </span>
    </div>

    <div
      class="line-clamp-2 text-[13px] leading-snug font-semibold text-slate-900 dark:text-slate-100"
      :class="isTechView ? 'tracking-[-0.01em]' : ''"
    >
      {{ displayLabel }}
    </div>

    <div
      v-if="enableTechMode && techMicroStats.length > 0"
      class="mt-1.5 flex flex-wrap items-center gap-1"
    >
      <span
        v-for="stat in techMicroStats"
        :key="stat.label"
        class="rounded border px-1.5 py-0.2 font-mono text-[9.5px] font-medium"
        :class="stat.tone"
      >
        {{ stat.label }}
      </span>
    </div>

    <div
      v-if="showThumbnail && firstMedia"
      class="mt-2 h-20 w-full overflow-hidden rounded-lg border border-slate-200/80 bg-white dark:border-slate-700/80 dark:bg-slate-950"
    >
      <video
        v-if="firstMedia.type === 'video'"
        :src="resolveMediaUrl(firstMedia.src)"
        autoplay
        loop
        muted
        playsinline
        class="h-full w-full object-cover"
        @error="mediaError = true"
      />
      <img
        v-else
        :src="resolveMediaUrl(firstMedia.src)"
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
      class="absolute z-10 flex h-6 min-w-6 items-center justify-center rounded-full border border-slate-300 bg-white px-1.5 font-mono text-[10.5px] font-bold text-slate-700 shadow-sm transition hover:border-indigo-500 hover:bg-indigo-600 hover:text-white dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-cyan-400 dark:hover:bg-cyan-500 dark:hover:text-slate-950"
      :class="
        isVerticalLayout
          ? '-bottom-3 left-1/2 -translate-x-1/2'
          : 'top-1/2 -right-3 -translate-y-1/2'
      "
      @click.stop="onToggleBranch"
    >
      {{ isExpanded ? '−' : `+${childCount}` }}
    </button>

    <Handle
      type="source"
      :position="sourcePosition ?? Position.Right"
      class="!h-2 !w-2 !border-white !bg-slate-400 dark:!border-slate-900 dark:!bg-slate-500"
    />
  </div>
</template>
