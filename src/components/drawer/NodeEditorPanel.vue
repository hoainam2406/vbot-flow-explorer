<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Check, Code2, Trash2, X } from 'lucide-vue-next';
import {
  FlowNodeDataSchema,
  type AudienceScope,
  type FlowNodeData,
  type NodeKind,
  type NodeStatus,
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

const tab = ref<'basic' | 'tech' | 'raw'>('basic');
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

const switchTab = (nextTab: 'basic' | 'tech' | 'raw') => {
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
