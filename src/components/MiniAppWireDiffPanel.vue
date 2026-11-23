<script setup lang="ts">
import { computed, ref } from 'vue';
import { ArrowLeftRight, Check, Copy, Upload } from 'lucide-vue-next';
import { useToast } from '../composables/useToast';
import { copyTextToClipboard } from '../core/downloadHelper';
import type { MiniAppContract } from '../core/miniAppContractBuilder';
import {
  createInitialHostState,
  executeHostCommand,
  type SandboxHostConfig,
  type SandboxWireLogEntry,
} from '../core/miniAppSandboxEngine';
import { compareWireSessions, exportWireDiffMarkdown } from '../core/miniAppWireDiff';
import {
  buildWireSessionObject,
  parseWireSessionJson,
  type WireSessionFile,
} from '../core/miniAppWireSession';

const props = defineProps<{
  contract: MiniAppContract;
  currentConfig: SandboxHostConfig;
  currentWireLogs: SandboxWireLogEntry[];
}>();

const { pushToast } = useToast();

const customSessionA = ref<WireSessionFile | null>(null);
const customSessionB = ref<WireSessionFile | null>(null);
const ignoreVolatile = ref(true);
const onlyDiffs = ref(false);
const copiedMd = ref(false);
const fileInputARef = ref<HTMLInputElement | null>(null);
const fileInputBRef = ref<HTMLInputElement | null>(null);

const currentLiveSession = computed<WireSessionFile>(() =>
  buildWireSessionObject(props.currentConfig, props.currentWireLogs),
);

const sessionA = computed<WireSessionFile>(() => customSessionA.value ?? currentLiveSession.value);

const buildBaselineSession = (platform: 'ios' | 'android'): WireSessionFile => {
  const cfg: SandboxHostConfig = { ...props.currentConfig, platform };
  let state = createInitialHostState(cfg);

  const frames: SandboxWireLogEntry[] = [];
  for (const cmd of props.contract.outgoingCommands.slice(0, 8)) {
    const res = executeHostCommand(cmd.method, { ...cmd.validExample }, cfg, state);
    state = res.nextState;
    frames.push(...res.wireFrames);
  }
  return buildWireSessionObject(cfg, frames);
};

const sessionB = computed<WireSessionFile>(() => {
  if (customSessionB.value) return customSessionB.value;
  return buildBaselineSession(sessionA.value.hostConfig.platform === 'ios' ? 'android' : 'ios');
});

const diffReport = computed(() =>
  compareWireSessions(sessionA.value, sessionB.value, {
    ignoreVolatileFields: ignoreVolatile.value,
  }),
);

const visibleRows = computed(() =>
  onlyDiffs.value
    ? diffReport.value.rows.filter((r) => r.kind !== 'same')
    : diffReport.value.rows,
);

const runQuickIosVsAndroid = () => {
  customSessionA.value = buildBaselineSession('ios');
  customSessionB.value = buildBaselineSession('android');
  pushToast(`Đã chạy đối chiếu iOS vs Android cho ${props.contract.app.id}`, 'success');
};

const handleFilePick = async (slot: 'A' | 'B', event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = parseWireSessionJson(text);
    if (!parsed.ok) {
      pushToast(parsed.error, 'error');
      return;
    }
    if (slot === 'A') customSessionA.value = parsed.session;
    else customSessionB.value = parsed.session;
    pushToast(`Đã nạp Phiên ${slot}: ${parsed.session.appId} (${parsed.session.hostConfig.platform})`, 'success');
  } catch {
    pushToast('Không thể đọc file phiên JSON', 'error');
  }
};

const copyDiffMarkdown = async () => {
  const md = exportWireDiffMarkdown(diffReport.value);
  const ok = await copyTextToClipboard(md);
  if (ok) {
    copiedMd.value = true;
    pushToast('Đã copy báo cáo Wire Diff (.md)', 'success');
    setTimeout(() => {
      copiedMd.value = false;
    }, 1500);
  }
};

const KIND_BADGE: Record<string, { label: string; cls: string }> = {
  same: {
    label: 'Khớp',
    cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300',
  },
  status_changed: {
    label: 'Khác Status',
    cls: 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300',
  },
  payload_diff: {
    label: 'Khác Payload',
    cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
  },
  added: {
    label: 'Chỉ có ở B',
    cls: 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300',
  },
  removed: {
    label: 'Chỉ có ở A',
    cls: 'bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-300',
  },
};
</script>

