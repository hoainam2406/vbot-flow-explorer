<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue';
import {
  Check,
  Code2,
  Copy,
  ExternalLink,
  FolderGit2,
  Image as ImageIcon,
  RotateCcw,
  Settings,
  Upload,
  X,
} from 'lucide-vue-next';
import { FLOW_EXPLORER_KEY } from '../composables/useFlowExplorer';
import { useToast } from '../composables/useToast';
import { auditMediaCoverage } from '../core/auditSyncEngine';
import { copyTextToClipboard } from '../core/downloadHelper';
import { processAndUploadMediaFile } from '../core/mediaUploadHelper';
import {
  buildGitWebFileUrl,
  buildIdeFileUrl,
  loadDevWorkspaceSettings,
  resetDevWorkspaceSettings,
  saveDevWorkspaceSettings,
  type DevWorkspaceSettings,
} from '../core/workspaceSettings';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const { pushToast } = useToast();
const activeTab = ref<'paths' | 'media'>('paths');
const form = ref<DevWorkspaceSettings>(loadDevWorkspaceSettings());
const mediaFilter = ref<'all' | 'missing' | 'present'>('all');
const copiedChecklist = ref(false);
const mediaUploadInputRef = ref<HTMLInputElement | null>(null);
const uploadTargetSrc = ref('');
const localUploadSupported = ref(false);
let resetTimer: ReturnType<typeof setTimeout> | null = null;

const close = () => emit('update:open', false);

const onKeyDown = (event: KeyboardEvent) => {
  if (props.open && event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    close();
  }
};

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      form.value = loadDevWorkspaceSettings();
      window.addEventListener('keydown', onKeyDown, true);
      if (import.meta.env.DEV) {
        try {
          const resp = await fetch('/__vbot-dev/status');
          if (resp.ok) {
            const data = (await resp.json()) as { capabilities?: { mediaUpload?: boolean } };
            localUploadSupported.value = Boolean(data.capabilities?.mediaUpload);
          }
        } catch {
          localUploadSupported.value = false;
        }
      }
    } else {
      window.removeEventListener('keydown', onKeyDown, true);
    }
  },
);

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown, true);
  if (resetTimer) clearTimeout(resetTimer);
});

const sampleIosRef = 'VBot/Service/MiniAppService.swift';
const sampleAndroidRef = 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/MiniAppHelper.kt';

const previewIosIde = computed(() => buildIdeFileUrl(sampleIosRef, form.value));
const previewAndroidIde = computed(() => buildIdeFileUrl(sampleAndroidRef, form.value));
const previewIosWeb = computed(() =>
  buildGitWebFileUrl(
    sampleIosRef,
    form.value,
    explorer.dataset.app.repoConfig,
    explorer.dataset.app.techBranch,
  ),
);
const previewAndroidWeb = computed(() =>
  buildGitWebFileUrl(
    sampleAndroidRef,
    form.value,
    explorer.dataset.app.repoConfig,
    explorer.dataset.app.techBranch,
  ),
);

const mediaCoverage = computed(() =>
  auditMediaCoverage(explorer.dataset, explorer.dataset.existingMediaPaths ?? []),
);

const filteredMediaItems = computed(() => {
  if (mediaFilter.value === 'missing') {
    return mediaCoverage.value.items.filter((i) => !i.exists);
  }
  if (mediaFilter.value === 'present') {
    return mediaCoverage.value.items.filter((i) => i.exists);
  }
  return mediaCoverage.value.items;
});

const coveragePercent = computed(() => {
  if (mediaCoverage.value.total === 0) return 100;
  return Math.round((mediaCoverage.value.present / mediaCoverage.value.total) * 100);
});

const handleSave = () => {
  form.value = saveDevWorkspaceSettings(form.value);
  pushToast('Đã lưu cài đặt đường dẫn Dev vào trình duyệt', 'success');
};

const handleReset = () => {
  form.value = resetDevWorkspaceSettings();
  pushToast('Đã khôi phục cài đặt mặc định', 'info');
};

const jumpToNode = (nodeId: string) => {
  close();
  explorer.jumpToNode(nodeId);
};

const copyMissingChecklist = async () => {
  const missing = mediaCoverage.value.items.filter((i) => !i.exists);
  const lines = [
    '# Danh sách Media cần bổ sung vào `public/media/`',
    '',
    ...missing.map(
      (m) => `- [ ] \`public${m.src}\` — **${m.nodeLabel}** (\`${m.audience}\`): ${m.caption}`,
    ),
  ];
  const ok = await copyTextToClipboard(lines.join('\n') + '\n');
  if (ok) {
    copiedChecklist.value = true;
    pushToast('Đã copy checklist ảnh còn thiếu', 'success');
    if (resetTimer) clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      copiedChecklist.value = false;
    }, 1500);
  }
};

const triggerMediaUpload = (src: string) => {
  uploadTargetSrc.value = src;
  mediaUploadInputRef.value?.click();
};

