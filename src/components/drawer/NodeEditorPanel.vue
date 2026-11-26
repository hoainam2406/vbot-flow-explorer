<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Check, Code2, Plus, Trash2, X } from 'lucide-vue-next';
import {
  FlowNodeDataSchema,
  type AudienceScope,
  type BridgeMessage,
  type FlowNodeData,
  type NodeKind,
  type NodeStatus,
  type ParityFixTarget,
  type ParityNeedsFix,
  type ParityVerdict,
  type Platform,
} from '../../data/schema';

const props = defineProps<{
  node: FlowNodeData;
  canDelete: boolean;
}>();

const emit = defineEmits<{
  save: [node: FlowNodeData];
  deleteNode: [nodeId: string];
  cancel: [];
}>();

const tab = ref<'basic' | 'tech' | 'parity' | 'raw'>('basic');
const confirmDelete = ref(false);
const validationError = ref<string | null>(null);

// Basic fields
const label = ref('');
const techLabel = ref('');
const kind = ref<NodeKind>('action');
const audience = ref<AudienceScope>('all');
const hasIos = ref(true);
const hasAndroid = ref(true);
const overview = ref('');
const techSummary = ref('');
const metaStatus = ref<NodeStatus | ''>('');
const metaOwner = ref('');
const metaLastVerified = ref('');
const metaWorkTaskUrl = ref('');

// Tech fields
const platformDiffNote = ref('');
const apisText = ref('');
const edgeCasesText = ref('');
const codeRefsText = ref('');
const iosSummary = ref('');
const iosCodeRefsText = ref('');
const androidSummary = ref('');
const androidCodeRefsText = ref('');
const relatedIdsText = ref('');

// Parity & Bridge fields
const hasParityAssessment = ref(false);
const parityCode = ref('');
const parityVerdict = ref<ParityVerdict>('logic_diff');
const paritySameLogic = ref(false);
const paritySameOutcome = ref(false);
const parityNeedsFix = ref<ParityNeedsFix>('consider');
const parityFixTarget = ref<ParityFixTarget>('both');
const parityExplanation = ref('');
const parityRecommendation = ref('');

const hasMiniAppBridge = ref(false);
const bridgeMiniAppId = ref('');
const bridgeEmbedMode = ref<'inline_tab' | 'modal' | 'sdk_global'>('modal');
const bridgeTransportIos = ref('');
const bridgeTransportAndroid = ref('');
const bridgeMessages = ref<
  Array<{
    direction: 'host_init' | 'host_to_miniapp' | 'miniapp_to_host';
    name: string;
    hostFnIos: string;
    hostFnAndroid: string;
    miniAppFn: string;
    payload: string;
    response: string;
    parityNote: string;
  }>
>([]);

// Raw JSON tab
const rawJsonText = ref('');

const parseLines = (text: string): string[] =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

