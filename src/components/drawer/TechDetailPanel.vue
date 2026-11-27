<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue';
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Columns2,
  Copy,
  ExternalLink,
  Eye,
  FolderOpen,
  Network,
  PlayCircle,
} from 'lucide-vue-next';
import type { MiniAppBridgeLaunchContext } from '../MiniAppBridgeModal.vue';
import JsonCodeBlock from '../JsonCodeBlock.vue';
import { FLOW_EXPLORER_KEY } from '../../composables/useFlowExplorer';
import { useToast } from '../../composables/useToast';
import { MINI_APP_CATALOG } from '../../data/miniAppBridgeCatalog';
import { copyTextToClipboard } from '../../core/downloadHelper';
import type { ImpactAxis } from '../../core/impactAnalyzer';
import { detectCodeRefLanguage } from '../../core/jsonHighlight';
import {
  extractCodeRefsByPlatform,
  type SourcePeekLaunchContext,
} from '../../core/sourcePeekClient';
import {
  PARITY_FIX_TARGET_LABELS,
  PARITY_NEEDS_FIX_LABELS,
  PARITY_VERDICT_LABELS,
  resolveParityAssessment,
  type ParityCategory,
} from '../../core/parityAnalyzer';
import {
  buildGitWebFileUrl,
  buildIdeFileUrl,
  isSafeExternalUrl,
  loadDevWorkspaceSettings,
} from '../../core/workspaceSettings';
import type {
  AppRepoConfig,
  BridgeMessage,
  FlowNodeData,
  MiniAppBridge,
  PlatformTechDetail,
  PlatformViewMode,
} from '../../data/schema';

const props = defineProps<{
  node: FlowNodeData;
  platformMode: PlatformViewMode;
  repoConfig?: AppRepoConfig;
  techBranch?: string;
}>();

const explorer = inject(FLOW_EXPLORER_KEY, null);

const emit = defineEmits<{
  openMiniappBridge: [context: MiniAppBridgeLaunchContext];
  openSettings: [];
  openImpact: [context: { query: string; axis: ImpactAxis }];
  openSourcePeek: [context: SourcePeekLaunchContext];
}>();

const nodeRefsByPlatform = computed(() => extractCodeRefsByPlatform(props.node));
const hasAnyCodeRefs = computed(
  () => nodeRefsByPlatform.value.ios.length > 0 || nodeRefsByPlatform.value.android.length > 0,
);

const peekSingleCodeRef = (codeRef: string, preferredPlatform?: 'ios' | 'android') => {
  const grouped = nodeRefsByPlatform.value;
  emit('openSourcePeek', {
    title: props.node.techLabel || props.node.label,
    nodeId: props.node.id,
    iosRef: preferredPlatform === 'ios' ? codeRef : grouped.ios[0],
    androidRef: preferredPlatform === 'android' ? codeRef : grouped.android[0],
    iosRefs: grouped.ios,
    androidRefs: grouped.android,
  });
};

const peekCompareNodeCode = () => {
  const grouped = nodeRefsByPlatform.value;
  emit('openSourcePeek', {
    title: props.node.techLabel || props.node.label,
    nodeId: props.node.id,
    iosRef: grouped.ios[0],
    androidRef: grouped.android[0],
    iosRefs: grouped.ios,
    androidRefs: grouped.android,
  });
};

const AUTODIAL_NODE_SUBFLOW_MAP: Record<string, string> = {
  'maad-init': 'autodial-init-session',
  'maad-make-call': 'autodial-make-call',
  'maad-start': 'autodial-start',
  'maad-control': 'autodial-pause-resume',
  'maad-stop-state': 'autodial-stop-state',
  'maad-finish': 'autodial-finish-error',
  'maad-error': 'autodial-finish-error',
};

const resolveContextForMiniApp = (
  miniAppId: string,
  nodeId?: string,
): MiniAppBridgeLaunchContext => {
  if (miniAppId === 'vb-ma-autodial') {
    const subFlowId = (nodeId && AUTODIAL_NODE_SUBFLOW_MAP[nodeId]) ?? 'autodial-start';
    return { tab: 'simulator', flowId: 'flow-autodial', subFlowId, miniAppId };
  }
  if (miniAppId === 'vb-ma-monitoring') {
    return { tab: 'simulator', flowId: 'flow-monitoring', miniAppId };
  }
  if (miniAppId === 'vb-ma-user-contact') {
    return { tab: 'simulator', flowId: 'flow-user-contact', miniAppId };
  }
  if (miniAppId === 'vb-ma-2fa-setting' || miniAppId === 'vb-ma-user-history-call') {
    return { tab: 'simulator', flowId: 'flow-2fa-history', miniAppId };
  }
  if (miniAppId.includes('Global Hub')) {
    return { tab: 'catalog', miniAppId };
  }
  if (miniAppId.includes('Global')) {
    return { tab: 'simulator', flowId: 'flow-token-401', miniAppId };
  }
  if (miniAppId === 'vb-ma-contact-forward' || miniAppId.includes('vb-ma-crm')) {
    return { tab: 'simulator', flowId: 'flow-make-call', miniAppId };
  }
  const catalogEntry = MINI_APP_CATALOG.find((a) => a.id === miniAppId);
  if (catalogEntry?.simulatorFlowId) {
    return { tab: 'simulator', flowId: catalogEntry.simulatorFlowId, miniAppId };
  }
  if (catalogEntry) {
    return { tab: 'catalog', miniAppId };
  }
  return { tab: 'simulator', flowId: 'flow-token-401', miniAppId };
};

const { pushToast } = useToast();
const expandedMap = ref<Record<number, boolean>>({});
const copiedKey = ref<string | null>(null);
let copyResetTimer: ReturnType<typeof setTimeout> | null = null;

const copyValue = async (key: string, value: string) => {
  const ok = await copyTextToClipboard(value);
  if (ok) {
    copiedKey.value = key;
    pushToast('Đã sao chép vào clipboard', 'success');
    if (copyResetTimer) clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(() => {
      copiedKey.value = null;
    }, 1500);
  }
};