const handleMediaFilePicked = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  const target = uploadTargetSrc.value;
  if (!file || !target) return;

  const res = await processAndUploadMediaFile(file, target, localUploadSupported.value);
  if (!res.ok) {
    pushToast(res.error, 'error');
    return;
  }
  if (res.mode === 'saved_local') {
    explorer.setDatasetOverride({
      ...explorer.dataset,
      hasRealMedia: res.existingMediaPaths.length > 0,
      existingMediaPaths: res.existingMediaPaths,
    });
    pushToast(`Đã nén & lưu vào public${res.src}`, 'success');
  } else {
    pushToast(`Đã tải ${res.filename} — chép vào public${target}`, 'info');
  }
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
          aria-label="Cài đặt Dev và Độ phủ Media"
          class="vbot-modal-panel flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700/80 dark:bg-[#0f172a]"
        >
          <div class="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div class="flex items-center gap-2.5">
              <span class="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-cyan-500/15 dark:text-cyan-300">
                <Settings class="h-4 w-4" />
              </span>
              <div>
                <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">
                  Cài đặt Workspace &amp; Độ phủ Media
                </h2>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  Lưu riêng trên máy cá nhân (localStorage) để mở thẳng code và theo dõi ảnh chụp màn hình.
                </p>
              </div>
            </div>

            <button
              type="button"
              aria-label="Đóng cài đặt"
              class="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              @click="close"
            >
              <X class="h-4 w-4" />
            </button>
          </div>

          <div class="flex items-center gap-1 border-b border-slate-200 bg-slate-50/70 px-5 py-2 dark:border-slate-800 dark:bg-slate-900/60">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition"
              :class="
                activeTab === 'paths'
                  ? 'bg-white text-indigo-700 shadow-2xs dark:bg-slate-800 dark:text-cyan-300'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              "
              @click="activeTab = 'paths'"
            >
              <FolderGit2 class="h-3.5 w-3.5" />
              Đường dẫn Code &amp; VBot Work
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition"
              :class="
                activeTab === 'media'
                  ? 'bg-white text-indigo-700 shadow-2xs dark:bg-slate-800 dark:text-cyan-300'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              "
              @click="activeTab = 'media'"
            >
              <ImageIcon class="h-3.5 w-3.5" />
              Độ phủ Media ({{ mediaCoverage.present }}/{{ mediaCoverage.total }})
            </button>
          </div>

          <div v-if="activeTab === 'paths'" class="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label class="space-y-1 text-xs">
                <span class="font-semibold text-slate-700 dark:text-slate-300">IDE mở file local</span>
                <select
                  v-model="form.preferredIde"
                  class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="antigravity-ide">Antigravity IDE (antigravity-ide://)</option>
                  <option value="antigravity">Antigravity (antigravity://)</option>
                  <option value="vscode">VS Code (vscode://)</option>
                  <option value="cursor">Cursor (cursor://)</option>
                </select>
              </label>

              <label class="space-y-1 text-xs">
                <span class="font-semibold text-slate-700 dark:text-slate-300">Nhánh Git mặc định (tùy chọn)</span>
                <input
                  v-model="form.branchOverride"
                  type="text"
                  :placeholder="explorer.dataset.app.techBranch || 'Nam-dev'"
                  class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
            </div>

            <div class="grid grid-cols-1 gap-3">
              <label class="space-y-1 text-xs">
                <span class="font-semibold text-slate-700 dark:text-slate-300">Đường dẫn local repo VBot-iOS</span>
                <input
                  v-model="form.localIosRepoPath"
                  type="text"
                  placeholder="VD: /Users/yourname/Documents/GitHub/VBot/VBot-iOS"
                  class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>

              <label class="space-y-1 text-xs">
                <span class="font-semibold text-slate-700 dark:text-slate-300">Đường dẫn local repo VBot-Android</span>
                <input
                  v-model="form.localAndroidRepoPath"
                  type="text"
                  placeholder="VD: /Users/yourname/Documents/GitHub/VBot/VBot-Android"
                  class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
            </div>

            <div class="grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2 dark:border-slate-800">
              <label class="space-y-1 text-xs">
                <span class="font-semibold text-slate-700 dark:text-slate-300">Git Web URL VBot-iOS</span>
                <input
                  v-model="form.iosRepoWebUrlOverride"
                  type="url"
                  :placeholder="explorer.dataset.app.repoConfig?.iosRepoWebUrl || 'https://github.com/.../VBot-iOS'"
                  class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>

              <label class="space-y-1 text-xs">
                <span class="font-semibold text-slate-700 dark:text-slate-300">Git Web URL VBot-Android</span>
                <input
                  v-model="form.androidRepoWebUrlOverride"
                  type="url"
                  :placeholder="explorer.dataset.app.repoConfig?.androidRepoWebUrl || 'https://github.com/.../VBot-Android'"
                  class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
            </div>

            <label class="block space-y-1 text-xs">
              <span class="font-semibold text-slate-700 dark:text-slate-300">URL VBot Work mặc định</span>
              <input
                v-model="form.vbotWorkBaseUrlOverride"
                type="url"
                :placeholder="explorer.dataset.app.repoConfig?.vbotWorkBaseUrl || 'https://work.vpmedia.vn'"
                class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>

            <div class="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-[11px] dark:border-slate-800 dark:bg-slate-900/70">
              <div class="mb-1.5 flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300">
                <Code2 class="h-3.5 w-3.5 text-indigo-600 dark:text-cyan-400" />
                Xem trước link mở code
              </div>
              <div class="space-y-1 font-mono text-[10.5px] break-all text-slate-600 dark:text-slate-400">
                <div><strong>iOS IDE:</strong> {{ previewIosIde ?? '(chưa nhập đường dẫn local iOS)' }}</div>
                <div><strong>Android IDE:</strong> {{ previewAndroidIde ?? '(chưa nhập đường dẫn local Android)' }}</div>
                <div v-if="previewIosWeb"><strong>iOS Git:</strong> {{ previewIosWeb }}</div>
                <div v-if="previewAndroidWeb"><strong>Android Git:</strong> {{ previewAndroidWeb }}</div>
              </div>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-2 pt-2">
              <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                @click="handleReset"
              >
                <RotateCcw class="h-3.5 w-3.5" />
                Khôi phục mặc định
              </button>
              <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400"
                @click="handleSave"
              >
                <Check class="h-3.5 w-3.5" />
                Lưu cài đặt
              </button>
            </div>
          </div>

          <div v-else class="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div class="space-y-3 border-b border-slate-200 bg-slate-50/70 px-5 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="text-xs text-slate-700 dark:text-slate-300">
                  Đã có <strong>{{ mediaCoverage.present }}</strong> / <strong>{{ mediaCoverage.total }}</strong> ảnh/video trong
                  <code class="font-mono text-indigo-700 dark:text-cyan-300">public/media/</code>
                  ({{ coveragePercent }}%)
                </div>
                <button
                  v-if="mediaCoverage.missing > 0"
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  @click="copyMissingChecklist"
                >
                  <Check v-if="copiedChecklist" class="h-3.5 w-3.5 text-emerald-500" />
                  <Copy v-else class="h-3.5 w-3.5" />
                  {{ copiedChecklist ? 'Đã copy checklist' : 'Copy checklist ảnh thiếu' }}
                </button>
              </div>
              <div class="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div
                  class="h-full rounded-full bg-emerald-500 transition-all"
                  :style="{ width: `${coveragePercent}%` }"
                />
              </div>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="tab in [
                    { id: 'all', label: `Tất cả (${mediaCoverage.total})` },
                    { id: 'missing', label: `Còn thiếu (${mediaCoverage.missing})` },
                    { id: 'present', label: `Đã có (${mediaCoverage.present})` },
                  ] as const"
                  :key="tab.id"
                  type="button"
                  class="rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition"
                  :class="
                    mediaFilter === tab.id
                      ? 'border-indigo-600 bg-indigo-600 text-white dark:border-cyan-500 dark:bg-cyan-500 dark:text-slate-950'
                      : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  "
                  @click="mediaFilter = tab.id"
                >
                  {{ tab.label }}
                </button>
              </div>
            </div>

            <div class="flex-1 overflow-y-auto p-5">
              <input
                ref="mediaUploadInputRef"
                type="file"
                accept="image/*,video/mp4,video/webm"
                class="hidden"
                @change="handleMediaFilePicked"
              />
              <ul class="space-y-2">
                <li
                  v-for="item in filteredMediaItems"
                  :key="`${item.nodeId}-${item.src}`"
                  class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-900/75"
                >
                  <div class="min-w-0 flex-1 space-y-0.5">
                    <div class="flex flex-wrap items-center gap-1.5">
                      <span
                        class="rounded px-1.5 py-0.5 text-[10px] font-bold"
                        :class="
                          item.exists
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                        "
                      >
                        {{ item.exists ? 'Đã có' : 'Thiếu file' }}
                      </span>
                      <code class="font-mono text-[11px] font-semibold text-slate-900 dark:text-slate-100">
                        public{{ item.src }}
                      </code>
                    </div>
                    <p class="truncate text-[11px] text-slate-500 dark:text-slate-400">
                      {{ item.nodeLabel }} · {{ item.caption }}
                    </p>
                  </div>

                  <div class="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-cyan-500/35 dark:bg-cyan-500/15 dark:text-cyan-300"
                      @click="triggerMediaUpload(item.src)"
                    >
                      <Upload class="h-3 w-3" />
                      {{ item.exists ? 'Thay' : 'Upload' }}
                    </button>
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:text-cyan-300"
                      @click="jumpToNode(item.nodeId)"
                    >
                      Xem node
                      <ExternalLink class="h-3 w-3" />
                    </button>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
