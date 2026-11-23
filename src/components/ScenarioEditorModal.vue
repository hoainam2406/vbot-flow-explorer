<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import {
  ArrowDown,
  ArrowUp,
  Check,
  MousePointerClick,
  Plus,
  Trash2,
  Workflow,
  X,
} from 'lucide-vue-next';
import { FLOW_EXPLORER_KEY } from '../composables/useFlowExplorer';
import type { DraftPatch } from '../core/datasetDraftStore';
import {
  ScenarioSchema,
  type AudienceScope,
  type Platform,
  type Scenario,
} from '../data/schema';

const props = defineProps<{
  open: boolean;
  initialParentId?: string | null;
  initialScenario?: Scenario | null;
  recordedNodeIds?: string[] | null;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  submitPatch: [patch: DraftPatch];
  pickOnCanvas: [payload: { parentId: string; nodeIds: string[] }];
}>();

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const subtreeOptions = computed(() =>
  Object.entries(explorer.dataset.subtreesByParentId).map(([parentId, sub]) => ({
    parentId,
    title: sub.title,
  })),
);

const parentId = ref('');
const scenarioId = ref('');
const name = ref('');
const description = ref('');
const audience = ref<AudienceScope>('all');
const hasIos = ref(true);
const hasAndroid = ref(true);
const nodeIds = ref<string[]>([]);
const addStepCandidate = ref('');
const confirmDelete = ref(false);
const errorMsg = ref<string | null>(null);

const isEditingExisting = computed(() => Boolean(props.initialScenario));

const availableSubtreeNodes = computed(() => {
  return explorer.dataset.subtreesByParentId[parentId.value]?.nodes ?? [];
});

const nodeLabelMap = computed(() => {
  const m = new Map<string, string>();
  for (const sub of Object.values(explorer.dataset.subtreesByParentId)) {
    for (const n of sub.nodes) {
      m.set(n.id, n.label);
    }
  }
  return m;
});

watch(
  () => [props.open, props.initialScenario, props.initialParentId, props.recordedNodeIds] as const,
  ([isOpen, sc, initParent, recIds]) => {
    if (!isOpen) return;
    errorMsg.value = null;
    confirmDelete.value = false;

    if (recIds && recIds.length > 0 && parentId.value) {
      nodeIds.value = [...recIds];
      return;
    }

    const fallbackParent =
      initParent && explorer.dataset.subtreesByParentId[initParent]
        ? initParent
        : subtreeOptions.value[0]?.parentId ?? '';
    parentId.value = fallbackParent;

    if (sc) {
      scenarioId.value = sc.id;
      name.value = sc.name;
      description.value = sc.description ?? '';
      audience.value = sc.audience ?? 'all';
      hasIos.value = !sc.platforms || sc.platforms.includes('ios');
      hasAndroid.value = !sc.platforms || sc.platforms.includes('android');
      nodeIds.value = [...sc.nodeIds];
    } else {
      scenarioId.value = `sc-${Date.now().toString(36)}`;
      name.value = '';
      description.value = '';
      audience.value = 'all';
      hasIos.value = true;
      hasAndroid.value = true;
      nodeIds.value = [];
    }
    addStepCandidate.value = availableSubtreeNodes.value[0]?.id ?? '';
  },
);

const close = () => emit('update:open', false);

const addSelectedStep = () => {
  if (!addStepCandidate.value) return;
  if (!nodeIds.value.includes(addStepCandidate.value)) {
    nodeIds.value = [...nodeIds.value, addStepCandidate.value];
  }
};

const moveStep = (idx: number, delta: -1 | 1) => {
  const target = idx + delta;
  if (target < 0 || target >= nodeIds.value.length) return;
  const copy = [...nodeIds.value];
  const [item] = copy.splice(idx, 1);
  copy.splice(target, 0, item);
  nodeIds.value = copy;
};

const removeStep = (idx: number) => {
  nodeIds.value = nodeIds.value.filter((_, i) => i !== idx);
};

const computeConnectingEdgeIds = (pid: string, ids: string[]): string[] => {
  const sub = explorer.dataset.subtreesByParentId[pid];
  if (!sub || ids.length < 2) return [];
  const edgeIds: string[] = [];
  for (let i = 1; i < ids.length; i += 1) {
    const found = sub.edges.find(
      (e) => e.source === ids[i - 1] && e.target === ids[i],
    );
    if (found && !edgeIds.includes(found.id)) {
      edgeIds.push(found.id);
    }
  }
  return edgeIds;
};

