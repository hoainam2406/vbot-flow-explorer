<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  ChevronDown,
  ChevronUp,
  Code2,
  Columns2,
  Copy,
  FolderOpen,
  GitBranch,
  Loader2,
  Search,
  Settings,
  X,
} from 'lucide-vue-next';
import { useToast } from '../composables/useToast';
import { copyTextToClipboard } from '../core/downloadHelper';
import { highlightCodeLine } from '../core/jsonHighlight';
import {
  fetchLocalSourceFile,
  type SourcePeekLaunchContext,
  type SourcePeekResult,
} from '../core/sourcePeekClient';
import {
  buildIdeFileUrl,
  loadDevWorkspaceSettings,
} from '../core/workspaceSettings';

const props = defineProps<{
  open: boolean;
  context?: SourcePeekLaunchContext | null;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  openSettings: [];
}>();

const { pushToast } = useToast();

type ViewLayout = 'split' | 'ios' | 'android';
type ContentTab = 'source' | 'diff';

interface PanelState {
  loading: boolean;
  error: string | null;
  result: SourcePeekResult | null;
  tab: ContentTab;
  activeMatchIdx: number;
}

const createEmptyPanel = (): PanelState => ({
  loading: false,
  error: null,
  result: null,
  tab: 'source',
  activeMatchIdx: 0,
});

const layoutMode = ref<ViewLayout>('split');
const symbolQuery = ref('');
const selectedIosRef = ref('');
const selectedAndroidRef = ref('');
const iosPanel = ref<PanelState>(createEmptyPanel());
const androidPanel = ref<PanelState>(createEmptyPanel());
const copiedSide = ref<'ios' | 'android' | null>(null);
const iosScrollRef = ref<HTMLElement | null>(null);
const androidScrollRef = ref<HTMLElement | null>(null);

const iosOptions = computed(() => {
  const list = new Set<string>(props.context?.iosRefs ?? []);
  if (props.context?.iosRef) list.add(props.context.iosRef);
  return [...list];
});

const androidOptions = computed(() => {
  const list = new Set<string>(props.context?.androidRefs ?? []);
  if (props.context?.androidRef) list.add(props.context.androidRef);
  return [...list];
});

const close = () => emit('update:open', false);