<template>
  <div class="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
    <input ref="fileInputARef" type="file" accept="application/json,.json" class="hidden" @change="handleFilePick('A', $event)" />
    <input ref="fileInputBRef" type="file" accept="application/json,.json" class="hidden" @change="handleFilePick('B', $event)" />

    <div class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/80">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">
            So sánh 2 phiên Wire Log (Wire Diff)
          </h3>
          <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Đối chiếu thứ tự gọi Bridge, status trả về và từng trường JSON giữa 2 phiên iOS / Android hoặc trước &amp; sau khi sửa Mini App.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-indigo-500 dark:bg-cyan-500 dark:text-slate-950"
            @click="runQuickIosVsAndroid"
          >
            <ArrowLeftRight class="h-3.5 w-3.5" />
            Đối chiếu nhanh iOS vs Android
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            @click="copyDiffMarkdown"
          >
            <Check v-if="copiedMd" class="h-3.5 w-3.5 text-emerald-500" />
            <Copy v-else class="h-3.5 w-3.5" />
            Copy Diff (.md)
          </button>
        </div>
      </div>

      <!-- Session A & B cards -->
      <div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div class="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950/60">
          <div>
            <div class="font-bold text-slate-800 dark:text-slate-200">
              Phiên A: {{ customSessionA ? 'File đã nạp' : 'Sandbox hiện tại' }}
            </div>
            <div class="font-mono text-[11px] text-slate-500 dark:text-slate-400">
              {{ sessionA.appId }} · {{ sessionA.hostConfig.platform }} · {{ sessionA.wireLogs.length }} frames
            </div>
          </div>
          <div class="flex items-center gap-1.5">
            <button
              v-if="customSessionA"
              type="button"
              class="rounded border border-slate-200 bg-white px-2 py-1 text-[10.5px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              @click="customSessionA = null"
            >
              Dùng Sandbox
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[10.5px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              @click="fileInputARef?.click()"
            >
              <Upload class="h-3 w-3" />
              Nạp .json
            </button>
          </div>
        </div>

        <div class="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950/60">
          <div>
            <div class="font-bold text-slate-800 dark:text-slate-200">
              Phiên B: {{ customSessionB ? 'File đã nạp' : 'Chuẩn tự sinh đối chiếu' }}
            </div>
            <div class="font-mono text-[11px] text-slate-500 dark:text-slate-400">
              {{ sessionB.appId }} · {{ sessionB.hostConfig.platform }} · {{ sessionB.wireLogs.length }} frames
            </div>
          </div>
          <div class="flex items-center gap-1.5">
            <button
              v-if="customSessionB"
              type="button"
              class="rounded border border-slate-200 bg-white px-2 py-1 text-[10.5px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              @click="customSessionB = null"
            >
              Reset
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[10.5px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              @click="fileInputBRef?.click()"
            >
              <Upload class="h-3 w-3" />
              Nạp .json
            </button>
          </div>
        </div>
      </div>

      <!-- Summary & Filters -->
      <div class="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="rounded-full bg-emerald-100 px-2.5 py-0.5 font-bold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
            Khớp: {{ diffReport.summary.same }}
          </span>
          <span class="rounded-full bg-amber-100 px-2.5 py-0.5 font-bold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
            Khác Payload: {{ diffReport.summary.payloadDiff }}
          </span>
          <span class="rounded-full bg-rose-100 px-2.5 py-0.5 font-bold text-rose-800 dark:bg-rose-500/20 dark:text-rose-300">
            Khác Status: {{ diffReport.summary.statusChanged }}
          </span>
          <span class="rounded-full bg-sky-100 px-2.5 py-0.5 font-bold text-sky-800 dark:bg-sky-500/20 dark:text-sky-300">
            Thêm/Thiếu: {{ diffReport.summary.added + diffReport.summary.removed }}
          </span>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <label class="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
            <input v-model="ignoreVolatile" type="checkbox" class="rounded" />
            Bỏ qua field động (request_id, timestamp)
          </label>
          <label class="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
            <input v-model="onlyDiffs" type="checkbox" class="rounded" />
            Chỉ hiện điểm khác
          </label>
        </div>
      </div>
    </div>

    <!-- Diff Rows -->
    <div v-if="visibleRows.length === 0" class="rounded-xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/75">
      Không có sai lệch nào giữa Phiên A và Phiên B.
    </div>

    <div v-else class="space-y-2">
      <div
        v-for="row in visibleRows"
        :key="`${row.index}-${row.key}`"
        class="rounded-xl border border-slate-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-900/75"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="font-mono text-[10.5px] text-slate-400">#{{ row.index + 1 }}</span>
            <code class="font-mono font-bold text-slate-900 dark:text-slate-100">
              {{ row.entryA?.methodOrEvent ?? row.entryB?.methodOrEvent ?? row.key }}
            </code>
            <span class="text-[10.5px] text-slate-500">
              {{ row.entryA?.direction ?? row.entryB?.direction }}
            </span>
          </div>
          <span class="rounded-full px-2 py-0.5 font-mono text-[10px] font-bold" :class="KIND_BADGE[row.kind].cls">
            {{ KIND_BADGE[row.kind].label }}
          </span>
        </div>

        <div v-if="row.fieldDiffs.length > 0" class="mt-2 space-y-1 rounded-lg bg-slate-50 p-2 font-mono text-[10.5px] dark:bg-slate-950/70">
          <div v-for="fd in row.fieldDiffs" :key="fd.path" class="flex flex-wrap items-center gap-1.5">
            <strong class="text-indigo-700 dark:text-cyan-300">{{ fd.path }}:</strong>
            <span class="rounded bg-rose-100/80 px-1 text-rose-800 dark:bg-rose-500/20 dark:text-rose-200">
              {{ JSON.stringify(fd.valueA) ?? 'undefined' }}
            </span>
            <span>→</span>
            <span class="rounded bg-emerald-100/80 px-1 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200">
              {{ JSON.stringify(fd.valueB) ?? 'undefined' }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