const openCodeRefInIde = (codeRef: string) => {
  const settings = loadDevWorkspaceSettings();
  const ideUrl = buildIdeFileUrl(codeRef, settings);
  if (!ideUrl) {
    pushToast('Chưa cấu hình đường dẫn local VBot-iOS/Android — hãy nhập trong Cài đặt Dev', 'info');
    emit('openSettings');
    return;
  }
  window.open(ideUrl, '_self');
};

const getCodeRefGitUrl = (codeRef: string): string | null => {
  const settings = loadDevWorkspaceSettings();
  return buildGitWebFileUrl(
    codeRef,
    settings,
    props.repoConfig ?? explorer?.dataset.app.repoConfig,
    props.techBranch ?? explorer?.dataset.app.techBranch,
  );
};

const nodeMetaStatusLabel: Record<string, string> = {
  stable: 'Ổn định',
  wip: 'Đang phát triển (WIP)',
  needs_review: 'Cần đối soát lại',
  deprecated: 'Đã cũ (Deprecated)',
};

onBeforeUnmount(() => {
  if (copyResetTimer) clearTimeout(copyResetTimer);
});

watch(
  () => props.node.id,
  () => {
    expandedMap.value = {};
    copiedKey.value = null;
  },
);

const isMessageOpen = (idx: number, total: number): boolean => {
  const manual = expandedMap.value[idx];
  if (manual !== undefined) return manual;
  return total <= 2 || idx === 0;
};

const toggleMessage = (idx: number, total: number) => {
  expandedMap.value = {
    ...expandedMap.value,
    [idx]: !isMessageOpen(idx, total),
  };
};

const mergeUnique = (...lists: Array<string[] | undefined>): string[] => {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const item of list ?? []) {
      if (!seen.has(item)) {
        seen.add(item);
        result.push(item);
      }
    }
  }
  return result;
};

const isCompare = computed(() => props.platformMode === 'compare');
const activeSinglePlatform = computed<'ios' | 'android'>(() =>
  props.platformMode === 'android' ? 'android' : 'ios',
);
const singleOnlyPlatform = computed<'ios' | 'android' | null>(() =>
  props.node.platforms?.length === 1 ? props.node.platforms[0] : null,
);

const platformDiffNote = computed(() => props.node.techDetail?.platformDiffNote ?? null);

const singlePlatformNotice = computed(() => {
  if (!isCompare.value || !singleOnlyPlatform.value) return null;
  return singleOnlyPlatform.value === 'ios'
    ? 'Bước này chỉ tồn tại trong luồng iOS (không chạy trên Android).'
    : 'Bước này chỉ tồn tại trong luồng Android (không chạy trên iOS).';
});

const iosSummary = computed(() => {
  if (singleOnlyPlatform.value === 'android') return null;
  return props.node.techDetail?.byPlatform?.ios?.summary ?? props.node.summary.tech ?? null;
});

const androidSummary = computed(() => {
  if (singleOnlyPlatform.value === 'ios') return null;
  return props.node.techDetail?.byPlatform?.android?.summary ?? props.node.summary.tech ?? null;
});

const parityAssessment = computed(() => {
  const categories: ParityCategory[] = [];
  if (singleOnlyPlatform.value === 'ios') categories.push('ios_only');
  else if (singleOnlyPlatform.value === 'android') categories.push('android_only');
  if (props.node.techDetail?.platformDiffNote) categories.push('behavior_diff');
  if (props.node.techDetail?.miniAppBridge?.messages.some((m) => m.parityNote)) {
    categories.push('bridge_parity');
  }
  if (categories.length === 0) return null;
  return resolveParityAssessment(props.node, categories);
});

const singleTechSummary = computed(() => {
  if (activeSinglePlatform.value === 'ios') {
    return iosSummary.value;
  }
  return (
    props.node.techDetail?.byPlatform?.android?.summary ?? props.node.summary.tech ?? null
  );
});

const singleHostLabel = computed(() =>
  activeSinglePlatform.value === 'ios'
    ? 'Hàm phía Host (iOS / Swift)'
    : 'Hàm phía Host (Android / Kotlin)',
);

const miniAppBridgeView = computed(() => {
  const bridge: MiniAppBridge | undefined = props.node.techDetail?.miniAppBridge;
  if (!bridge) return null;

  const embedLabels: Record<MiniAppBridge['embedMode'], string> = {
    inline_tab: 'Inline Tab',
    modal: 'Modal',
    sdk_global: 'Global SDK',
  };

  const dirMeta: Record<
    BridgeMessage['direction'],
    { from: string; to: string; tag: string; cls: string }
  > = {
    host_init: {
      from: 'Host App',
      to: 'Mini App (JS)',
      tag: 'Khởi tạo',
      cls: 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/35 dark:bg-indigo-500/15 dark:text-indigo-300',
    },
    host_to_miniapp: {
      from: 'Host App',
      to: 'Mini App (JS)',
      tag: 'Sự kiện',
      cls: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-300',
    },
    miniapp_to_host: {
      from: 'Mini App (JS)',
      to: 'Host App',
      tag: 'Gọi lệnh',
      cls: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-sky-500/35 dark:bg-sky-500/15 dark:text-sky-300',
    },
  };

  const transportIos =
    bridge.transportByPlatform?.ios ??
    (singleOnlyPlatform.value === 'android' ? undefined : bridge.transport);
  const transportAndroid =
    bridge.transportByPlatform?.android ??
    (singleOnlyPlatform.value === 'ios' ? undefined : bridge.transport);

  return {
    miniAppId: bridge.miniAppId,
    embedLabel: embedLabels[bridge.embedMode],
    transportIos,
    transportAndroid,
    hasTransportDiff: Boolean(
      bridge.transportByPlatform?.ios || bridge.transportByPlatform?.android,
    ),
    singleTransport:
      activeSinglePlatform.value === 'ios' ? transportIos : transportAndroid,
    messages: bridge.messages.map((msg) => {
      const iosHostFn =
        singleOnlyPlatform.value === 'android'
          ? undefined
          : (msg.hostFnByPlatform?.ios ?? msg.hostFn);
      const androidHostFn =
        singleOnlyPlatform.value === 'ios'
          ? undefined
          : (msg.hostFnByPlatform?.android ??
            (singleOnlyPlatform.value === 'android' ? msg.hostFn : undefined));
      const singleHostFn =
        activeSinglePlatform.value === 'ios'
          ? iosHostFn
          : (msg.hostFnByPlatform?.android ??
            (msg.parityNote ? undefined : msg.hostFn));

      return {
        ...msg,
        iosHostFn,
        androidHostFn,
        singleHostFn,
        dirFrom: dirMeta[msg.direction].from,
        dirTo: dirMeta[msg.direction].to,
        dirTag: dirMeta[msg.direction].tag,
        dirCls: dirMeta[msg.direction].cls,
      };
    }),
  };
});

