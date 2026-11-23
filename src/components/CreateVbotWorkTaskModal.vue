<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ClipboardList,
  Copy,
  ExternalLink,
  Loader2,
  Send,
  UserCheck,
  X,
} from 'lucide-vue-next';
import { useToast } from '../composables/useToast';
import { copyTextToClipboard } from '../core/downloadHelper';
import {
  createVbotWorkTaskApi,
  probeVbotWorkDevStatus,
  saveCreatedVbotWorkTask,
  type CreatedVbotWorkTask,
  type VbotWorkDevStatus,
} from '../core/vbotWorkClient';
import type { VbotWorkPriority, VbotWorkTaskDraft } from '../core/vbotWorkTemplates';
import { isSafeExternalUrl } from '../core/workspaceSettings';

const props = defineProps<{
  open: boolean;
  draft: VbotWorkTaskDraft | null;
  fallbackUrl: string;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  created: [payload: { itemKey: string; task: CreatedVbotWorkTask }];
}>();

const { pushToast } = useToast();

const title = ref('');
const description = ref('');
const priority = ref<VbotWorkPriority>('medium');
const loadingStatus = ref(false);
const submitting = ref(false);
const copiedMd = ref(false);
const errorMsg = ref<string | null>(null);
const createdTask = ref<CreatedVbotWorkTask | null>(null);
const devStatus = ref<VbotWorkDevStatus>({
  available: false,
  configured: false,
  projectName: 'vbot-mobile',
  projectSlug: 'VbM',
  assigneeName: 'Hoài Nam',
});

const PRIORITY_OPTIONS: Array<{ id: VbotWorkPriority; label: string; cls: string }> = [
  { id: 'no-priority', label: 'Không ưu tiên', cls: 'border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-300' },
  { id: 'low', label: 'Thấp', cls: 'border-sky-300 text-sky-700 dark:border-sky-500/40 dark:text-sky-300' },
  { id: 'medium', label: 'Trung bình', cls: 'border-amber-300 text-amber-800 dark:border-amber-500/40 dark:text-amber-300' },
  { id: 'high', label: 'Cao', cls: 'border-orange-400 text-orange-800 dark:border-orange-500/50 dark:text-orange-300' },
  { id: 'urgent', label: 'Khẩn cấp', cls: 'border-rose-400 text-rose-800 dark:border-rose-500/50 dark:text-rose-300' },
];

const safeFallbackUrl = computed(() => {
  const raw = props.draft?.fallbackUrl || props.fallbackUrl || 'https://work.vpmedia.vn';
  return isSafeExternalUrl(raw) ? raw : 'https://work.vpmedia.vn';
});

const close = () => emit('update:open', false);

const onKeyDown = (event: KeyboardEvent) => {
  if (!props.open || event.key !== 'Escape') return;
  event.preventDefault();
  event.stopPropagation();
  close();
};

let copyTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => [props.open, props.draft] as const,
  async ([isOpen, nextDraft]) => {
    if (isOpen && nextDraft) {
      title.value = nextDraft.title;
      description.value = nextDraft.description;
      priority.value = nextDraft.priority;
      errorMsg.value = null;
      createdTask.value = null;
      copiedMd.value = false;
      window.addEventListener('keydown', onKeyDown, true);

      loadingStatus.value = true;
      devStatus.value = await probeVbotWorkDevStatus();
      loadingStatus.value = false;
    } else if (!isOpen) {
      window.removeEventListener('keydown', onKeyDown, true);
    }
  },
);

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown, true);
  if (copyTimer) clearTimeout(copyTimer);
});

const handleCopyMarkdown = async () => {
  const md = `# ${title.value.trim()}\n\n${description.value.trim()}\n`;
  const ok = await copyTextToClipboard(md);
  if (ok) {
    copiedMd.value = true;
    pushToast('Đã sao chép nội dung Task Markdown', 'success');
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copiedMd.value = false;
    }, 1800);
  }
};

const handleCopyAndOpen = async () => {
  await handleCopyMarkdown();
  window.open(safeFallbackUrl.value, '_blank', 'noopener,noreferrer');
};

