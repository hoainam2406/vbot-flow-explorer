<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import {
  AlertTriangle,
  Check,
  Code2,
  Copy,
  ExternalLink,
  Search,
} from 'lucide-vue-next';
import { FLOW_EXPLORER_KEY } from '../composables/useFlowExplorer';
import { useToast } from '../composables/useToast';
import {
  buildApiAtlas,
  exportApiAtlasMarkdown,
  type ApiAtlasEntry,
  type ApiAtlasKind,
} from '../core/apiAtlasEngine';
import { copyTextToClipboard } from '../core/downloadHelper';
import { findNodeById } from '../core/graphEngine';
import {
  extractCodeRefsByPlatform,
  type SourcePeekLaunchContext,
} from '../core/sourcePeekClient';

const emit = defineEmits<{
  jumpToNode: [nodeId: string];
  openSourcePeek: [context: SourcePeekLaunchContext];
}>();

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const { pushToast } = useToast();
const kindFilter = ref<'all' | ApiAtlasKind>('all');
const onlyMismatch = ref(false);
const query = ref('');
const copiedMd = ref(false);

const atlas = computed(() => buildApiAtlas(explorer.dataset));

const filteredEntries = computed(() => {
  const q = query.value.trim().toLowerCase();
  return atlas.value.entries.filter((entry) => {
    if (kindFilter.value !== 'all' && entry.kind !== kindFilter.value) return false;
    if (onlyMismatch.value && !entry.hasPlatformMismatch) return false;
    if (!q) return true;
    const hay = [
      entry.token,
      entry.mismatchNote ?? '',
      ...entry.nodes.map((n) => `${n.nodeId} ${n.nodeLabel} ${n.branchLabel}`),
    ]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
});

const KIND_META: Record<ApiAtlasKind, { label: string; cls: string }> = {
  rest: {
    label: 'REST API',
    cls: 'border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-500/35 dark:bg-indigo-500/15 dark:text-indigo-200',
  },
  websocket: {
    label: 'WebSocket',
    cls: 'border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-500/35 dark:bg-cyan-500/15 dark:text-cyan-200',
  },
  sip_dtmf: {
    label: 'SIP / DTMF',
    cls: 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-500/35 dark:bg-violet-500/15 dark:text-violet-200',
  },
  bridge: {
    label: 'Bridge',
    cls: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-200',
  },
  error_code: {
    label: 'Error Code',
    cls: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/35 dark:bg-rose-500/15 dark:text-rose-200',
  },
};

const copyAtlasMarkdown = async () => {
  const ok = await copyTextToClipboard(exportApiAtlasMarkdown(atlas.value));
  if (ok) {
    copiedMd.value = true;
    pushToast('Đã copy API & Event Atlas (.md)', 'success');
    setTimeout(() => {
      copiedMd.value = false;
    }, 1500);
  }
};

const openSourceForEntry = (entry: ApiAtlasEntry, nodeId: string) => {
  const node = findNodeById(explorer.dataset, nodeId);
  if (!node) return;
  const grouped = extractCodeRefsByPlatform(node);
  if (grouped.ios.length === 0 && grouped.android.length === 0) {
    pushToast('Node này chưa gắn codeRefs', 'info');
    return;
  }
  const symbolToken = entry.token.split(/\s+/).pop() ?? '';
  emit('openSourcePeek', {
    title: `${entry.token} — ${node.techLabel || node.label}`,
    nodeId,
    iosRef: grouped.ios[0],
    androidRef: grouped.android[0],
    iosRefs: grouped.ios,
    androidRefs: grouped.android,
    symbolQuery: symbolToken.length >= 4 && !symbolToken.includes('/') ? symbolToken : undefined,
  });
};
</script>

<template>
  <div class="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 text-xs">
    <div class="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/80">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">
            API, WebSocket, SIP &amp; Error-Code Atlas ({{ atlas.totalEntries }} mục)
          </h3>
          <p class="mt-0.5 text-slate-500 dark:text-slate-400">
            Bản đồ tra cứu ngược mọi endpoint, socket event, SIP/DTMF, Bridge command và mã lỗi trên toàn bộ luồng.
          </p>
        </div>

        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          @click="copyAtlasMarkdown"
        >
          <Check v-if="copiedMd" class="h-3.5 w-3.5 text-emerald-500" />
          <Copy v-else class="h-3.5 w-3.5" />
          {{ copiedMd ? 'Đã copy Atlas MD' : 'Copy Atlas (.md)' }}
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <div class="relative min-w-56 flex-1">
          <Search class="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            v-model="query"
            type="text"
            placeholder="Tìm endpoint, vbot.state, UPDATE_STATE, 401, make_call..."
            class="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pr-3 pl-9 text-xs text-slate-900 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>

        <label class="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 font-semibold text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200">
          <input v-model="onlyMismatch" type="checkbox" class="rounded" />
          <AlertTriangle class="h-3.5 w-3.5" />
          <span>Chỉ mục lệch iOS ↔ Android ({{ atlas.mismatchCount }})</span>
        </label>
      </div>

      <div class="flex flex-wrap gap-1.5">
        <button
          type="button"
          class="rounded-full border px-2.5 py-1 text-[11px] font-semibold transition"
          :class="
            kindFilter === 'all'
              ? 'border-slate-900 bg-slate-900 text-white dark:border-cyan-500 dark:bg-cyan-500 dark:text-slate-950'
              : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
          "
          @click="kindFilter = 'all'"
        >
          Tất cả ({{ atlas.totalEntries }})
        </button>
        <button
          v-for="k in (['rest', 'websocket', 'sip_dtmf', 'bridge', 'error_code'] as const)"
          :key="k"
          type="button"
          class="rounded-full border px-2.5 py-1 text-[11px] font-semibold transition"
          :class="
            kindFilter === k
              ? 'border-indigo-600 bg-indigo-600 text-white dark:border-cyan-500 dark:bg-cyan-500 dark:text-slate-950'
              : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
          "
          @click="kindFilter = k"
        >
          {{ KIND_META[k].label }} ({{ atlas.byKind[k] }})
        </button>
      </div>
    </div>

    <p v-if="filteredEntries.length === 0" class="py-10 text-center text-slate-500">
      Không có mục nào khớp bộ lọc hiện tại.
    </p>

    <ul v-else class="space-y-2">
      <li
        v-for="entry in filteredEntries"
        :key="entry.id"
        class="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900/80"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex min-w-0 flex-wrap items-center gap-1.5">
            <span class="rounded border px-1.5 py-0.5 text-[10px] font-bold" :class="KIND_META[entry.kind].cls">
              {{ KIND_META[entry.kind].label }}
            </span>
            <code class="font-mono text-xs font-bold break-all text-slate-900 dark:text-cyan-200">
              {{ entry.token }}
            </code>
            <span
              v-if="entry.hasPlatformMismatch"
              class="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900 dark:bg-amber-500/20 dark:text-amber-300"
            >
              <AlertTriangle class="h-3 w-3" />
              Có lệch iOS/Android
            </span>
          </div>

          <div class="flex items-center gap-1">
            <span
              v-for="plat in entry.platforms"
              :key="plat"
              class="rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase"
              :class="plat === 'ios' ? 'bg-slate-800 text-white' : 'bg-emerald-600 text-white'"
            >
              {{ plat }}
            </span>
          </div>
        </div>

        <p v-if="entry.mismatchNote" class="mt-1.5 text-[11px] text-amber-800 dark:text-amber-300">
          {{ entry.mismatchNote }}
        </p>

        <div class="mt-2.5 flex flex-wrap gap-1.5">
          <div
            v-for="refNode in entry.nodes"
            :key="refNode.nodeId"
            class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-800/80"
          >
            <button
              type="button"
              class="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-800 hover:text-indigo-600 dark:text-slate-200 dark:hover:text-cyan-300"
              @click="emit('jumpToNode', refNode.nodeId)"
            >
              <span>{{ refNode.nodeLabel }}</span>
              <span class="font-mono text-[9.5px] text-slate-400">({{ refNode.branchLabel }})</span>
              <ExternalLink class="h-3 w-3" />
            </button>
            <button
              v-if="refNode.codeRefs.length > 0"
              type="button"
              class="rounded p-0.5 text-slate-400 hover:bg-white hover:text-cyan-500 dark:hover:bg-slate-700"
              title="Soi code Swift ↔ Kotlin"
              @click="openSourceForEntry(entry, refNode.nodeId)"
            >
              <Code2 class="h-3 w-3" />
            </button>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>
