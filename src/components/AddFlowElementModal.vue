<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { GitBranchPlus, Plus, X } from 'lucide-vue-next';
import { FLOW_EXPLORER_KEY } from '../composables/useFlowExplorer';
import type { DraftPatch } from '../core/datasetDraftStore';
import {
  FlowEdgeDataSchema,
  FlowNodeDataSchema,
  type AudienceScope,
  type FlowNodeData,
  type NodeKind,
} from '../data/schema';

const props = defineProps<{
  open: boolean;
  anchorNode: FlowNodeData | null;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  submitPatch: [patch: DraftPatch];
}>();

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const mode = ref<'add_node' | 'add_edge'>('add_node');
const nodeId = ref('');
const label = ref('');
const techLabel = ref('');
const kind = ref<NodeKind>('action');
const audience = ref<AudienceScope>('tech');
const overview = ref('');
const connectFromNodeId = ref('');
const edgeLabel = ref('');
const errorMsg = ref<string | null>(null);

// Edge mode fields
const edgeSource = ref('');
const edgeTarget = ref('');
const newEdgeLabel = ref('');

const childSubtreeNodes = computed(() => {
  if (!props.anchorNode) return [];
  return explorer.dataset.subtreesByParentId[props.anchorNode.id]?.nodes ?? [];
});

watch(
  () => [props.open, props.anchorNode] as const,
  ([isOpen, anchor]) => {
    if (!isOpen || !anchor) return;
    mode.value = 'add_node';
    const basePrefix = anchor.id.replace(/[^a-zA-Z0-9_-]/g, '');
    let idx = childSubtreeNodes.value.length + 1;
    let candidate = `${basePrefix}-step-${idx}`;
    while (explorer.findNode(candidate)) {
      idx += 1;
      candidate = `${basePrefix}-step-${idx}`;
    }
    nodeId.value = candidate;
    label.value = '';
    techLabel.value = '';
    kind.value = 'action';
    audience.value = 'tech';
    overview.value = '';
    connectFromNodeId.value = '';
    edgeLabel.value = '';
    edgeSource.value = childSubtreeNodes.value[0]?.id ?? '';
    edgeTarget.value = childSubtreeNodes.value[1]?.id ?? '';
    newEdgeLabel.value = '';
    errorMsg.value = null;
  },
);

const close = () => emit('update:open', false);

const handleSubmit = () => {
  errorMsg.value = null;
  if (!props.anchorNode) return;

  if (mode.value === 'add_node') {
    const cleanId = nodeId.value.trim();
    if (explorer.findNode(cleanId)) {
      errorMsg.value = `ID "${cleanId}" đã tồn tại trong sơ đồ.`;
      return;
    }
    const candidate = {
      id: cleanId,
      label: label.value.trim(),
      ...(techLabel.value.trim() ? { techLabel: techLabel.value.trim() } : {}),
      kind: kind.value,
      audience: audience.value,
      summary: { overview: overview.value.trim() || label.value.trim() },
    };
    const parsed = FlowNodeDataSchema.safeParse(candidate);
    if (!parsed.success) {
      errorMsg.value = parsed.error.issues
        .map((i) => `${i.path.join('.') || 'node'}: ${i.message}`)
        .join(' · ');
      return;
    }
    emit('submitPatch', {
      id: `patch-${Date.now()}`,
      timestamp: Date.now(),
      kind: 'add_node',
      parentId: props.anchorNode.id,
      node: parsed.data,
      ...(connectFromNodeId.value ? { connectFromNodeId: connectFromNodeId.value } : {}),
      ...(edgeLabel.value.trim() ? { edgeLabel: edgeLabel.value.trim() } : {}),
    });
    close();
    return;
  }

  if (!edgeSource.value || !edgeTarget.value || edgeSource.value === edgeTarget.value) {
    errorMsg.value = 'Vui lòng chọn 2 node khác nhau để nối cạnh.';
    return;
  }
  const edgeCandidate = {
    id: `e-${edgeSource.value}-${edgeTarget.value}-${Date.now().toString(36)}`,
    source: edgeSource.value,
    target: edgeTarget.value,
    ...(newEdgeLabel.value.trim() ? { label: newEdgeLabel.value.trim() } : {}),
  };
  const parsedEdge = FlowEdgeDataSchema.safeParse(edgeCandidate);
  if (!parsedEdge.success) {
    errorMsg.value = 'Cạnh không hợp lệ.';
    return;
  }
  emit('submitPatch', {
    id: `patch-${Date.now()}`,
    timestamp: Date.now(),
    kind: 'add_edge',
    parentId: props.anchorNode.id,
    edge: parsedEdge.data,
  });
  close();
};
</script>