const startCanvasPick = () => {
  if (!parentId.value) {
    errorMsg.value = 'Hãy chọn phân hệ chứa kịch bản trước.';
    return;
  }
  emit('pickOnCanvas', { parentId: parentId.value, nodeIds: [...nodeIds.value] });
  close();
};

const handleSave = () => {
  errorMsg.value = null;
  if (!parentId.value || !explorer.dataset.subtreesByParentId[parentId.value]) {
    errorMsg.value = 'Phân hệ chứa kịch bản không hợp lệ.';
    return;
  }
  if (nodeIds.value.length === 0) {
    errorMsg.value = 'Kịch bản phải có ít nhất 1 bước.';
    return;
  }

  const platforms: Platform[] = [];
  if (hasIos.value) platforms.push('ios');
  if (hasAndroid.value) platforms.push('android');
  if (platforms.length === 0) {
    errorMsg.value = 'Phải chọn ít nhất 1 nền tảng.';
    return;
  }

  const edgeIds = computeConnectingEdgeIds(parentId.value, nodeIds.value);
  const candidate: Scenario = {
    id: scenarioId.value.trim(),
    name: name.value.trim(),
    ...(description.value.trim() ? { description: description.value.trim() } : {}),
    ...(audience.value !== 'all' ? { audience: audience.value } : {}),
    ...(platforms.length === 1 ? { platforms } : {}),
    nodeIds: nodeIds.value,
    edgeIds,
  };

  const parsed = ScenarioSchema.safeParse(candidate);
  if (!parsed.success) {
    errorMsg.value = parsed.error.issues
      .map((i) => `${i.path.join('.') || 'scenario'}: ${i.message}`)
      .join(' · ');
    return;
  }

  emit('submitPatch', {
    id: `patch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    kind: 'upsert_scenario',
    parentId: parentId.value,
    scenario: parsed.data,
  });
  close();
};

const handleDelete = () => {
  if (!props.initialScenario || !parentId.value) return;
  emit('submitPatch', {
    id: `patch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    kind: 'delete_scenario',
    parentId: parentId.value,
    scenarioId: props.initialScenario.id,
  });
  close();
};
</script>