const handleSubmit = async () => {
  if (!props.draft || submitting.value) return;
  const cleanTitle = title.value.trim();
  if (!cleanTitle) {
    errorMsg.value = 'Tiêu đề Task không được để trống.';
    return;
  }

  submitting.value = true;
  errorMsg.value = null;

  const res = await createVbotWorkTaskApi({
    title: cleanTitle,
    description: description.value,
    priority: priority.value,
  });

  submitting.value = false;

  if (!res.ok) {
    errorMsg.value = res.error;
    if (res.notConfigured) {
      devStatus.value = { ...devStatus.value, configured: false };
    }
    return;
  }

  saveCreatedVbotWorkTask(props.draft.itemKey, res.task);
  createdTask.value = res.task;
  emit('created', { itemKey: props.draft.itemKey, task: res.task });
  pushToast(`Đã tạo Task ${res.task.key} lên VBot Work`, 'success');
};
</script>

<template>
  <Teleport to="body">
    <Transition name="vbot-modal">
      <div
        v-if="props.open && props.draft"
        class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs dark:bg-black/70"
        @click.self="close"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Tạo Task VBot Work"
          class="vbot-modal-panel flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700/80 dark:bg-[#0f172a]"
        >
          <!-- Header -->
          <div class="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
            <div class="flex items-center gap-2.5">
              <span class="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-300 dark:ring-cyan-500/35">
                <ClipboardList class="h-4 w-4" />
              </span>
              <div>
                <h2 class="text-sm font-bold text-slate-900 sm:text-base dark:text-slate-100">
                  Tạo Task lên VBot Work
                </h2>
                <p class="text-[11px] text-slate-500 dark:text-slate-400">
                  Điền sẵn phân tích từ VBot Flow Explorer — gán trực tiếp theo cấu hình mặc định.
                </p>
              </div>
            </div>

            <button
              type="button"
              aria-label="Đóng hộp thoại tạo Task"
              class="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              @click="close"
            >
              <X class="h-4 w-4" />
            </button>
          </div>

          <!-- Body -->
          <div class="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <!-- Fixed Project & Assignee Bar -->
            <div class="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/90 px-3.5 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-900/70">
              <span class="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                <UserCheck class="h-3.5 w-3.5 text-indigo-600 dark:text-cyan-400" />
                Dự án mặc định:
                <strong class="rounded bg-indigo-100 px-1.5 py-0.5 font-mono text-[11px] text-indigo-800 dark:bg-cyan-500/20 dark:text-cyan-200">
                  {{ devStatus.projectName }} ({{ devStatus.projectSlug }})
                </strong>
              </span>
              <span class="text-slate-300 dark:text-slate-700">·</span>
              <span class="text-slate-600 dark:text-slate-300">
                Phụ trách:
                <strong class="text-slate-900 dark:text-white">{{ devStatus.assigneeName }}</strong>
              </span>
              <span class="text-slate-300 dark:text-slate-700">·</span>
              <span class="text-slate-500 dark:text-slate-400">Trạng thái: <strong>To Do</strong></span>
            </div>

            <!-- Success Banner -->
            <div
              v-if="createdTask"
              class="space-y-2 rounded-xl border border-emerald-300 bg-emerald-50/90 p-3.5 text-xs text-emerald-950 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-100"
            >
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2 font-bold">
                  <CheckCircle2 class="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                  <span>Đã tạo Task thành công: {{ createdTask.key }}</span>
                </div>
                <a
                  :href="createdTask.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1 text-[11px] font-bold text-white transition hover:bg-emerald-500"
                >
                  Mở Task trên VBot Work
                  <ExternalLink class="h-3 w-3" />
                </a>
              </div>
              <p class="text-[11.5px] opacity-90">
                {{ createdTask.title }} ({{ createdTask.projectName }} → {{ createdTask.assigneeName }})
              </p>
            </div>

            <!-- Missing Token / Static Mode Info -->
            <div
              v-else-if="!loadingStatus && (!devStatus.available || !devStatus.configured)"
              class="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50/85 p-3 text-xs leading-relaxed text-amber-950 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-100"
            >
              <div class="flex items-center gap-1.5 font-bold">
                <AlertCircle class="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
                <span v-if="!devStatus.available">Chế độ xem tĩnh — không kết nối server local</span>
                <span v-else>Chưa phát hiện token VBot Work phía local dev</span>
              </div>
              <p v-if="!devStatus.available" class="text-[11.5px]">
                Tạo task trực tiếp qua API chỉ khả dụng khi chạy local (<code class="font-mono">pnpm dev</code>). Bạn vẫn có thể chỉnh sửa nội dung bên dưới rồi bấm <strong>Copy &amp; Mở VBot Work</strong>.
              </p>
              <p v-else class="text-[11.5px]">
                Hãy thêm <code class="font-mono">VBOT_WORK_TOKEN=Bearer ...</code> vào file <code class="font-mono">.env.local</code> ở thư mục dự án (không commit lên git) rồi khởi động lại <code class="font-mono">pnpm dev</code>, hoặc dùng ngay nút <strong>Copy &amp; Mở VBot Work</strong>.
              </p>
            </div>

            <!-- Error Banner -->
            <div
              v-if="errorMsg"
              class="flex items-start gap-2 rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-900 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-200"
            >
              <AlertCircle class="mt-0.5 h-4 w-4 shrink-0" />
              <span>{{ errorMsg }}</span>
            </div>

            <!-- Form Fields -->
            <label class="block space-y-1 text-xs">
              <span class="font-semibold text-slate-700 dark:text-slate-300">Tiêu đề Task</span>
              <input
                v-model="title"
                type="text"
                maxlength="240"
                class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-cyan-500"
              />
            </label>

            <div class="space-y-1.5 text-xs">
              <span class="block font-semibold text-slate-700 dark:text-slate-300">Độ ưu tiên</span>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="opt in PRIORITY_OPTIONS"
                  :key="opt.id"
                  type="button"
                  class="rounded-full border px-2.5 py-1 text-[11px] font-semibold transition"
                  :class="
                    priority === opt.id
                      ? 'border-indigo-600 bg-indigo-600 text-white dark:border-cyan-500 dark:bg-cyan-500 dark:text-slate-950'
                      : `bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 ${opt.cls}`
                  "
                  @click="priority = opt.id"
                >
                  {{ opt.label }}
                </button>
              </div>
            </div>

            <label class="block space-y-1 text-xs">
              <span class="font-semibold text-slate-700 dark:text-slate-300">Nội dung mô tả (Markdown)</span>
              <textarea
                v-model="description"
                rows="10"
                class="w-full rounded-xl border border-slate-200 bg-slate-50/70 p-3 font-mono text-[11.5px] leading-relaxed text-slate-900 focus:border-indigo-400 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-cyan-500"
              />
            </label>
          </div>

          <!-- Footer Actions -->
          <div class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/80 px-5 py-3 dark:border-slate-800 dark:bg-slate-900/70">
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                @click="handleCopyMarkdown"
              >
                <Check v-if="copiedMd" class="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <Copy v-else class="h-3.5 w-3.5" />
                {{ copiedMd ? 'Đã copy MD' : 'Copy Markdown' }}
              </button>

              <a
                :href="safeFallbackUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                Mở VBot Work
                <ExternalLink class="h-3 w-3" />
              </a>
            </div>

            <div class="flex items-center gap-2">
              <button
                v-if="!createdTask && devStatus.available && devStatus.configured"
                type="button"
                :disabled="submitting || loadingStatus"
                class="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-indigo-500 disabled:opacity-60 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400"
                @click="handleSubmit"
              >
                <Loader2 v-if="submitting" class="h-3.5 w-3.5 animate-spin" />
                <Send v-else class="h-3.5 w-3.5" />
                {{ submitting ? 'Đang tạo Task...' : 'Tạo Task lên VBot Work' }}
              </button>

              <button
                v-else-if="!createdTask"
                type="button"
                class="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-cyan-500"
                @click="handleCopyAndOpen"
              >
                <Copy class="h-3.5 w-3.5" />
                Copy &amp; Mở VBot Work
                <ExternalLink class="h-3 w-3" />
              </button>

              <button
                v-else
                type="button"
                class="rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white dark:bg-slate-700"
                @click="close"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