const syncFieldsFromNode = (n: FlowNodeData) => {
  label.value = n.label;
  techLabel.value = n.techLabel ?? '';
  kind.value = n.kind;
  audience.value = n.audience;
  hasIos.value = !n.platforms || n.platforms.includes('ios');
  hasAndroid.value = !n.platforms || n.platforms.includes('android');
  overview.value = n.summary.overview;
  techSummary.value = n.summary.tech ?? '';
  metaStatus.value = n.meta?.status ?? '';
  metaOwner.value = n.meta?.owner ?? '';
  metaLastVerified.value = n.meta?.lastVerifiedAt ?? '';
  metaWorkTaskUrl.value = n.meta?.workTaskUrl ?? '';

  platformDiffNote.value = n.techDetail?.platformDiffNote ?? '';
  apisText.value = (n.techDetail?.apisOrEvents ?? []).join('\n');
  edgeCasesText.value = (n.techDetail?.edgeCases ?? []).join('\n');
  codeRefsText.value = (n.techDetail?.codeRefs ?? []).join('\n');
  iosSummary.value = n.techDetail?.byPlatform?.ios?.summary ?? '';
  iosCodeRefsText.value = (n.techDetail?.byPlatform?.ios?.codeRefs ?? []).join('\n');
  androidSummary.value = n.techDetail?.byPlatform?.android?.summary ?? '';
  androidCodeRefsText.value = (n.techDetail?.byPlatform?.android?.codeRefs ?? []).join('\n');
  relatedIdsText.value = (n.relatedNodeIds ?? []).join(', ');

  const pa = n.techDetail?.parityAssessment;
  hasParityAssessment.value = Boolean(pa);
  parityCode.value = pa?.code ?? '';
  parityVerdict.value = pa?.verdict ?? 'logic_diff';
  paritySameLogic.value = pa?.sameLogic ?? false;
  paritySameOutcome.value = pa?.sameOutcome ?? false;
  parityNeedsFix.value = pa?.needsFix ?? 'consider';
  parityFixTarget.value = pa?.fixTarget ?? 'both';
  parityExplanation.value = pa?.explanation ?? '';
  parityRecommendation.value = pa?.recommendation ?? '';

  const br = n.techDetail?.miniAppBridge;
  hasMiniAppBridge.value = Boolean(br);
  bridgeMiniAppId.value = br?.miniAppId ?? '';
  bridgeEmbedMode.value = br?.embedMode ?? 'modal';
  bridgeTransportIos.value = br?.transportByPlatform?.ios ?? br?.transport ?? '';
  bridgeTransportAndroid.value = br?.transportByPlatform?.android ?? '';
  bridgeMessages.value = (br?.messages ?? []).map((m) => ({
    direction: m.direction,
    name: m.name,
    hostFnIos: m.hostFnByPlatform?.ios ?? m.hostFn ?? '',
    hostFnAndroid: m.hostFnByPlatform?.android ?? '',
    miniAppFn: m.miniAppFn ?? '',
    payload: m.payload ?? '',
    response: m.response ?? '',
    parityNote: m.parityNote ?? '',
  }));

  rawJsonText.value = JSON.stringify(n, null, 2);
  confirmDelete.value = false;
  validationError.value = null;
};

watch(
  () => props.node,
  (next) => {
    syncFieldsFromNode(next);
  },
  { immediate: true },
);