<template>
  <Teleport to="body">
    <Transition name="vbot-modal">
      <div
        v-if="props.open && props.anchorNode"
        class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-xs dark:bg-black/65"
        @click.self="close"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Thêm bước con hoặc nối cạnh"
          class="vbot-modal-panel w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700/80 dark:bg-[#0f172a]"
        >
          <div class="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
            <div class="flex items-center gap-2">
              <GitBranchPlus class="h-4 w-4 text-indigo-600 dark:text-cyan-400" />
              <h2 class="text-sm font-bold text-slate-900 dark:text-slate-100">
                Mở rộng nhánh "{{ props.anchorNode.label }}"
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

          <div class="space-y-3.5 p-5 text-xs">
            <div
              v-if="childSubtreeNodes.length >= 2"
              class="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 font-semibold dark:border-slate-700 dark:bg-slate-800"
            >
              <button
                type="button"
                class="rounded-md px-3 py-1 transition"
                :class="mode === 'add_node' ? 'bg-white text-indigo-700 shadow-2xs dark:bg-slate-900 dark:text-cyan-300' : 'text-slate-600 dark:text-slate-300'"
                @click="mode = 'add_node'"
              >
                + Thêm bước con
              </button>
              <button
                type="button"
                class="rounded-md px-3 py-1 transition"
                :class="mode === 'add_edge' ? 'bg-white text-indigo-700 shadow-2xs dark:bg-slate-900 dark:text-cyan-300' : 'text-slate-600 dark:text-slate-300'"
                @click="mode = 'add_edge'"
              >
                + Nối cạnh có sẵn
              </button>
            </div>

            <template v-if="mode === 'add_node'">
              <label class="block space-y-1">
                <span class="font-semibold text-slate-700 dark:text-slate-300">ID node mới *</span>
                <input
                  v-model="nodeId"
                  type="text"
                  class="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>

              <label class="block space-y-1">
                <span class="font-semibold text-slate-700 dark:text-slate-300">Tên hiển thị *</span>
                <input
                  v-model="label"
                  type="text"
                  placeholder="VD: Kiểm tra trạng thái thuê bao"
                  class="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>

              <label class="block space-y-1">
                <span class="font-semibold text-slate-700 dark:text-slate-300">Tên kỹ thuật (tùy chọn)</span>
                <input
                  v-model="techLabel"
                  type="text"
                  placeholder="VD: CheckExtensionAPI / WS"
                  class="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>

              <div class="grid grid-cols-2 gap-2">
                <label class="space-y-1">
                  <span class="font-semibold text-slate-700 dark:text-slate-300">Loại node</span>
                  <select
                    v-model="kind"
                    class="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="action">Thao tác</option>
                    <option value="process">Xử lý</option>
                    <option value="decision">Điều kiện</option>
                    <option value="external">Hệ thống</option>
                    <option value="miniapp">Mini App</option>
                    <option value="error">Lỗi / Retry</option>
                  </select>
                </label>
                <label class="space-y-1">
                  <span class="font-semibold text-slate-700 dark:text-slate-300">Đối tượng</span>
                  <select
                    v-model="audience"
                    class="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="tech">Chỉ Kỹ thuật</option>
                    <option value="all">Public &amp; Nội bộ</option>
                  </select>
                </label>
              </div>

              <label class="block space-y-1">
                <span class="font-semibold text-slate-700 dark:text-slate-300">Mô tả tổng quan *</span>
                <textarea
                  v-model="overview"
                  rows="2"
                  class="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>

              <div v-if="childSubtreeNodes.length > 0" class="grid grid-cols-2 gap-2">
                <label class="space-y-1">
                  <span class="font-semibold text-slate-700 dark:text-slate-300">Nối tiếp sau bước</span>
                  <select
                    v-model="connectFromNodeId"
                    class="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="">(Làm điểm bắt đầu mới)</option>
                    <option v-for="n in childSubtreeNodes" :key="n.id" :value="n.id">
                      {{ n.label }}
                    </option>
                  </select>
                </label>
                <label class="space-y-1">
                  <span class="font-semibold text-slate-700 dark:text-slate-300">Nhãn mũi tên</span>
                  <input
                    v-model="edgeLabel"
                    type="text"
                    placeholder="VD: Thành công"
                    class="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
              </div>
            </template>

            <template v-else>
              <div class="grid grid-cols-2 gap-2">
                <label class="space-y-1">
                  <span class="font-semibold text-slate-700 dark:text-slate-300">Từ bước</span>
                  <select
                    v-model="edgeSource"
                    class="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option v-for="n in childSubtreeNodes" :key="n.id" :value="n.id">{{ n.label }}</option>
                  </select>
                </label>
                <label class="space-y-1">
                  <span class="font-semibold text-slate-700 dark:text-slate-300">Tới bước</span>
                  <select
                    v-model="edgeTarget"
                    class="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option v-for="n in childSubtreeNodes" :key="n.id" :value="n.id">{{ n.label }}</option>
                  </select>
                </label>
              </div>
              <label class="block space-y-1">
                <span class="font-semibold text-slate-700 dark:text-slate-300">Nhãn cạnh</span>
                <input
                  v-model="newEdgeLabel"
                  type="text"
                  placeholder="VD: Thử lại"
                  class="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
            </template>

            <p v-if="errorMsg" class="rounded-lg bg-rose-50 px-3 py-1.5 text-[11px] font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
              {{ errorMsg }}
            </p>

            <div class="flex items-center justify-end gap-2 pt-2">
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
                @click="handleSubmit"
              >
                <Plus class="h-3.5 w-3.5" />
                Thêm vào bản nháp
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
