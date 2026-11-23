<script setup lang="ts">
import { ref, watch } from 'vue';
import { Check, GitCommitHorizontal, Trash2, X } from 'lucide-vue-next';
import {
  FlowEdgeDataSchema,
  type AudienceScope,
  type FlowEdgeData,
  type Platform,
} from '../data/schema';

const props = defineProps<{
  open: boolean;
  edge: FlowEdgeData | null;
  parentId: string;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  save: [payload: { parentId: string; edgeId: string; edge: FlowEdgeData }];
  deleteEdge: [payload: { parentId: string; edgeId: string }];
}>();

const label = ref('');
const techLabel = ref('');
const audience = ref<AudienceScope>('all');
const hasIos = ref(true);
const hasAndroid = ref(true);
const confirmDelete = ref(false);
const errorMsg = ref<string | null>(null);

watch(
  () => [props.open, props.edge] as const,
  ([isOpen, edge]) => {
    if (!isOpen || !edge) return;
    label.value = edge.label ?? '';
    techLabel.value = edge.techLabel ?? '';
    audience.value = edge.audience ?? 'all';
    hasIos.value = !edge.platforms || edge.platforms.includes('ios');
    hasAndroid.value = !edge.platforms || edge.platforms.includes('android');
    confirmDelete.value = false;
    errorMsg.value = null;
  },
);

const close = () => emit('update:open', false);

const handleSave = () => {
  if (!props.edge) return;
  const platforms: Platform[] = [];
  if (hasIos.value) platforms.push('ios');
  if (hasAndroid.value) platforms.push('android');
  if (platforms.length === 0) {
    errorMsg.value = 'Phải chọn ít nhất 1 nền tảng.';
    return;
  }

  const candidate: FlowEdgeData = {
    id: props.edge.id,
    source: props.edge.source,
    target: props.edge.target,
    ...(label.value.trim() ? { label: label.value.trim() } : {}),
    ...(techLabel.value.trim() ? { techLabel: techLabel.value.trim() } : {}),
    ...(audience.value !== 'all' ? { audience: audience.value } : {}),
    ...(platforms.length === 1 ? { platforms } : {}),
  };

  const parsed = FlowEdgeDataSchema.safeParse(candidate);
  if (!parsed.success) {
    errorMsg.value = parsed.error.issues[0]?.message ?? 'Cạnh không hợp lệ.';
    return;
  }

  emit('save', { parentId: props.parentId, edgeId: props.edge.id, edge: parsed.data });
  close();
};

const handleDelete = () => {
  if (!props.edge) return;
  emit('deleteEdge', { parentId: props.parentId, edgeId: props.edge.id });
  close();
};
</script>

<template>
  <Teleport to="body">
    <Transition name="vbot-modal">
      <div
        v-if="props.open && props.edge"
        class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-xs dark:bg-black/65"
        @click.self="close"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Chỉnh sửa mũi tên kết nối"
          class="vbot-modal-panel w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700/80 dark:bg-[#0f172a]"
        >
          <div class="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
            <div class="flex items-center gap-2">
              <GitCommitHorizontal class="h-4 w-4 text-indigo-600 dark:text-cyan-400" />
              <h2 class="text-sm font-bold text-slate-900 dark:text-slate-100">
                Sửa cạnh nối ({{ props.edge.source }} → {{ props.edge.target }})
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

          <div class="space-y-3 p-5 text-xs">
            <label class="block space-y-1">
              <span class="font-semibold text-slate-700 dark:text-slate-300">Nhãn hiển thị (Overview)</span>
              <input
                v-model="label"
                type="text"
                placeholder="VD: Thành công / Thất bại"
                class="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>

            <label class="block space-y-1">
              <span class="font-semibold text-slate-700 dark:text-slate-300">Nhãn kỹ thuật (techLabel)</span>
              <input
                v-model="techLabel"
                type="text"
                placeholder="VD: HTTP 200 / Timeout"
                class="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>

            <label class="block space-y-1">
              <span class="font-semibold text-slate-700 dark:text-slate-300">Đối tượng xem</span>
              <select
                v-model="audience"
                class="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="all">Public &amp; Nội bộ (all)</option>
                <option value="tech">Chỉ Kỹ thuật (tech)</option>
              </select>
            </label>

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

            <p v-if="errorMsg" class="rounded-lg bg-rose-50 px-3 py-1.5 text-[11px] font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
              {{ errorMsg }}
            </p>

            <div class="flex items-center justify-between gap-2 pt-2">
              <div>
                <button
                  v-if="!confirmDelete"
                  type="button"
                  class="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-500/35 dark:text-rose-400"
                  @click="confirmDelete = true"
                >
                  <Trash2 class="h-3.5 w-3.5" />
                  Xóa cạnh
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

              <div class="flex items-center gap-2">
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
      </div>
    </Transition>
  </Teleport>
</template>