const buildNodeFromForm = (): FlowNodeData => {
  const base = JSON.parse(JSON.stringify(props.node)) as FlowNodeData;

  const platforms: Platform[] = [];
  if (hasIos.value) platforms.push('ios');
  if (hasAndroid.value) platforms.push('android');

  const nextMeta =
    metaStatus.value ||
    metaOwner.value.trim() ||
    metaLastVerified.value.trim() ||
    metaWorkTaskUrl.value.trim()
      ? {
          ...(metaStatus.value ? { status: metaStatus.value } : {}),
          ...(metaOwner.value.trim() ? { owner: metaOwner.value.trim() } : {}),
          ...(metaLastVerified.value.trim()
            ? { lastVerifiedAt: metaLastVerified.value.trim() }
            : {}),
          ...(metaWorkTaskUrl.value.trim()
            ? { workTaskUrl: metaWorkTaskUrl.value.trim() }
            : {}),
        }
      : undefined;

  const apis = parseLines(apisText.value);
  const edges = parseLines(edgeCasesText.value);
  const refs = parseLines(codeRefsText.value);
  const iosRefs = parseLines(iosCodeRefsText.value);
  const andRefs = parseLines(androidCodeRefsText.value);

  const nextIos =
    iosSummary.value.trim() || iosRefs.length > 0 || base.techDetail?.byPlatform?.ios
      ? {
          ...(base.techDetail?.byPlatform?.ios ?? {}),
          ...(iosSummary.value.trim() ? { summary: iosSummary.value.trim() } : {}),
          ...(iosRefs.length > 0 ? { codeRefs: iosRefs } : {}),
        }
      : undefined;
  if (nextIos && !iosSummary.value.trim()) delete nextIos.summary;
  if (nextIos && iosRefs.length === 0) delete nextIos.codeRefs;

  const nextAndroid =
    androidSummary.value.trim() || andRefs.length > 0 || base.techDetail?.byPlatform?.android
      ? {
          ...(base.techDetail?.byPlatform?.android ?? {}),
          ...(androidSummary.value.trim() ? { summary: androidSummary.value.trim() } : {}),
          ...(andRefs.length > 0 ? { codeRefs: andRefs } : {}),
        }
      : undefined;
  if (nextAndroid && !androidSummary.value.trim()) delete nextAndroid.summary;
  if (nextAndroid && andRefs.length === 0) delete nextAndroid.codeRefs;

  const nextByPlatform =
    (nextIos && Object.keys(nextIos).length > 0) ||
    (nextAndroid && Object.keys(nextAndroid).length > 0)
      ? {
          ...(nextIos && Object.keys(nextIos).length > 0 ? { ios: nextIos } : {}),
          ...(nextAndroid && Object.keys(nextAndroid).length > 0 ? { android: nextAndroid } : {}),
        }
      : undefined;

  const nextTechDetail = {
    ...(base.techDetail ?? {}),
  };
  if (platformDiffNote.value.trim()) nextTechDetail.platformDiffNote = platformDiffNote.value.trim();
  else delete nextTechDetail.platformDiffNote;
  if (apis.length > 0) nextTechDetail.apisOrEvents = apis;
  else delete nextTechDetail.apisOrEvents;
  if (edges.length > 0) nextTechDetail.edgeCases = edges;
  else delete nextTechDetail.edgeCases;
  if (refs.length > 0) nextTechDetail.codeRefs = refs;
  else delete nextTechDetail.codeRefs;
  if (nextByPlatform) nextTechDetail.byPlatform = nextByPlatform;
  else delete nextTechDetail.byPlatform;

  if (hasParityAssessment.value) {
    const cleanCode = parityCode.value.trim().toUpperCase();
    nextTechDetail.parityAssessment = {
      ...(cleanCode ? { code: cleanCode } : {}),
      verdict: parityVerdict.value,
      sameLogic: paritySameLogic.value,
      sameOutcome: paritySameOutcome.value,
      needsFix: parityNeedsFix.value,
      fixTarget: parityFixTarget.value,
      explanation: parityExplanation.value.trim(),
      recommendation: parityRecommendation.value.trim(),
    };
  } else {
    delete nextTechDetail.parityAssessment;
  }

  if (hasMiniAppBridge.value) {
    const messages: BridgeMessage[] = bridgeMessages.value
      .filter((m) => m.name.trim())
      .map((m) => {
        const hasPlatFns = m.hostFnIos.trim() || m.hostFnAndroid.trim();
        return {
          direction: m.direction,
          name: m.name.trim(),
          ...(m.hostFnIos.trim() ? { hostFn: m.hostFnIos.trim() } : {}),
          ...(hasPlatFns
            ? {
                hostFnByPlatform: {
                  ...(m.hostFnIos.trim() ? { ios: m.hostFnIos.trim() } : {}),
                  ...(m.hostFnAndroid.trim() ? { android: m.hostFnAndroid.trim() } : {}),
                },
              }
            : {}),
          ...(m.miniAppFn.trim() ? { miniAppFn: m.miniAppFn.trim() } : {}),
          ...(m.payload.trim() ? { payload: m.payload.trim() } : {}),
          ...(m.response.trim() ? { response: m.response.trim() } : {}),
          ...(m.parityNote.trim() ? { parityNote: m.parityNote.trim() } : {}),
        };
      });
    const hasTransPlat = bridgeTransportIos.value.trim() || bridgeTransportAndroid.value.trim();
    nextTechDetail.miniAppBridge = {
      miniAppId: bridgeMiniAppId.value.trim(),
      embedMode: bridgeEmbedMode.value,
      ...(bridgeTransportIos.value.trim() ? { transport: bridgeTransportIos.value.trim() } : {}),
      ...(hasTransPlat
        ? {
            transportByPlatform: {
              ...(bridgeTransportIos.value.trim() ? { ios: bridgeTransportIos.value.trim() } : {}),
              ...(bridgeTransportAndroid.value.trim()
                ? { android: bridgeTransportAndroid.value.trim() }
                : {}),
            },
          }
        : {}),
      messages,
    };
  } else {
    delete nextTechDetail.miniAppBridge;
  }

  const related = relatedIdsText.value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const result: FlowNodeData = {
    id: props.node.id,
    label: label.value.trim(),
    ...(techLabel.value.trim() ? { techLabel: techLabel.value.trim() } : {}),
    kind: kind.value,
    audience: audience.value,
    ...(platforms.length === 1 ? { platforms } : {}),
    summary: {
      overview: overview.value.trim(),
      ...(techSummary.value.trim() ? { tech: techSummary.value.trim() } : {}),
    },
    ...(base.media?.length ? { media: base.media } : {}),
    ...(Object.keys(nextTechDetail).length > 0 ? { techDetail: nextTechDetail } : {}),
    ...(related.length > 0 ? { relatedNodeIds: related } : {}),
    ...(nextMeta ? { meta: nextMeta } : {}),
  };
  return result;
};