<template>
  <Teleport to="body">
    <Transition name="vbot-modal">
      <div
        v-if="props.open"
        class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-xs dark:bg-black/65"
        @click.self="close"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Biên tập Kịch bản"
          class="vbot-modal-panel flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700/80 dark:bg-[#0f172a]"
        >
          <div class="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
            <div class="flex items-center gap-2">
              <Workflow class="h-4 w-4 text-indigo-600 dark:text-cyan-400" />
              <h2 class="text-sm font-bold text-slate-900 dark:text-slate-100">
                {{ isEditingExisting ? 'Chỉnh sửa Kịch bản' : 'Tạo Kịch bản mới (Visual Scenario Editor)' }}
              </h2>
            </div>
            <button
              type="button"
              class="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
              @click="close"
            >
              <X class="h-4 w-4" />
            </button>
          </div>

          <div class="flex-1 space-y-3 overflow-y-auto p-5 text-xs">
            <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <label class="space-y-1">
                <span class="font-semibold text-slate-700 dark:text-slate-300">Phân hệ / Subtree *</span>
                <select
                  v-model="parentId"
                  :disabled="isEditingExisting"
                  class="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option v-for="opt in subtreeOptions" :key="opt.parentId" :value="opt.parentId">
                    {{ opt.title }} ({{ opt.parentId }})
                  </option>
                </select>
              </label>

              <label class="space-y-1">
                <span class="font-semibold text-slate-700 dark:text-slate-300">ID kịch bản *</span>
                <input
                  v-model="scenarioId"
                  type="text"
                  :disabled="isEditingExisting"
                  class="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
            </div>

            <label class="block space-y-1">
              <span class="font-semibold text-slate-700 dark:text-slate-300">Tên kịch bản *</span>
              <input
                v-model="name"
                type="text"
                placeholder="VD: Gọi đi thất bại & Thử lại qua Hotline dự phòng"
                class="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>

            <label class="block space-y-1">
              <span class="font-semibold text-slate-700 dark:text-slate-300">Mô tả kịch bản</span>
              <textarea
                v-model="description"
                rows="2"
                class="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>

            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-3">
                <select
                  v-model="audience"
                  class="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="all">Public &amp; Nội bộ (all)</option>
                  <option value="tech">Chỉ Kỹ thuật (tech)</option>
                </select>
                <label class="inline-flex items-center gap-1">
                  <input v-model="hasIos" type="checkbox" class="rounded" />
                  <span>iOS</span>
                </label>
                <label class="inline-flex items-center gap-1">
                  <input v-model="hasAndroid" type="checkbox" class="rounded" />
                  <span>Android</span>
                </label>
              </div>

              <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-emerald-500"
                @click="startCanvasPick"
              >
                <MousePointerClick class="h-3.5 w-3.5" />
                Chọn bước trên Canvas
              </button>
            </div>

            <!-- Steps Builder -->
            <div class="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/60">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="font-bold text-slate-800 dark:text-slate-200">
                  Chuỗi bước kịch bản ({{ nodeIds.length }})
                </span>
                <div class="flex items-center gap-1.5">
                  <select
                    v-model="addStepCandidate"
                    class="max-w-52 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-900"
                  >
                    <option v-for="n in availableSubtreeNodes" :key="n.id" :value="n.id">
                      {{ n.label }} ({{ n.id }})
                    </option>
                  </select>
                  <button
                    type="button"
                    class="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-cyan-500/35 dark:bg-cyan-500/15 dark:text-cyan-300"
                    @click="addSelectedStep"
                  >
                    <Plus class="h-3 w-3" />
                    Thêm bước
                  </button>
                </div>
              </div>

              <p v-if="nodeIds.length === 0" class="py-4 text-center text-[11px] text-slate-500">
                Chưa có bước nào. Bấm <strong>Chọn bước trên Canvas</strong> hoặc chọn từ danh sách trên.
              </p>

              <ul v-else class="max-h-44 space-y-1 overflow-y-auto">
                <li
                  v-for="(nid, idx) in nodeIds"
                  :key="`${nid}-${idx}`"
                  class="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-900"
                >
                  <div class="min-w-0 flex-1">
                    <span class="mr-1.5 font-mono text-[10px] font-bold text-indigo-600 dark:text-cyan-400">
                      #{{ idx + 1 }}
                    </span>
                    <span class="font-semibold text-slate-900 dark:text-slate-100">
                      {{ nodeLabelMap.get(nid) ?? nid }}
                    </span>
                    <span class="ml-1 font-mono text-[10px] text-slate-400">({{ nid }})</span>
                  </div>
                  <div class="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      :disabled="idx === 0"
                      class="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
                      @click="moveStep(idx, -1)"
                    >
                      <ArrowUp class="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      :disabled="idx === nodeIds.length - 1"
                      class="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
                      @click="moveStep(idx, 1)"
                    >
                      <ArrowDown class="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      class="rounded p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/15"
                      @click="removeStep(idx)"
                    >
                      <Trash2 class="h-3 w-3" />
                    </button>
                  </div>
                </li>
              </ul>
            </div>

            <p v-if="errorMsg" class="rounded-lg bg-rose-50 px-3 py-1.5 text-[11px] font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
              {{ errorMsg }}
            </p>
          </div>

          <div class="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/80 px-5 py-3 text-xs dark:border-slate-800 dark:bg-slate-900/70">
            <div v-if="isEditingExisting">
              <button
                v-if="!confirmDelete"
                type="button"
                class="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-500/35 dark:text-rose-400"
                @click="confirmDelete = true"
              >
                <Trash2 class="h-3.5 w-3.5" />
                Xóa kịch bản
              </button>
              <button
                v-else
                type="button"
                class="rounded-lg bg-rose-600 px-3 py-1.5 font-bold text-white hover:bg-rose-500"
                @click="handleDelete"
              >
                Xác nhận xóa
              </button>
            </div>

            <div class="ml-auto flex items-center gap-2">
              <button
                type="button"
                class="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                @click="close"
              >
                Hủy
              </button>
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3.5 py-1.5 font-bold text-white hover:bg-indigo-500 dark:bg-cyan-500 dark:text-slate-950"
                @click="handleSave"
              >
                <Check class="h-3.5 w-3.5" />
                Lưu vào nháp
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