const scrollToMatchedLine = async (side: 'ios' | 'android', lineNumber: number | null) => {
  if (!lineNumber) return;
  await nextTick();
  const container = side === 'ios' ? iosScrollRef.value : androidScrollRef.value;
  if (!container) return;
  const target = container.querySelector(`[data-line="${lineNumber}"]`);
  if (target instanceof HTMLElement) {
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
};

const loadSide = async (side: 'ios' | 'android', codeRef: string) => {
  const panel = side === 'ios' ? iosPanel : androidPanel;
  if (!codeRef.trim()) {
    panel.value = createEmptyPanel();
    return;
  }
  panel.value = {
    ...panel.value,
    loading: true,
    error: null,
  };
  const res = await fetchLocalSourceFile({
    codeRef,
    platform: side,
    symbolQuery: symbolQuery.value.trim() || undefined,
    includeGitDiff: true,
  });
  if (!res.ok) {
    panel.value = {
      ...createEmptyPanel(),
      error: res.error,
    };
    return;
  }
  const hasMatches = res.data.matchedLines.length > 0;
  const primaryIdx =
    hasMatches && res.data.primaryLine
      ? Math.max(0, res.data.matchedLines.indexOf(res.data.primaryLine))
      : 0;
  panel.value = {
    loading: false,
    error: null,
    result: res.data,
    tab: panel.value.tab === 'diff' && res.data.gitDiff ? 'diff' : 'source',
    activeMatchIdx: primaryIdx,
  };
  if (res.data.primaryLine) {
    await scrollToMatchedLine(side, res.data.primaryLine);
  }
};

const reloadAll = async () => {
  const jobs: Promise<void>[] = [];
  if (selectedIosRef.value) jobs.push(loadSide('ios', selectedIosRef.value));
  else iosPanel.value = createEmptyPanel();

  if (selectedAndroidRef.value) jobs.push(loadSide('android', selectedAndroidRef.value));
  else androidPanel.value = createEmptyPanel();

  await Promise.all(jobs);
};

const stepMatch = async (side: 'ios' | 'android', delta: 1 | -1) => {
  const panel = side === 'ios' ? iosPanel : androidPanel;
  const matches = panel.value.result?.matchedLines ?? [];
  if (matches.length === 0) return;
  const nextIdx = (panel.value.activeMatchIdx + delta + matches.length) % matches.length;
  panel.value = { ...panel.value, activeMatchIdx: nextIdx };
  await scrollToMatchedLine(side, matches[nextIdx] ?? null);
};

const openInIde = (side: 'ios' | 'android', refText: string) => {
  const panel = side === 'ios' ? iosPanel.value : androidPanel.value;
  const line =
    panel.result?.matchedLines[panel.activeMatchIdx] ?? panel.result?.primaryLine ?? undefined;
  const url = buildIdeFileUrl(refText, loadDevWorkspaceSettings(), line ?? undefined);
  if (!url) {
    pushToast('Chưa cấu hình đường dẫn repo local trong Cài đặt Dev', 'info');
    emit('openSettings');
    return;
  }
  window.open(url, '_self');
};

const copySnippet = async (side: 'ios' | 'android') => {
  const res = side === 'ios' ? iosPanel.value.result : androidPanel.value.result;
  if (!res) return;
  const panel = side === 'ios' ? iosPanel.value : androidPanel.value;
  const text = panel.tab === 'diff' && res.gitDiff ? res.gitDiff : res.content;
  const ok = await copyTextToClipboard(text);
  if (ok) {
    copiedSide.value = side;
    pushToast(`Đã copy nội dung ${side === 'ios' ? 'iOS' : 'Android'}`, 'success');
    setTimeout(() => {
      if (copiedSide.value === side) copiedSide.value = null;
    }, 1500);
  }
};

const buildSourceLines = (res: SourcePeekResult | null): string[] => {
  if (!res) return [];
  return res.content.split('\n');
};

const onWindowKeyDown = (event: KeyboardEvent) => {
  if (props.open && event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    close();
  }
};

watch(
  () => [props.open, props.context] as const,
  async ([isOpen, ctx]) => {
    if (!isOpen) {
      window.removeEventListener('keydown', onWindowKeyDown, true);
      return;
    }
    window.addEventListener('keydown', onWindowKeyDown, true);
    symbolQuery.value = ctx?.symbolQuery ?? '';
    selectedIosRef.value = ctx?.iosRef ?? ctx?.iosRefs?.[0] ?? '';
    selectedAndroidRef.value = ctx?.androidRef ?? ctx?.androidRefs?.[0] ?? '';
    if (selectedIosRef.value && selectedAndroidRef.value) {
      layoutMode.value = 'split';
    } else if (selectedIosRef.value) {
      layoutMode.value = 'ios';
    } else if (selectedAndroidRef.value) {
      layoutMode.value = 'android';
    } else {
      layoutMode.value = 'split';
    }
    await reloadAll();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeyDown, true);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="vbot-modal">
      <div
        v-if="props.open"
        class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-xs sm:p-5"
        @click.self="close"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Soi & So sánh Source Code iOS và Android"
          class="vbot-modal-panel flex h-[90vh] w-full max-w-[1440px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700/80 dark:bg-[#0b1120]"
        >
          <!-- Header -->
          <header class="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-200 bg-slate-50/90 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/90">
            <div class="flex min-w-0 items-center gap-2.5">
              <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 dark:bg-cyan-500/15 dark:text-cyan-300 dark:ring-cyan-500/35">
                <Code2 class="h-4 w-4" />
              </span>
              <div class="min-w-0">
                <h2 class="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                  Source Peek &amp; Đối chiếu Swift ↔ Kotlin
                  <span v-if="props.context?.title" class="font-normal text-slate-500 dark:text-slate-400">
                    — {{ props.context.title }}
                  </span>
                </h2>
                <p class="text-[11px] text-slate-500 dark:text-slate-400">
                  Đọc trực tiếp từ repo local đã cấu hình trong Cài đặt Dev (chỉ hoạt động khi chạy <code class="font-mono">pnpm dev</code>).
                </p>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <div class="relative">
                <Search class="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  v-model="symbolQuery"
                  type="text"
                  placeholder="Tìm symbol / hàm (Enter)..."
                  class="w-48 rounded-lg border border-slate-200 bg-white py-1.5 pr-2.5 pl-8 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none sm:w-56 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  @keydown.enter.prevent="reloadAll()"
                />
              </div>

              <button
                type="button"
                class="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 dark:bg-cyan-500 dark:text-slate-950"
                @click="reloadAll()"
              >
                Tìm / Tải lại
              </button>

              <div class="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-[11px] font-semibold dark:border-slate-700 dark:bg-slate-800">
                <button
                  type="button"
                  class="inline-flex items-center gap-1 rounded-md px-2 py-1 transition"
                  :class="layoutMode === 'split' ? 'bg-white text-slate-900 shadow-2xs dark:bg-slate-700 dark:text-white' : 'text-slate-600 dark:text-slate-300'"
                  @click="layoutMode = 'split'"
                >
                  <Columns2 class="h-3 w-3" />
                  Song song
                </button>
                <button
                  type="button"
                  class="rounded-md px-2 py-1 transition"
                  :class="layoutMode === 'ios' ? 'bg-white text-indigo-700 shadow-2xs dark:bg-slate-700 dark:text-indigo-200' : 'text-slate-600 dark:text-slate-300'"
                  @click="layoutMode = 'ios'"
                >
                  iOS
                </button>
                <button
                  type="button"
                  class="rounded-md px-2 py-1 transition"
                  :class="layoutMode === 'android' ? 'bg-white text-emerald-700 shadow-2xs dark:bg-slate-700 dark:text-emerald-200' : 'text-slate-600 dark:text-slate-300'"
                  @click="layoutMode = 'android'"
                >
                  Android
                </button>
              </div>

              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                @click="emit('openSettings')"
              >
                <Settings class="h-3.5 w-3.5" />
                Đường dẫn Repo
              </button>

              <button
                type="button"
                aria-label="Đóng Source Peek"
                class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                @click="close"
              >
                <X class="h-4 w-4" />
              </button>
            </div>
          </header>

          <!-- Panes -->
          <div
            class="grid min-h-0 flex-1 divide-y divide-slate-200 overflow-hidden dark:divide-slate-800"
            :class="layoutMode === 'split' ? 'lg:grid-cols-2 lg:divide-x lg:divide-y-0' : 'grid-cols-1'"
          >
            <!-- iOS Pane -->
            <section
              v-if="layoutMode === 'split' || layoutMode === 'ios'"
              class="flex min-h-0 flex-col overflow-hidden bg-[#0b1120] text-slate-100"
            >
              <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/95 px-3.5 py-2 text-xs">
                <div class="flex min-w-0 flex-1 items-center gap-2">
                  <span class="shrink-0 rounded bg-indigo-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-indigo-300">
                    iOS · Swift
                  </span>
                  <select
                    v-if="iosOptions.length > 0"
                    v-model="selectedIosRef"
                    class="min-w-0 flex-1 truncate rounded border border-slate-700 bg-slate-800 px-2 py-1 font-mono text-[11px] text-slate-200"
                    @change="loadSide('ios', selectedIosRef)"
                  >
                    <option v-for="refPath in iosOptions" :key="refPath" :value="refPath">
                      {{ refPath }}
                    </option>
                  </select>
                  <span v-else class="text-[11px] italic text-slate-500">Không có codeRef iOS</span>
                </div>

                <div v-if="iosPanel.result" class="flex items-center gap-1.5">
                  <div v-if="iosPanel.result.matchedLines.length > 0" class="flex items-center gap-0.5 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 font-mono text-[10px]">
                    <span class="text-cyan-300">
                      {{ iosPanel.activeMatchIdx + 1 }}/{{ iosPanel.result.matchedLines.length }}
                    </span>
                    <button type="button" class="p-0.5 hover:text-white" @click="stepMatch('ios', -1)">
                      <ChevronUp class="h-3 w-3" />
                    </button>
                    <button type="button" class="p-0.5 hover:text-white" @click="stepMatch('ios', 1)">
                      <ChevronDown class="h-3 w-3" />
                    </button>
                  </div>

                  <div v-if="iosPanel.result.gitDiff" class="inline-flex rounded border border-slate-700 bg-slate-800 p-0.5 text-[10px] font-semibold">
                    <button
                      type="button"
                      class="rounded px-1.5 py-0.5"
                      :class="iosPanel.tab === 'source' ? 'bg-slate-700 text-white' : 'text-slate-400'"
                      @click="iosPanel.tab = 'source'"
                    >
                      Source
                    </button>
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 rounded px-1.5 py-0.5"
                      :class="iosPanel.tab === 'diff' ? 'bg-amber-500/25 text-amber-300' : 'text-slate-400'"
                      @click="iosPanel.tab = 'diff'"
                    >
                      <GitBranch class="h-2.5 w-2.5" />
                      Git Diff
                    </button>
                  </div>

                  <button
                    type="button"
                    class="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[10.5px] font-semibold text-slate-200 hover:bg-slate-700"
                    title="Mở đúng dòng trong IDE"
                    @click="openInIde('ios', selectedIosRef)"
                  >
                    <FolderOpen class="h-3 w-3" />
                    IDE
                  </button>

                  <button
                    type="button"
                    class="rounded border border-slate-700 bg-slate-800 p-1 text-slate-300 hover:bg-slate-700"
                    title="Copy nội dung"
                    @click="copySnippet('ios')"
                  >
                    <Check v-if="copiedSide === 'ios'" class="h-3.5 w-3.5 text-emerald-400" />
                    <Copy v-else class="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div v-if="iosPanel.loading" class="flex flex-1 items-center justify-center gap-2 text-xs text-slate-400">
                <Loader2 class="h-4 w-4 animate-spin text-cyan-400" />
                Đang đọc file từ VBot-iOS...
              </div>
              <div v-else-if="iosPanel.error" class="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-xs text-amber-300">
                <AlertTriangle class="h-6 w-6" />
                <p class="max-w-md">{{ iosPanel.error }}</p>
                <button
                  type="button"
                  class="rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 font-semibold hover:bg-amber-500/25"
                  @click="emit('openSettings')"
                >
                  Cấu hình đường dẫn VBot-iOS
                </button>
              </div>
              <div v-else-if="!iosPanel.result" class="flex flex-1 items-center justify-center p-6 text-xs text-slate-500">
                Chưa chọn file iOS để hiển thị.
              </div>
              <div v-else ref="iosScrollRef" class="min-h-0 flex-1 overflow-auto font-mono text-[11.5px] leading-5">
                <pre
                  v-if="iosPanel.tab === 'diff' && iosPanel.result.gitDiff"
                  class="p-3 whitespace-pre text-amber-100"
                >{{ iosPanel.result.gitDiff }}</pre>
                <table v-else class="w-full border-collapse">
                  <tbody>
                    <tr
                      v-for="(lineText, idx) in buildSourceLines(iosPanel.result)"
                      :key="idx"
                      :data-line="idx + 1"
                      :class="
                        iosPanel.result.matchedLines.includes(idx + 1)
                          ? 'bg-cyan-500/18'
                          : 'hover:bg-slate-800/45'
                      "
                    >
                      <td class="w-12 shrink-0 border-r border-slate-800/80 pr-2.5 pl-2 text-right text-[10.5px] text-slate-500 select-none">
                        {{ idx + 1 }}
                      </td>
                      <td
                        class="pr-4 pl-3 whitespace-pre text-slate-200"
                        v-html="highlightCodeLine(lineText, iosPanel.result.language)"
                      />
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <!-- Android Pane -->
            <section
              v-if="layoutMode === 'split' || layoutMode === 'android'"
              class="flex min-h-0 flex-col overflow-hidden bg-[#0b1120] text-slate-100"
            >
              <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/95 px-3.5 py-2 text-xs">
                <div class="flex min-w-0 flex-1 items-center gap-2">
                  <span class="shrink-0 rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-300">
                    Android · Kotlin
                  </span>
                  <select
                    v-if="androidOptions.length > 0"
                    v-model="selectedAndroidRef"
                    class="min-w-0 flex-1 truncate rounded border border-slate-700 bg-slate-800 px-2 py-1 font-mono text-[11px] text-slate-200"
                    @change="loadSide('android', selectedAndroidRef)"
                  >
                    <option v-for="refPath in androidOptions" :key="refPath" :value="refPath">
                      {{ refPath }}
                    </option>
                  </select>
                  <span v-else class="text-[11px] italic text-slate-500">Không có codeRef Android</span>
                </div>

                <div v-if="androidPanel.result" class="flex items-center gap-1.5">
                  <div v-if="androidPanel.result.matchedLines.length > 0" class="flex items-center gap-0.5 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 font-mono text-[10px]">
                    <span class="text-emerald-300">
                      {{ androidPanel.activeMatchIdx + 1 }}/{{ androidPanel.result.matchedLines.length }}
                    </span>
                    <button type="button" class="p-0.5 hover:text-white" @click="stepMatch('android', -1)">
                      <ChevronUp class="h-3 w-3" />
                    </button>
                    <button type="button" class="p-0.5 hover:text-white" @click="stepMatch('android', 1)">
                      <ChevronDown class="h-3 w-3" />
                    </button>
                  </div>

                  <div v-if="androidPanel.result.gitDiff" class="inline-flex rounded border border-slate-700 bg-slate-800 p-0.5 text-[10px] font-semibold">
                    <button
                      type="button"
                      class="rounded px-1.5 py-0.5"
                      :class="androidPanel.tab === 'source' ? 'bg-slate-700 text-white' : 'text-slate-400'"
                      @click="androidPanel.tab = 'source'"
                    >
                      Source
                    </button>
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 rounded px-1.5 py-0.5"
                      :class="androidPanel.tab === 'diff' ? 'bg-amber-500/25 text-amber-300' : 'text-slate-400'"
                      @click="androidPanel.tab = 'diff'"
                    >
                      <GitBranch class="h-2.5 w-2.5" />
                      Git Diff
                    </button>
                  </div>

                  <button
                    type="button"
                    class="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[10.5px] font-semibold text-slate-200 hover:bg-slate-700"
                    title="Mở đúng dòng trong IDE"
                    @click="openInIde('android', selectedAndroidRef)"
                  >
                    <FolderOpen class="h-3 w-3" />
                    IDE
                  </button>

                  <button
                    type="button"
                    class="rounded border border-slate-700 bg-slate-800 p-1 text-slate-300 hover:bg-slate-700"
                    title="Copy nội dung"
                    @click="copySnippet('android')"
                  >
                    <Check v-if="copiedSide === 'android'" class="h-3.5 w-3.5 text-emerald-400" />
                    <Copy v-else class="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div v-if="androidPanel.loading" class="flex flex-1 items-center justify-center gap-2 text-xs text-slate-400">
                <Loader2 class="h-4 w-4 animate-spin text-emerald-400" />
                Đang đọc file từ VBot-Android...
              </div>
              <div v-else-if="androidPanel.error" class="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-xs text-amber-300">
                <AlertTriangle class="h-6 w-6" />
                <p class="max-w-md">{{ androidPanel.error }}</p>
                <button
                  type="button"
                  class="rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 font-semibold hover:bg-amber-500/25"
                  @click="emit('openSettings')"
                >
                  Cấu hình đường dẫn VBot-Android
                </button>
              </div>
              <div v-else-if="!androidPanel.result" class="flex flex-1 items-center justify-center p-6 text-xs text-slate-500">
                Chưa chọn file Android để hiển thị.
              </div>
              <div v-else ref="androidScrollRef" class="min-h-0 flex-1 overflow-auto font-mono text-[11.5px] leading-5">
                <pre
                  v-if="androidPanel.tab === 'diff' && androidPanel.result.gitDiff"
                  class="p-3 whitespace-pre text-amber-100"
                >{{ androidPanel.result.gitDiff }}</pre>
                <table v-else class="w-full border-collapse">
                  <tbody>
                    <tr
                      v-for="(lineText, idx) in buildSourceLines(androidPanel.result)"
                      :key="idx"
                      :data-line="idx + 1"
                      :class="
                        androidPanel.result.matchedLines.includes(idx + 1)
                          ? 'bg-emerald-500/18'
                          : 'hover:bg-slate-800/45'
                      "
                    >
                      <td class="w-12 shrink-0 border-r border-slate-800/80 pr-2.5 pl-2 text-right text-[10.5px] text-slate-500 select-none">
                        {{ idx + 1 }}
                      </td>
                      <td
                        class="pr-4 pl-3 whitespace-pre text-slate-200"
                        v-html="highlightCodeLine(lineText, androidPanel.result.language)"
                      />
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <footer class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            <div class="flex items-center gap-2">
              <ArrowLeftRight class="h-3.5 w-3.5 text-cyan-500" />
              <span v-if="iosPanel.result">iOS: {{ iosPanel.result.resolvedRelPath }} ({{ iosPanel.result.totalLines }} dòng)</span>
              <span v-if="iosPanel.result && androidPanel.result">·</span>
              <span v-if="androidPanel.result">Android: {{ androidPanel.result.resolvedRelPath }} ({{ androidPanel.result.totalLines }} dòng)</span>
            </div>
            <span>Esc để đóng</span>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