const switchTab = (nextTab: 'basic' | 'tech' | 'parity' | 'raw') => {
  validationError.value = null;
  if (tab.value !== 'raw' && nextTab === 'raw') {
    rawJsonText.value = JSON.stringify(buildNodeFromForm(), null, 2);
  } else if (tab.value === 'raw' && nextTab !== 'raw') {
    try {
      const parsed = FlowNodeDataSchema.safeParse(JSON.parse(rawJsonText.value));
      if (parsed.success) {
        syncFieldsFromNode({ ...parsed.data, id: props.node.id });
      }
    } catch {
      // Keep existing form fields if raw JSON has syntax errors while switching
    }
  }
  tab.value = nextTab;
};

const addBridgeMessageRow = () => {
  bridgeMessages.value = [
    ...bridgeMessages.value,
    {
      direction: 'miniapp_to_host',
      name: '',
      hostFnIos: '',
      hostFnAndroid: '',
      miniAppFn: '',
      payload: '',
      response: '',
      parityNote: '',
    },
  ];
};

const removeBridgeMessageRow = (index: number) => {
  bridgeMessages.value = bridgeMessages.value.filter((_, i) => i !== index);
};

const rawValidationError = computed(() => {
  if (tab.value !== 'raw') return null;
  try {
    const json = JSON.parse(rawJsonText.value);
    const parsed = FlowNodeDataSchema.safeParse({ ...json, id: props.node.id });
    return parsed.success ? null : parsed.error.issues[0]?.message ?? 'Schema không hợp lệ';
  } catch (err) {
    return err instanceof Error ? err.message : 'JSON không hợp lệ';
  }
});

const handleSave = () => {
  validationError.value = null;
  let candidate: unknown;
  if (tab.value === 'raw') {
    try {
      candidate = { ...JSON.parse(rawJsonText.value), id: props.node.id };
    } catch (err) {
      validationError.value = err instanceof Error ? err.message : 'Lỗi cú pháp JSON';
      return;
    }
  } else {
    candidate = buildNodeFromForm();
  }

  const parsed = FlowNodeDataSchema.safeParse(candidate);
  if (!parsed.success) {
    validationError.value = parsed.error.issues
      .map((i) => `${i.path.join('.') || 'node'}: ${i.message}`)
      .join(' · ');
    return;
  }
  emit('save', parsed.data);
};
</script>