type SectionKey = keyof Pick<
  PlatformTechDetail,
  'inputs' | 'outputs' | 'apisOrEvents' | 'edgeCases' | 'codeRefs'
>;

interface RenderedTechSection {
  key: SectionKey;
  title: string;
  mono: boolean;
  isSplit: boolean;
  sharedItems: string[];
  iosItems: string[];
  androidItems: string[];
}

const techSections = computed<RenderedTechSection[]>(() => {
  const detail = props.node.techDetail;
  if (!detail) return [];

  const specs: Array<{ key: SectionKey; title: string; mono: boolean }> = [
    { key: 'inputs', title: 'Inputs', mono: false },
    { key: 'outputs', title: 'Outputs', mono: false },
    { key: 'apisOrEvents', title: 'APIs / Events', mono: true },
    { key: 'edgeCases', title: 'Edge Cases', mono: false },
    { key: 'codeRefs', title: 'Code Refs', mono: true },
  ];

  const iosDetail = detail.byPlatform?.ios;
  const androidDetail = detail.byPlatform?.android;

  return specs
    .map((spec): RenderedTechSection | null => {
      const shared = detail[spec.key] ?? [];
      const iosExtra = iosDetail?.[spec.key] ?? [];
      const androidExtra = androidDetail?.[spec.key] ?? [];

      if (isCompare.value) {
        const hasPlatformSplit =
          iosExtra.length > 0 ||
          androidExtra.length > 0 ||
          (spec.key === 'codeRefs' && shared.length > 0 && androidExtra.length > 0);

        if (hasPlatformSplit) {
          const iosItems =
            spec.key === 'codeRefs'
              ? iosExtra.length > 0
                ? iosExtra
                : singleOnlyPlatform.value === 'android'
                  ? []
                  : shared
              : mergeUnique(shared, iosExtra);
          const androidItems =
            spec.key === 'codeRefs'
              ? androidExtra.length > 0
                ? androidExtra
                : singleOnlyPlatform.value === 'android'
                  ? shared
                  : []
              : mergeUnique(shared, androidExtra);

          if (iosItems.length === 0 && androidItems.length === 0) return null;
          return {
            key: spec.key,
            title: spec.title,
            mono: spec.mono,
            isSplit: true,
            sharedItems: [],
            iosItems,
            androidItems,
          };
        }

        const merged = mergeUnique(shared, iosExtra, androidExtra);
        if (merged.length === 0) return null;
        return {
          key: spec.key,
          title: spec.title,
          mono: spec.mono,
          isSplit: false,
          sharedItems: merged,
          iosItems: [],
          androidItems: [],
        };
      }

      if (activeSinglePlatform.value === 'ios') {
        const items =
          spec.key === 'codeRefs' && iosExtra.length > 0
            ? iosExtra
            : mergeUnique(shared, iosExtra);
        if (items.length === 0) return null;
        return {
          key: spec.key,
          title: spec.title,
          mono: spec.mono,
          isSplit: false,
          sharedItems: items,
          iosItems: [],
          androidItems: [],
        };
      }

      const androidItems =
        spec.key === 'codeRefs'
          ? androidExtra.length > 0
            ? androidExtra
            : singleOnlyPlatform.value === 'android'
              ? shared
              : []
          : mergeUnique(shared, androidExtra);
      if (androidItems.length === 0) return null;
      return {
        key: spec.key,
        title: spec.title,
        mono: spec.mono,
        isSplit: false,
        sharedItems: androidItems,
        iosItems: [],
        androidItems: [],
      };
    })
    .filter((s): s is RenderedTechSection => Boolean(s));
});
</script>