<template>
  <div class="space-y-4 rounded-xl border border-indigo-200 bg-indigo-50/30 p-3.5 dark:border-cyan-500/35 dark:bg-cyan-500/5">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-semibold dark:border-slate-700 dark:bg-slate-900">
        <button
          type="button"
          class="rounded-md px-2.5 py-1 transition"
          :class="tab === 'basic' ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-300'"
          @click="switchTab('basic')"
        >
          Cơ bản
        </button>
        <button
          type="button"
          class="rounded-md px-2.5 py-1 transition"
          :class="tab === 'tech' ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-300'"
          @click="switchTab('tech')"
        >
          Kỹ thuật
        </button>
        <button
          type="button"
          class="rounded-md px-2.5 py-1 transition"
          :class="tab === 'parity' ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-300'"
          @click="switchTab('parity')"
        >
          Parity &amp; Bridge
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-md px-2.5 py-1 transition"
          :class="tab === 'raw' ? 'bg-slate-900 text-cyan-300' : 'text-slate-600 dark:text-slate-300'"
          @click="switchTab('raw')"
        >
          <Code2 class="h-3 w-3" />
          JSON
        </button>
      </div>

      <button
        type="button"
        class="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
        title="Hủy chỉnh sửa"
        @click="emit('cancel')"
      >
        <X class="h-4 w-4" />
      </button>
    </div>

    <div v-if="tab === 'basic'" class="space-y-2.5 text-xs">
      <label class="block space-y-1">
        <span class="font-semibold text-slate-700 dark:text-slate-300">Tên hiển thị (Overview) *</span>
        <input
          v-model="label"
          type="text"
          class="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </label>

      <label class="block space-y-1">
        <span class="font-semibold text-slate-700 dark:text-slate-300">Tên kỹ thuật (techLabel)</span>
        <input
          v-model="techLabel"
          type="text"
          class="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </label>

      <div class="grid grid-cols-2 gap-2">
        <label class="space-y-1">
          <span class="font-semibold text-slate-700 dark:text-slate-300">Loại node</span>
          <select
            v-model="kind"
            class="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="module">Module</option>
            <option value="miniapp">Mini App</option>
            <option value="action">Thao tác</option>
            <option value="process">Xử lý</option>
            <option value="decision">Điều kiện</option>
            <option value="external">Hệ thống</option>
            <option value="error">Lỗi / Retry</option>
          </select>
        </label>

        <label class="space-y-1">
          <span class="font-semibold text-slate-700 dark:text-slate-300">Đối tượng xem</span>
          <select
            v-model="audience"
            class="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="all">Public &amp; Nội bộ (all)</option>
            <option value="tech">Chỉ Kỹ thuật (tech)</option>
          </select>
        </label>
      </div>

      <div class="flex items-center gap-4">
        <span class="font-semibold text-slate-700 dark:text-slate-300">Nền tảng:</span>
        <label class="inline-flex items-center gap-1.5">
          <input v-model="hasIos" type="checkbox" class="rounded" />
          <span>iOS</span>
        </label>
        <label class="inline-flex items-center gap-1.5">
          <input v-model="hasAndroid" type="checkbox" class="rounded" />
          <span>Android</span>
        </label>
      </div>

      <label class="block space-y-1">
        <span class="font-semibold text-slate-700 dark:text-slate-300">Mô tả tổng quan *</span>
        <textarea
          v-model="overview"
          rows="3"
          class="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </label>

      <label class="block space-y-1">
        <span class="font-semibold text-slate-700 dark:text-slate-300">Mô tả kỹ thuật (summary.tech)</span>
        <textarea
          v-model="techSummary"
          rows="2"
          class="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </label>

      <div class="grid grid-cols-2 gap-2 border-t border-slate-200 pt-2.5 dark:border-slate-800">
        <label class="space-y-1">
          <span class="font-semibold text-slate-700 dark:text-slate-300">Trạng thái node</span>
          <select
            v-model="metaStatus"
            class="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="">(Mặc định)</option>
            <option value="stable">Ổn định (stable)</option>
            <option value="wip">Đang làm (wip)</option>
            <option value="needs_review">Cần rà soát (needs_review)</option>
            <option value="deprecated">Đã cũ (deprecated)</option>
          </select>
        </label>
        <label class="space-y-1">
          <span class="font-semibold text-slate-700 dark:text-slate-300">Người phụ trách</span>
          <input
            v-model="metaOwner"
            type="text"
            placeholder="VD: Mobile Core"
            class="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>
        <label class="space-y-1">
          <span class="font-semibold text-slate-700 dark:text-slate-300">Ngày kiểm gần nhất</span>
          <input
            v-model="metaLastVerified"
            type="text"
            placeholder="YYYY-MM-DD"
            class="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>
        <label class="space-y-1">
          <span class="font-semibold text-slate-700 dark:text-slate-300">Link Task VBot Work</span>
          <input
            v-model="metaWorkTaskUrl"
            type="url"
            placeholder="https://work.vpmedia.vn/..."
            class="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>
      </div>
    </div>

    <div v-else-if="tab === 'tech'" class="space-y-2.5 text-xs">
      <label class="block space-y-1">
        <span class="font-semibold text-slate-700 dark:text-slate-300">Khác biệt iOS ↔ Android (platformDiffNote)</span>
        <textarea
          v-model="platformDiffNote"
          rows="2"
          class="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </label>

      <label class="block space-y-1">
        <span class="font-semibold text-slate-700 dark:text-slate-300">APIs / Events (mỗi dòng 1 mục)</span>
        <textarea
          v-model="apisText"
          rows="2"
          class="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-[11px] text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </label>

      <label class="block space-y-1">
        <span class="font-semibold text-slate-700 dark:text-slate-300">Edge Cases (mỗi dòng 1 mục)</span>
        <textarea
          v-model="edgeCasesText"
          rows="2"
          class="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </label>

      <label class="block space-y-1">
        <span class="font-semibold text-slate-700 dark:text-slate-300">Code Refs dùng chung (mỗi dòng 1 path)</span>
        <textarea
          v-model="codeRefsText"
          rows="2"
          class="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-[11px] text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </label>

      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div class="space-y-1.5 rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
          <div class="font-bold text-indigo-700 dark:text-indigo-300">iOS riêng</div>
          <textarea
            v-model="iosSummary"
            rows="2"
            placeholder="Mô tả iOS"
            class="w-full rounded border border-slate-200 px-2 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-950"
          />
          <textarea
            v-model="iosCodeRefsText"
            rows="2"
            placeholder="iOS codeRefs"
            class="w-full rounded border border-slate-200 px-2 py-1 font-mono text-[10.5px] dark:border-slate-700 dark:bg-slate-950"
          />
        </div>
        <div class="space-y-1.5 rounded-lg border border-emerald-200 bg-white p-2 dark:border-emerald-500/30 dark:bg-slate-900">
          <div class="font-bold text-emerald-700 dark:text-emerald-300">Android riêng</div>
          <textarea
            v-model="androidSummary"
            rows="2"
            placeholder="Mô tả Android"
            class="w-full rounded border border-slate-200 px-2 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-950"
          />
          <textarea
            v-model="androidCodeRefsText"
            rows="2"
            placeholder="Android codeRefs"
            class="w-full rounded border border-slate-200 px-2 py-1 font-mono text-[10.5px] dark:border-slate-700 dark:bg-slate-950"
          />
        </div>
      </div>

      <label class="block space-y-1">
        <span class="font-semibold text-slate-700 dark:text-slate-300">Related Node IDs (cách nhau dấu phẩy)</span>
        <input
          v-model="relatedIdsText"
          type="text"
          class="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-[11px] text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </label>
    </div>

    <div v-else-if="tab === 'parity'" class="space-y-3 text-xs">
      <!-- Parity Assessment Section -->
      <div class="space-y-2 rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900">
        <label class="flex items-center justify-between gap-2 font-bold text-slate-800 dark:text-slate-100">
          <span>Đánh giá chênh lệch iOS ↔ Android (parityAssessment)</span>
          <input v-model="hasParityAssessment" type="checkbox" class="rounded" />
        </label>

        <template v-if="hasParityAssessment">
          <label class="block space-y-1">
            <span class="font-semibold text-slate-600 dark:text-slate-300">Mã chênh lệch (code)</span>
            <input
              v-model="parityCode"
              type="text"
              placeholder="VD: CALL-01"
              class="w-full rounded border border-slate-200 bg-white px-2 py-1 font-mono text-[11px] uppercase dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label class="space-y-1">
              <span class="font-semibold text-slate-600 dark:text-slate-300">Verdict</span>
              <select
                v-model="parityVerdict"
                class="w-full rounded border border-slate-200 bg-white px-2 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="action_needed">Lỗi / Gap (action_needed)</option>
                <option value="logic_diff">Khác logic (logic_diff)</option>
                <option value="os_impl_only">Chỉ khác OS (os_impl_only)</option>
                <option value="synced">Đã khớp (synced)</option>
              </select>
            </label>
            <label class="space-y-1">
              <span class="font-semibold text-slate-600 dark:text-slate-300">Cần sửa?</span>
              <select
                v-model="parityNeedsFix"
                class="w-full rounded border border-slate-200 bg-white px-2 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="yes">Có (yes)</option>
                <option value="consider">Cân nhắc (consider)</option>
                <option value="no">Không (no)</option>
              </select>
            </label>
            <label class="space-y-1">
              <span class="font-semibold text-slate-600 dark:text-slate-300">Bên sửa</span>
              <select
                v-model="parityFixTarget"
                class="w-full rounded border border-slate-200 bg-white px-2 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="ios">iOS</option>
                <option value="android">Android</option>
                <option value="both">Cả 2 (both)</option>
                <option value="tbd">Chờ chốt (tbd)</option>
                <option value="none">Không (none)</option>
              </select>
            </label>
          </div>

          <div class="flex flex-wrap gap-4">
            <label class="inline-flex items-center gap-1.5">
              <input v-model="paritySameLogic" type="checkbox" class="rounded" />
              <span>Cùng logic</span>
            </label>
            <label class="inline-flex items-center gap-1.5">
              <input v-model="paritySameOutcome" type="checkbox" class="rounded" />
              <span>Cùng kết quả UX</span>
            </label>
          </div>

          <label class="block space-y-1">
            <span class="font-semibold text-slate-600 dark:text-slate-300">Giải thích *</span>
            <textarea
              v-model="parityExplanation"
              rows="2"
              class="w-full rounded border border-slate-200 px-2 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
          <label class="block space-y-1">
            <span class="font-semibold text-slate-600 dark:text-slate-300">Khuyến nghị xử lý *</span>
            <textarea
              v-model="parityRecommendation"
              rows="2"
              class="w-full rounded border border-slate-200 px-2 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
        </template>
      </div>

      <!-- MiniApp Bridge Section -->
      <div class="space-y-2 rounded-lg border border-cyan-200 bg-white p-2.5 dark:border-cyan-500/35 dark:bg-slate-900">
        <label class="flex items-center justify-between gap-2 font-bold text-cyan-800 dark:text-cyan-300">
          <span>Cầu nối Mini App (miniAppBridge)</span>
          <input v-model="hasMiniAppBridge" type="checkbox" class="rounded" />
        </label>

        <template v-if="hasMiniAppBridge">
          <div class="grid grid-cols-2 gap-2">
            <label class="space-y-1">
              <span class="font-semibold text-slate-600 dark:text-slate-300">Mini App ID *</span>
              <input
                v-model="bridgeMiniAppId"
                type="text"
                placeholder="vb-ma-..."
                class="w-full rounded border border-slate-200 px-2 py-1 font-mono text-[11px] dark:border-slate-700 dark:bg-slate-950"
              />
            </label>
            <label class="space-y-1">
              <span class="font-semibold text-slate-600 dark:text-slate-300">Embed Mode</span>
              <select
                v-model="bridgeEmbedMode"
                class="w-full rounded border border-slate-200 bg-white px-2 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="inline_tab">inline_tab</option>
                <option value="modal">modal</option>
                <option value="sdk_global">sdk_global</option>
              </select>
            </label>
          </div>

          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              v-model="bridgeTransportIos"
              type="text"
              placeholder="Transport iOS"
              class="w-full rounded border border-slate-200 px-2 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-950"
            />
            <input
              v-model="bridgeTransportAndroid"
              type="text"
              placeholder="Transport Android"
              class="w-full rounded border border-slate-200 px-2 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-950"
            />
          </div>

          <div class="space-y-2 border-t border-slate-200 pt-2 dark:border-slate-800">
            <div class="flex items-center justify-between">
              <span class="font-bold text-slate-700 dark:text-slate-300">
                Bridge Messages ({{ bridgeMessages.length }})
              </span>
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded border border-cyan-300 bg-cyan-50 px-2 py-0.5 text-[10.5px] font-semibold text-cyan-800 dark:border-cyan-500/40 dark:bg-cyan-500/15 dark:text-cyan-300"
                @click="addBridgeMessageRow"
              >
                <Plus class="h-3 w-3" />
                Thêm message
              </button>
            </div>

            <div
              v-for="(msg, idx) in bridgeMessages"
              :key="idx"
              class="space-y-1.5 rounded border border-slate-200 bg-slate-50/70 p-2 dark:border-slate-700 dark:bg-slate-950/60"
            >
              <div class="flex items-center gap-1.5">
                <select
                  v-model="msg.direction"
                  class="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10.5px] dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="host_init">host_init</option>
                  <option value="host_to_miniapp">host_to_miniapp</option>
                  <option value="miniapp_to_host">miniapp_to_host</option>
                </select>
                <input
                  v-model="msg.name"
                  type="text"
                  placeholder="Tên event / action *"
                  class="min-w-0 flex-1 rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-[10.5px] dark:border-slate-700 dark:bg-slate-900"
                />
                <button
                  type="button"
                  class="rounded p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/15"
                  @click="removeBridgeMessageRow(idx)"
                >
                  <Trash2 class="h-3 w-3" />
                </button>
              </div>
              <div class="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                <input
                  v-model="msg.hostFnIos"
                  type="text"
                  placeholder="Host Fn iOS"
                  class="rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-[10px] dark:border-slate-700 dark:bg-slate-900"
                />
                <input
                  v-model="msg.hostFnAndroid"
                  type="text"
                  placeholder="Host Fn Android"
                  class="rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-[10px] dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
              <div class="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                <input
                  v-model="msg.miniAppFn"
                  type="text"
                  placeholder="Mini App SDK Fn"
                  class="rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-[10px] dark:border-slate-700 dark:bg-slate-900"
                />
                <input
                  v-model="msg.parityNote"
                  type="text"
                  placeholder="Parity note (nếu có)"
                  class="rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <div v-else class="space-y-2">
      <textarea
        v-model="rawJsonText"
        rows="14"
        spellcheck="false"
        class="w-full rounded-lg border border-slate-300 bg-[#0b1120] p-2.5 font-mono text-[11px] text-cyan-100 focus:border-cyan-500 focus:outline-none dark:border-slate-700"
      />
      <p v-if="rawValidationError" class="text-[11px] font-medium text-rose-600 dark:text-rose-400">
        {{ rawValidationError }}
      </p>
    </div>

    <p v-if="validationError" class="rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
      {{ validationError }}
    </p>

    <div class="flex flex-wrap items-center justify-between gap-2 pt-1">
      <div v-if="props.canDelete">
        <button
          v-if="!confirmDelete"
          type="button"
          class="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-500/35 dark:bg-slate-900 dark:text-rose-400"
          @click="confirmDelete = true"
        >
          <Trash2 class="h-3.5 w-3.5" />
          Xóa node
        </button>
        <div v-else class="flex items-center gap-1.5">
          <button
            type="button"
            class="rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-rose-500"
            @click="emit('deleteNode', props.node.id)"
          >
            Xác nhận xóa
          </button>
          <button
            type="button"
            class="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            @click="confirmDelete = false"
          >
            Thôi
          </button>
        </div>
      </div>

      <div class="ml-auto flex items-center gap-2">
        <button
          type="button"
          class="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          @click="emit('cancel')"
        >
          Hủy
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 dark:bg-cyan-500 dark:text-slate-950"
          @click="handleSave"
        >
          <Check class="h-3.5 w-3.5" />
          Áp dụng vào nháp
        </button>
      </div>
    </div>
  </div>
</template>