<template>
  <div
    v-if="props.node.meta"
    class="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-[11px] dark:border-slate-800 dark:bg-slate-900/70"
  >
    <span
      v-if="props.node.meta.status"
      class="rounded-md border px-2 py-0.5 font-semibold"
      :class="
        props.node.meta.status === 'wip'
          ? 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-300'
          : props.node.meta.status === 'needs_review'
            ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300'
            : props.node.meta.status === 'deprecated'
              ? 'border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400'
              : 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300'
      "
    >
      {{ nodeMetaStatusLabel[props.node.meta.status] ?? props.node.meta.status }}
    </span>
    <span v-if="props.node.meta.owner" class="text-slate-600 dark:text-slate-300">
      Phụ trách: <strong>{{ props.node.meta.owner }}</strong>
    </span>
    <span v-if="props.node.meta.lastVerifiedAt" class="font-mono text-slate-500 dark:text-slate-400">
      Kiểm: {{ props.node.meta.lastVerifiedAt }}
    </span>
    <a
      v-if="props.node.meta.workTaskUrl && isSafeExternalUrl(props.node.meta.workTaskUrl)"
      :href="props.node.meta.workTaskUrl"
      target="_blank"
      rel="noopener noreferrer"
      class="ml-auto inline-flex items-center gap-1 font-semibold text-indigo-600 hover:underline dark:text-cyan-300"
    >
      VBot Work
      <ExternalLink class="h-3 w-3" />
    </a>
  </div>

  <div
    v-if="isCompare"
    class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-200 bg-indigo-50/70 px-3.5 py-2 text-xs text-indigo-950 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200"
  >
    <span class="inline-flex items-center gap-1.5 font-bold">
      <Columns2 class="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
      Chế độ đối chiếu iOS (Swift) ↔ Android (Kotlin/Java)
    </span>
    <div class="flex flex-wrap items-center gap-1.5">
      <button
        v-if="hasAnyCodeRefs"
        type="button"
        class="inline-flex items-center gap-1 rounded-md border border-indigo-300 bg-white px-2 py-0.5 text-[11px] font-bold text-indigo-700 transition hover:bg-indigo-100 dark:border-cyan-500/40 dark:bg-slate-900 dark:text-cyan-300 dark:hover:bg-slate-800"
        @click="peekCompareNodeCode"
      >
        <Code2 class="h-3 w-3" />
        Soi Code Swift ↔ Kotlin
      </button>
      <span class="rounded bg-white px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-slate-800 dark:text-indigo-300">
        Cột trái: iOS · Cột phải: Android
      </span>
    </div>
  </div>

  <div
    v-if="singlePlatformNotice"
    class="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-300"
  >
    {{ singlePlatformNotice }}
  </div>

  <div
    v-if="platformDiffNote"
    class="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs leading-relaxed text-amber-950 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-200"
  >
    <AlertTriangle class="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
    <div>
      <div class="text-[11px] font-bold tracking-wide text-amber-800 uppercase dark:text-amber-300">
        Điểm khác biệt iOS ↔ Android
      </div>
      <p class="mt-0.5">{{ platformDiffNote }}</p>
    </div>
  </div>

  <div
    v-if="parityAssessment"
    class="space-y-2 rounded-xl border p-3 text-xs leading-relaxed"
    :class="
      parityAssessment.verdict === 'action_needed'
        ? 'border-rose-200 bg-rose-50/80 text-rose-950 dark:border-rose-500/35 dark:bg-rose-500/10 dark:text-rose-100'
        : parityAssessment.verdict === 'logic_diff'
          ? 'border-amber-200 bg-amber-50/75 text-amber-950 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-100'
          : parityAssessment.verdict === 'os_impl_only'
            ? 'border-sky-200 bg-sky-50/80 text-sky-950 dark:border-sky-500/35 dark:bg-sky-500/10 dark:text-sky-100'
            : 'border-emerald-200 bg-emerald-50/80 text-emerald-950 dark:border-emerald-500/35 dark:bg-emerald-500/10 dark:text-emerald-100'
    "
  >
    <div class="flex flex-wrap items-center justify-between gap-1.5">
      <span class="text-[11px] font-bold tracking-wide uppercase">
        {{ PARITY_VERDICT_LABELS[parityAssessment.verdict] }}
      </span>
      <span
        class="rounded border px-2 py-0.5 text-[10px] font-bold"
        :class="
          parityAssessment.needsFix === 'yes'
            ? 'border-rose-400 bg-rose-600 text-white'
            : parityAssessment.needsFix === 'consider'
              ? 'border-amber-400 bg-amber-500 text-white'
              : 'border-emerald-300 bg-white/85 text-emerald-800 dark:border-emerald-500/40 dark:bg-slate-900 dark:text-emerald-300'
        "
      >
        {{ PARITY_NEEDS_FIX_LABELS[parityAssessment.needsFix] }}
      </span>
    </div>
    <div class="flex flex-wrap gap-2 text-[11px] font-semibold">
      <span>Logic: {{ parityAssessment.sameLogic ? 'Giống nhau' : 'Khác nhau' }}</span>
      <span>·</span>
      <span>Kết quả: {{ parityAssessment.sameOutcome ? 'Giống nhau' : 'Khác nhau' }}</span>
      <span>·</span>
      <span>Bên cần sửa: {{ PARITY_FIX_TARGET_LABELS[parityAssessment.fixTarget] }}</span>
    </div>
    <p class="text-[11.5px] opacity-95">{{ parityAssessment.explanation }}</p>
    <p class="border-t border-black/10 pt-1.5 text-[11px] font-medium dark:border-white/10">
      <strong>Khuyến nghị:</strong> {{ parityAssessment.recommendation }}
    </p>
  </div>

  <section
    v-if="isCompare && (iosSummary || androidSummary)"
    class="space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-slate-900/70"
  >
    <h3 class="text-xs font-bold tracking-wide text-slate-700 uppercase dark:text-slate-300">
      Chi tiết xử lý kỹ thuật (iOS vs Android)
    </h3>
    <div class="grid grid-cols-1 gap-2.5 md:grid-cols-2">
      <div class="rounded-lg border border-slate-300 bg-white p-3 dark:border-slate-700/80 dark:bg-slate-900">
        <div class="mb-1 text-[10px] font-bold tracking-wide text-slate-700 uppercase dark:text-indigo-300">
          iOS (Swift)
        </div>
        <p v-if="iosSummary" class="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
          {{ iosSummary }}
        </p>
        <p v-else class="text-xs italic text-slate-400 dark:text-slate-500">
          Không áp dụng trên iOS (chỉ Android)
        </p>
      </div>

      <div class="rounded-lg border border-emerald-200 bg-emerald-50/35 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/8">
        <div class="mb-1 text-[10px] font-bold tracking-wide text-emerald-700 uppercase dark:text-emerald-300">
          Android (Kotlin / Java)
        </div>
        <p v-if="androidSummary" class="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
          {{ androidSummary }}
        </p>
        <p v-else class="text-xs italic text-slate-400 dark:text-slate-500">
          Không áp dụng trên Android (chỉ iOS)
        </p>
      </div>
    </div>
  </section>

  <section
    v-else-if="!isCompare && singleTechSummary"
    class="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-900/70"
  >
    <h3 class="text-xs font-bold tracking-wide text-slate-700 uppercase dark:text-slate-300">
      Chi tiết xử lý kỹ thuật ({{ activeSinglePlatform === 'ios' ? 'iOS' : 'Android' }})
    </h3>
    <p class="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
      {{ singleTechSummary }}
    </p>
  </section>

  <section
    v-if="miniAppBridgeView"
    class="space-y-3 rounded-xl border border-cyan-200 bg-cyan-50/40 p-3.5 dark:border-cyan-500/30 dark:bg-cyan-500/8"
  >
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="flex items-center gap-1.5 text-xs font-bold tracking-wide text-cyan-900 uppercase dark:text-cyan-300">
        <ArrowLeftRight class="h-3.5 w-3.5 text-cyan-700 dark:text-cyan-400" />
        Giao tiếp Host App ↔ Mini App
      </h3>
      <div class="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-cyan-500/35 dark:bg-cyan-500/15 dark:text-cyan-300 dark:hover:bg-cyan-500/25"
          @click="
            emit('openMiniappBridge', resolveContextForMiniApp(miniAppBridgeView.miniAppId, props.node.id))
          "
        >
          <PlayCircle class="h-3 w-3" />
          Chạy thử & Spec ↗
        </button>
        <span class="rounded-md border border-cyan-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-cyan-800 dark:border-cyan-500/30 dark:bg-slate-900 dark:text-cyan-300">
          {{ miniAppBridgeView.embedLabel }}
        </span>
      </div>
    </div>

    <div class="space-y-1.5 text-xs">
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="font-medium text-slate-600 dark:text-slate-400">Mini App ID:</span>
        <code class="rounded border border-cyan-200 bg-white px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-800 dark:border-cyan-500/30 dark:bg-slate-900 dark:text-cyan-300">
          {{ miniAppBridgeView.miniAppId }}
        </code>
      </div>

      <div
        v-if="isCompare && miniAppBridgeView.hasTransportDiff"
        class="grid grid-cols-1 gap-2 md:grid-cols-2"
      >
        <div class="rounded border border-slate-200 bg-white/90 px-2.5 py-1.5 text-[11px] text-slate-700 dark:border-slate-700/80 dark:bg-slate-900/90 dark:text-slate-300">
          <span class="font-bold text-slate-700 dark:text-indigo-300">Transport iOS:</span>
          <span class="ml-1">{{ miniAppBridgeView.transportIos || 'Không áp dụng' }}</span>
        </div>
        <div class="rounded border border-emerald-200 bg-emerald-50/50 px-2.5 py-1.5 text-[11px] text-slate-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-slate-300">
          <span class="font-bold text-emerald-700 dark:text-emerald-300">Transport Android:</span>
          <span class="ml-1">{{ miniAppBridgeView.transportAndroid || 'Không áp dụng' }}</span>
        </div>
      </div>

      <p
        v-else-if="isCompare ? miniAppBridgeView.transportIos : miniAppBridgeView.singleTransport"
        class="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300"
      >
        {{ isCompare ? miniAppBridgeView.transportIos : miniAppBridgeView.singleTransport }}
      </p>
    </div>

    <ul class="space-y-2.5">
      <li
        v-for="(msg, idx) in miniAppBridgeView.messages"
        :key="`${msg.direction}-${msg.name}-${idx}`"
        class="overflow-hidden rounded-lg border border-slate-200 bg-white text-xs shadow-2xs dark:border-slate-700/80 dark:bg-slate-900/90"
      >
        <button
          type="button"
          class="flex w-full items-start justify-between gap-2 p-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/70"
          :aria-expanded="isMessageOpen(idx, miniAppBridgeView.messages.length)"
          @click="toggleMessage(idx, miniAppBridgeView.messages.length)"
        >
          <div class="min-w-0 flex-1 space-y-1">
            <div class="flex flex-wrap items-center gap-1.5">
              <span
                class="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold"
                :class="msg.dirCls"
              >
                <span>{{ msg.dirFrom }}</span>
                <ArrowRight class="h-2.5 w-2.5 shrink-0" />
                <span>{{ msg.dirTo }}</span>
              </span>
              <span class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {{ msg.dirTag }}
              </span>
              <span
                v-if="msg.parityNote"
                class="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
              >
                Lệch parity
              </span>
            </div>
            <div class="font-mono text-[12px] font-bold break-all text-slate-900 dark:text-slate-100">
              {{ msg.name }}
            </div>
          </div>

          <span class="mt-0.5 shrink-0 rounded p-0.5 text-slate-400">
            <ChevronDown
              v-if="isMessageOpen(idx, miniAppBridgeView.messages.length)"
              class="h-4 w-4"
            />
            <ChevronRight v-else class="h-4 w-4" />
          </span>
        </button>

        <div
          v-if="isMessageOpen(idx, miniAppBridgeView.messages.length)"
          class="space-y-2.5 border-t border-slate-100 px-2.5 pt-2.5 pb-3 dark:border-slate-800"
        >
          <div v-if="isCompare" class="space-y-1.5">
            <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
              <div class="rounded-md border border-indigo-100 bg-indigo-50/50 px-2.5 py-1.5 dark:border-indigo-500/30 dark:bg-indigo-500/10">
                <div class="text-[10px] font-bold tracking-wide text-indigo-700 uppercase dark:text-indigo-300">
                  Hàm Host iOS (Swift)
                </div>
                <code
                  v-if="msg.iosHostFn"
                  class="mt-0.5 block font-mono text-[11px] leading-snug break-all text-slate-800 dark:text-slate-200"
                >
                  {{ msg.iosHostFn }}
                </code>
                <span v-else class="mt-0.5 block text-[11px] italic text-slate-400 dark:text-slate-500">
                  Không áp dụng trên iOS
                </span>
              </div>

              <div class="rounded-md border border-emerald-200 bg-emerald-50/45 px-2.5 py-1.5 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                <div class="text-[10px] font-bold tracking-wide text-emerald-700 uppercase dark:text-emerald-300">
                  Hàm Host Android (Kotlin / Java)
                </div>
                <code
                  v-if="msg.androidHostFn"
                  class="mt-0.5 block font-mono text-[11px] leading-snug break-all text-slate-800 dark:text-slate-200"
                >
                  {{ msg.androidHostFn }}
                </code>
                <span v-else-if="msg.parityNote" class="mt-0.5 block text-[11px] font-medium text-rose-700 dark:text-rose-300">
                  Chưa triển khai / Không gọi trên Android
                </span>
                <span v-else class="mt-0.5 block text-[11px] italic text-slate-400 dark:text-slate-500">
                  {{ singleOnlyPlatform === 'ios' ? 'Không áp dụng trên Android' : 'Chưa tách riêng' }}
                </span>
              </div>
            </div>

            <div
              v-if="msg.miniAppFn"
              class="rounded-md border border-cyan-100 bg-cyan-50/50 px-2.5 py-1.5 dark:border-cyan-500/30 dark:bg-cyan-500/10"
            >
              <div class="text-[10px] font-bold tracking-wide text-cyan-700 uppercase dark:text-cyan-300">
                Hàm phía Mini App (JS / SDK — dùng chung iOS & Android)
              </div>
              <code class="mt-0.5 block font-mono text-[11px] leading-snug break-all text-slate-800 dark:text-slate-200">
                {{ msg.miniAppFn }}
              </code>
            </div>
          </div>

          <div v-else class="space-y-1.5">
            <div
              v-if="msg.singleHostFn || msg.parityNote"
              class="rounded-md border px-2.5 py-1.5"
              :class="
                activeSinglePlatform === 'ios'
                  ? 'border-indigo-100 bg-indigo-50/50 dark:border-indigo-500/30 dark:bg-indigo-500/10'
                  : 'border-emerald-200 bg-emerald-50/45 dark:border-emerald-500/30 dark:bg-emerald-500/10'
              "
            >
              <div
                class="text-[10px] font-bold tracking-wide uppercase"
                :class="activeSinglePlatform === 'ios' ? 'text-indigo-700 dark:text-indigo-300' : 'text-emerald-700 dark:text-emerald-300'"
              >
                {{ singleHostLabel }}
              </div>
              <code
                v-if="msg.singleHostFn"
                class="mt-0.5 block font-mono text-[11px] leading-snug break-all text-slate-800 dark:text-slate-200"
              >
                {{ msg.singleHostFn }}
              </code>
              <span v-else class="mt-0.5 block text-[11px] font-medium text-rose-700 dark:text-rose-300">
                Chưa triển khai / Không gọi trên Android
              </span>
            </div>

            <div
              v-if="msg.miniAppFn"
              class="rounded-md border border-cyan-100 bg-cyan-50/50 px-2.5 py-1.5 dark:border-cyan-500/30 dark:bg-cyan-500/10"
            >
              <div class="text-[10px] font-bold tracking-wide text-cyan-700 uppercase dark:text-cyan-300">
                Hàm phía Mini App (JS / SDK)
              </div>
              <code class="mt-0.5 block font-mono text-[11px] leading-snug break-all text-slate-800 dark:text-slate-200">
                {{ msg.miniAppFn }}
              </code>
            </div>
          </div>

          <p
            v-if="msg.parityNote"
            class="rounded-md border border-rose-200 bg-rose-50/75 px-2.5 py-1.5 text-[11px] leading-relaxed text-rose-900 dark:border-rose-500/35 dark:bg-rose-500/10 dark:text-rose-200"
          >
            <span class="font-bold">Ghi chú Parity iOS ↔ Android: </span>
            {{ msg.parityNote }}
          </p>

          <div v-if="msg.examplePayload || msg.payload" class="space-y-1">
            <div class="flex flex-wrap items-center justify-between gap-1 text-[11px]">
              <span class="font-semibold text-slate-700 dark:text-slate-300">
                {{ msg.examplePayload ? 'Ví dụ dữ liệu truyền vào (JSON)' : 'Tham số truyền (Schema)' }}
              </span>
              <button
                v-if="msg.examplePayload"
                type="button"
                class="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                @click="copyValue(`payload-${idx}`, msg.examplePayload)"
              >
                <Check v-if="copiedKey === `payload-${idx}`" class="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                <Copy v-else class="h-3 w-3" />
                {{ copiedKey === `payload-${idx}` ? 'Đã copy' : 'Copy' }}
              </button>
            </div>
            <JsonCodeBlock v-if="msg.examplePayload" :code="msg.examplePayload" />
            <div
              v-if="msg.payload"
              class="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300"
            >
              <span v-if="msg.examplePayload" class="font-medium text-slate-500 dark:text-slate-400">Schema: </span>
              <code class="font-mono break-all text-slate-700 dark:text-slate-200">{{ msg.payload }}</code>
            </div>
          </div>

          <div v-if="msg.exampleResponse || msg.response" class="space-y-1">
            <div class="flex flex-wrap items-center justify-between gap-1 text-[11px]">
              <span class="font-semibold text-slate-700 dark:text-slate-300">
                {{ msg.exampleResponse ? 'Ví dụ dữ liệu trả về (JSON)' : 'Dữ liệu trả về (Schema)' }}
              </span>
              <button
                v-if="msg.exampleResponse"
                type="button"
                class="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                @click="copyValue(`response-${idx}`, msg.exampleResponse)"
              >
                <Check v-if="copiedKey === `response-${idx}`" class="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                <Copy v-else class="h-3 w-3" />
                {{ copiedKey === `response-${idx}` ? 'Đã copy' : 'Copy' }}
              </button>
            </div>
            <JsonCodeBlock v-if="msg.exampleResponse" :code="msg.exampleResponse" />
            <div
              v-if="msg.response"
              class="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300"
            >
              <span v-if="msg.exampleResponse" class="font-medium text-slate-500 dark:text-slate-400">Schema: </span>
              <code class="font-mono break-all text-slate-700 dark:text-slate-200">{{ msg.response }}</code>
            </div>
          </div>

          <p
            v-if="msg.note"
            class="rounded-md border border-amber-200/80 bg-amber-50/70 px-2.5 py-1.5 text-[11px] leading-relaxed text-slate-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
          >
            {{ msg.note }}
          </p>
        </div>
      </li>
    </ul>
  </section>

  <template v-if="techSections.length > 0">
    <section
      v-for="section in techSections"
      :key="section.key"
      class="space-y-1.5"
    >
      <h3 class="text-xs font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400">
        {{ section.title }}
      </h3>

      <div v-if="section.isSplit" class="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        <div class="space-y-1.5">
          <div class="text-[10px] font-bold tracking-wide text-slate-600 uppercase dark:text-indigo-300">
            iOS
          </div>
          <ul v-if="section.iosItems.length > 0" class="space-y-1.5">
            <li
              v-for="item in section.iosItems"
              :key="`ios-${item}`"
              class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300"
              :class="[
                section.mono ? 'font-mono break-all text-slate-800 dark:text-slate-200' : 'leading-relaxed',
                section.key === 'codeRefs' ? 'flex items-start justify-between gap-2' : '',
              ]"
            >
              <div :class="section.key === 'codeRefs' ? 'min-w-0 flex-1 space-y-1' : ''">
                <span
                  v-if="section.key === 'codeRefs' && detectCodeRefLanguage(item)"
                  class="mr-1.5 inline-flex items-center rounded border px-1.5 py-0.2 font-sans text-[9.5px] font-bold"
                  :class="detectCodeRefLanguage(item)!.cls"
                >
                  {{ detectCodeRefLanguage(item)!.label }}
                </span>
                <span class="break-all">{{ item }}</span>
              </div>
              <div class="flex shrink-0 items-center gap-0.5">
                <button
                  v-if="section.key === 'codeRefs'"
                  type="button"
                  class="mt-0.5 rounded p-1 text-slate-400 transition hover:bg-white hover:text-cyan-600 dark:hover:bg-slate-800 dark:hover:text-cyan-300"
                  title="Xem nhanh mã nguồn ngay trong web (Source Peek)"
                  @click="peekSingleCodeRef(item, 'ios')"
                >
                  <Eye class="h-3.5 w-3.5" />
                </button>
                <button
                  v-if="section.key === 'codeRefs'"
                  type="button"
                  class="mt-0.5 rounded p-1 text-slate-400 transition hover:bg-white hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-cyan-300"
                  title="Mở file trong IDE (VS Code / Cursor)"
                  @click="openCodeRefInIde(item)"
                >
                  <FolderOpen class="h-3.5 w-3.5" />
                </button>
                <a
                  v-if="section.key === 'codeRefs' && getCodeRefGitUrl(item)"
                  :href="getCodeRefGitUrl(item)!"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="mt-0.5 rounded p-1 text-slate-400 transition hover:bg-white hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-cyan-300"
                  title="Mở file trên Git Web"
                >
                  <ExternalLink class="h-3.5 w-3.5" />
                </a>
                <button
                  v-if="section.key === 'codeRefs'"
                  type="button"
                  class="mt-0.5 rounded p-1 text-slate-400 transition hover:bg-white hover:text-cyan-600 dark:hover:bg-slate-800 dark:hover:text-cyan-300"
                  title="Phân tích ảnh hưởng file này"
                  @click="emit('openImpact', { query: item, axis: 'code_ref' })"
                >
                  <Network class="h-3.5 w-3.5" />
                </button>
                <button
                  v-if="section.key === 'codeRefs'"
                  type="button"
                  class="mt-0.5 shrink-0 rounded p-1 text-slate-400 transition hover:bg-white hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  :title="copiedKey === `ios-ref-${item}` ? 'Đã sao chép đường dẫn' : 'Sao chép đường dẫn file'"
                  @click="copyValue(`ios-ref-${item}`, item)"
                >
                  <Check v-if="copiedKey === `ios-ref-${item}`" class="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <Copy v-else class="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          </ul>
          <p v-else class="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs italic text-slate-400 dark:border-slate-700 dark:text-slate-500">
            Không có
          </p>
        </div>

        <div class="space-y-1.5">
          <div class="text-[10px] font-bold tracking-wide text-emerald-700 uppercase dark:text-emerald-300">
            Android
          </div>
          <ul v-if="section.androidItems.length > 0" class="space-y-1.5">
            <li
              v-for="item in section.androidItems"
              :key="`and-${item}`"
              class="rounded-lg border border-emerald-200 bg-emerald-50/40 px-3 py-2 text-xs text-slate-700 dark:border-emerald-500/30 dark:bg-emerald-500/8 dark:text-slate-300"
              :class="[
                section.mono ? 'font-mono break-all text-slate-800 dark:text-slate-200' : 'leading-relaxed',
                section.key === 'codeRefs' ? 'flex items-start justify-between gap-2' : '',
              ]"
            >
              <div :class="section.key === 'codeRefs' ? 'min-w-0 flex-1 space-y-1' : ''">
                <span
                  v-if="section.key === 'codeRefs' && detectCodeRefLanguage(item)"
                  class="mr-1.5 inline-flex items-center rounded border px-1.5 py-0.2 font-sans text-[9.5px] font-bold"
                  :class="detectCodeRefLanguage(item)!.cls"
                >
                  {{ detectCodeRefLanguage(item)!.label }}
                </span>
                <span class="break-all">{{ item }}</span>
              </div>
              <div class="flex shrink-0 items-center gap-0.5">
                <button
                  v-if="section.key === 'codeRefs'"
                  type="button"
                  class="mt-0.5 rounded p-1 text-slate-400 transition hover:bg-white hover:text-emerald-700 dark:hover:bg-slate-800 dark:hover:text-emerald-300"
                  title="Xem nhanh mã nguồn ngay trong web (Source Peek)"
                  @click="peekSingleCodeRef(item, 'android')"
                >
                  <Eye class="h-3.5 w-3.5" />
                </button>
                <button
                  v-if="section.key === 'codeRefs'"
                  type="button"
                  class="mt-0.5 rounded p-1 text-slate-400 transition hover:bg-white hover:text-emerald-700 dark:hover:bg-slate-800 dark:hover:text-emerald-300"
                  title="Mở file trong IDE (VS Code / Cursor)"
                  @click="openCodeRefInIde(item)"
                >
                  <FolderOpen class="h-3.5 w-3.5" />
                </button>
                <a
                  v-if="section.key === 'codeRefs' && getCodeRefGitUrl(item)"
                  :href="getCodeRefGitUrl(item)!"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="mt-0.5 rounded p-1 text-slate-400 transition hover:bg-white hover:text-emerald-700 dark:hover:bg-slate-800 dark:hover:text-emerald-300"
                  title="Mở file trên Git Web"
                >
                  <ExternalLink class="h-3.5 w-3.5" />
                </a>
                <button
                  v-if="section.key === 'codeRefs'"
                  type="button"
                  class="mt-0.5 rounded p-1 text-slate-400 transition hover:bg-white hover:text-cyan-600 dark:hover:bg-slate-800 dark:hover:text-cyan-300"
                  title="Phân tích ảnh hưởng file này"
                  @click="emit('openImpact', { query: item, axis: 'code_ref' })"
                >
                  <Network class="h-3.5 w-3.5" />
                </button>
                <button
                  v-if="section.key === 'codeRefs'"
                  type="button"
                  class="mt-0.5 shrink-0 rounded p-1 text-slate-400 transition hover:bg-white hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  :title="copiedKey === `and-ref-${item}` ? 'Đã sao chép đường dẫn' : 'Sao chép đường dẫn file'"
                  @click="copyValue(`and-ref-${item}`, item)"
                >
                  <Check v-if="copiedKey === `and-ref-${item}`" class="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <Copy v-else class="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          </ul>
          <p v-else class="rounded-lg border border-dashed border-emerald-200 px-3 py-2 text-xs italic text-slate-400 dark:border-emerald-500/30 dark:text-slate-500">
            Không có
          </p>
        </div>
      </div>

      <ul v-else class="space-y-1.5">
        <li
          v-for="item in section.sharedItems"
          :key="item"
          class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300"
          :class="[
            section.mono ? 'font-mono break-all text-slate-800 dark:text-slate-200' : 'leading-relaxed',
            section.key === 'codeRefs' ? 'flex items-start justify-between gap-2' : '',
          ]"
        >
          <div :class="section.key === 'codeRefs' || section.key === 'apisOrEvents' ? 'min-w-0 flex-1' : ''">
            <span
              v-if="section.key === 'codeRefs' && detectCodeRefLanguage(item)"
              class="mr-1.5 inline-flex items-center rounded border px-1.5 py-0.2 font-sans text-[9.5px] font-bold"
              :class="detectCodeRefLanguage(item)!.cls"
            >
              {{ detectCodeRefLanguage(item)!.label }}
            </span>
            <span class="break-all">{{ item }}</span>
          </div>
          <div
            v-if="section.key === 'codeRefs' || section.key === 'apisOrEvents'"
            class="flex shrink-0 items-center gap-0.5"
          >
            <button
              v-if="section.key === 'apisOrEvents'"
              type="button"
              class="rounded p-1 text-slate-400 transition hover:bg-white hover:text-cyan-600 dark:hover:bg-slate-800 dark:hover:text-cyan-300"
              title="Phân tích ảnh hưởng API / Sự kiện này"
              @click="emit('openImpact', { query: item, axis: 'api_event' })"
            >
              <Network class="h-3.5 w-3.5" />
            </button>
            <button
              v-if="section.key === 'codeRefs'"
              type="button"
              class="mt-0.5 rounded p-1 text-slate-400 transition hover:bg-white hover:text-cyan-600 dark:hover:bg-slate-800 dark:hover:text-cyan-300"
              title="Xem nhanh mã nguồn ngay trong web (Source Peek)"
              @click="peekSingleCodeRef(item)"
            >
              <Eye class="h-3.5 w-3.5" />
            </button>
            <button
              v-if="section.key === 'codeRefs'"
              type="button"
              class="mt-0.5 rounded p-1 text-slate-400 transition hover:bg-white hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-cyan-300"
              title="Mở file trong IDE (VS Code / Cursor)"
              @click="openCodeRefInIde(item)"
            >
              <FolderOpen class="h-3.5 w-3.5" />
            </button>
            <a
              v-if="section.key === 'codeRefs' && getCodeRefGitUrl(item)"
              :href="getCodeRefGitUrl(item)!"
              target="_blank"
              rel="noopener noreferrer"
              class="mt-0.5 rounded p-1 text-slate-400 transition hover:bg-white hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-cyan-300"
              title="Mở file trên Git Web"
            >
              <ExternalLink class="h-3.5 w-3.5" />
            </a>
            <button
              v-if="section.key === 'codeRefs'"
              type="button"
              class="mt-0.5 rounded p-1 text-slate-400 transition hover:bg-white hover:text-cyan-600 dark:hover:bg-slate-800 dark:hover:text-cyan-300"
              title="Phân tích ảnh hưởng file này"
              @click="emit('openImpact', { query: item, axis: 'code_ref' })"
            >
              <Network class="h-3.5 w-3.5" />
            </button>
            <button
              v-if="section.key === 'codeRefs'"
              type="button"
              class="mt-0.5 shrink-0 rounded p-1 text-slate-400 transition hover:bg-white hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              :title="copiedKey === `shared-ref-${item}` ? 'Đã sao chép đường dẫn' : 'Sao chép đường dẫn file'"
              @click="copyValue(`shared-ref-${item}`, item)"
            >
              <Check v-if="copiedKey === `shared-ref-${item}`" class="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <Copy v-else class="h-3.5 w-3.5" />
            </button>
          </div>
        </li>
      </ul>
    </section>
  </template>
</template>
