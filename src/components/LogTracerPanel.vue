<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import {
  AlertTriangle,
  Bug,
  Check,
  Code2,
  Eye,
  ExternalLink,
  Sparkles,
  Trash2,
} from 'lucide-vue-next';
import { FLOW_EXPLORER_KEY } from '../composables/useFlowExplorer';
import { useToast } from '../composables/useToast';
import { copyTextToClipboard } from '../core/downloadHelper';
import { findNodeById } from '../core/graphEngine';
import {
  buildLogTraceAiDebugPrompt,
  traceLogAgainstDataset,
} from '../core/logTracerEngine';
import {
  extractCodeRefsByPlatform,
  type SourcePeekLaunchContext,
} from '../core/sourcePeekClient';
import { loadDevWorkspaceSettings } from '../core/workspaceSettings';

const emit = defineEmits<{
  closeHub: [];
  jumpToNode: [nodeId: string];
  openSourcePeek: [context: SourcePeekLaunchContext];
}>();

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const { pushToast } = useToast();
const rawLog = ref('');
const copiedPrompt = ref(false);

const SAMPLE_LOGS: Array<{ id: string; label: string; content: string }> = [
  {
    id: '401-refresh',
    label: 'Mẫu 401 Refresh Token (Android)',
    content: [
      '2026-11-26 10:12:01.102 D/OkHttp: <-- 401 Unauthorized https://api.vbot.vn/api/project-user-state-temp/get-all',
      '2026-11-26 10:12:01.145 W/TokenAuthenticator: Refreshing token after 401 on VbMABridge',
      '2026-11-26 10:12:01.410 E/TokenAuthenticator: Refresh token failed (401) -> sessionLogoutTriggered',
    ].join('\n'),
  },
  {
    id: 'autodial-bridge',
    label: 'Mẫu Autodial Bridge',
    content: [
      '[VbMaSDK] MiniApp -> Host: start_autodial {"campaign_id":"cmp_101"}',
      '[MiniAppService.swift] CallKit active call detected -> CALL_BUSY',
      '[AutodialBridgeHandler] return error 409 campaign busy',
    ].join('\n'),
  },
  {
    id: 'vbm-832-ws',
    label: 'Mẫu VbM-832 Agent State WS',
    content: [
      '[WebSocket] subscribed channel vbot.state project_code=PRJ_01',
      '[VbUserStateHolder] received event UPDATE_STATE status=busy temp_id=12',
      '[ServerTimeUtils] resume_at sync +7h offset -> schedule auto-resume',
    ].join('\n'),
  },
];

const report = computed(() => {
  if (!rawLog.value.trim()) return null;
  return traceLogAgainstDataset(rawLog.value, explorer.dataset);
});

const applyToCanvas = () => {
  if (!report.value || report.value.orderedNodeIds.length === 0) {
    pushToast('Chưa tìm thấy node nào khớp trong log để tô sáng.', 'info');
    return;
  }
  explorer.setAudienceMode('tech');
  explorer.setTraceOverlay(
    report.value.orderedNodeIds,
    report.value.suspectedErrorNodeIds,
    `Log Trace (${report.value.orderedNodeIds.length} bước)`,
  );
  emit('closeHub');
  pushToast(`Đã tô ${report.value.orderedNodeIds.length} bước Log Trace lên sơ đồ`, 'success');
};

const copyDebugPrompt = async () => {
  if (!report.value) return;
  const prompt = buildLogTraceAiDebugPrompt(
    report.value,
    explorer.dataset,
    loadDevWorkspaceSettings(),
  );
  const ok = await copyTextToClipboard(prompt);
  if (ok) {
    copiedPrompt.value = true;
    pushToast('Đã copy AI Debug Prompt từ Log Trace', 'success');
    setTimeout(() => {
      copiedPrompt.value = false;
    }, 1600);
  }
};

const openNodeSourcePeek = (nodeId: string) => {
  const node = findNodeById(explorer.dataset, nodeId);
  if (!node) return;
  const grouped = extractCodeRefsByPlatform(node);
  if (grouped.ios.length === 0 && grouped.android.length === 0) {
    pushToast('Node này chưa gắn codeRefs', 'info');
    return;
  }
  emit('openSourcePeek', {
    title: node.techLabel || node.label,
    nodeId,
    iosRef: grouped.ios[0],
    androidRef: grouped.android[0],
    iosRefs: grouped.ios,
    androidRefs: grouped.android,
  });
};

const REASON_LABELS: Record<string, string> = {
  code_ref: 'File / Class',
  api_event: 'API / WS / Event',
  bridge_method: 'Bridge SDK',
  error_code: 'Mã lỗi',
};
</script>

<template>
  <div class="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 text-xs">
    <div class="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/80">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 class="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-slate-100">
            <Bug class="h-4 w-4 text-rose-500" />
            Debug Log-to-Flow Tracer
          </h3>
          <p class="mt-0.5 text-slate-500 dark:text-slate-400">
            Dán log từ Xcode Console, Android Logcat, WebSocket/SIP hoặc Mini App Wire — hệ thống tự khớp <code class="font-mono">codeRefs</code>, API, Bridge và mã lỗi để tô chuỗi thực thi trên sơ đồ.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-1.5">
          <button
            v-for="sample in SAMPLE_LOGS"
            :key="sample.id"
            type="button"
            class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            @click="rawLog = sample.content"
          >
            {{ sample.label }}
          </button>
          <button
            v-if="rawLog"
            type="button"
            class="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-500 hover:text-rose-500 dark:border-slate-700"
            @click="rawLog = ''"
          >
            <Trash2 class="h-3 w-3" />
            Xóa
          </button>
        </div>
      </div>

      <textarea
        v-model="rawLog"
        rows="7"
        spellcheck="false"
        placeholder="Dán đoạn log lỗi / network / WebSocket / Bridge vào đây..."
        class="w-full rounded-xl border border-slate-300 bg-[#0b1120] p-3 font-mono text-[11.5px] leading-relaxed text-cyan-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none dark:border-slate-700"
      />
    </div>

    <div
      v-if="!report"
      class="rounded-xl border border-dashed border-slate-300 bg-white/80 p-8 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400"
    >
      Hãy dán log hoặc chọn một mẫu nhanh ở trên để phân tích chuỗi node thực thi.
    </div>

    <template v-else>
      <div class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/80">
        <div class="flex flex-wrap items-center gap-2">
          <span class="rounded-full bg-indigo-100 px-2.5 py-0.5 font-bold text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-200">
            Platform: {{ report.detectedPlatform }}
          </span>
          <span class="rounded-full bg-cyan-100 px-2.5 py-0.5 font-bold text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-200">
            {{ report.orderedNodeIds.length }} node khớp ({{ report.matchedLineCount }}/{{ report.totalLines }} dòng)
          </span>
          <span
            v-if="report.suspectedErrorNodeIds.length > 0"
            class="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 font-bold text-rose-800 dark:bg-rose-500/20 dark:text-rose-200"
          >
            <AlertTriangle class="h-3 w-3" />
            {{ report.suspectedErrorNodeIds.length }} node nghi lỗi
          </span>
          <span
            v-for="code in report.detectedErrorCodes"
            :key="code"
            class="rounded border border-rose-300 bg-rose-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-300"
          >
            ERR {{ code }}
          </span>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            :disabled="report.orderedNodeIds.length === 0"
            class="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-1.5 font-bold text-white hover:bg-cyan-500 disabled:opacity-45"
            @click="applyToCanvas"
          >
            <Eye class="h-3.5 w-3.5" />
            Tô sáng trên Sơ đồ
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 font-bold text-indigo-800 hover:bg-indigo-100 dark:border-indigo-500/35 dark:bg-indigo-500/15 dark:text-indigo-200"
            @click="copyDebugPrompt"
          >
            <Check v-if="copiedPrompt" class="h-3.5 w-3.5 text-emerald-500" />
            <Sparkles v-else class="h-3.5 w-3.5" />
            {{ copiedPrompt ? 'Đã copy Prompt' : 'Copy AI Debug Prompt' }}
          </button>
        </div>
      </div>

      <p
        v-if="report.hits.length === 0"
        class="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500 dark:border-slate-800 dark:bg-slate-900/70"
      >
        Chưa khớp được file, API hay bridge command nào trong dataset hiện tại. Thử kiểm tra lại tên class hoặc endpoint trong log.
      </p>

      <ol v-else class="space-y-2">
        <li
          v-for="hit in report.hits"
          :key="`${hit.stepOrder}-${hit.lineNumber}-${hit.nodeId}`"
          class="rounded-xl border p-3 transition"
          :class="
            hit.severity === 'error'
              ? 'border-rose-300 bg-rose-50/70 dark:border-rose-500/40 dark:bg-rose-500/10'
              : hit.severity === 'warn'
                ? 'border-amber-300 bg-amber-50/70 dark:border-amber-500/40 dark:bg-amber-500/10'
                : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/80'
          "
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-1.5">
              <span
                class="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-mono text-[10px] font-bold text-white"
                :class="hit.severity === 'error' ? 'bg-rose-600' : 'bg-cyan-600'"
              >
                #{{ hit.stepOrder }}
              </span>
              <span class="font-mono text-[10.5px] font-semibold text-slate-500 dark:text-slate-400">
                L{{ hit.lineNumber }}
              </span>
              <strong class="text-slate-900 dark:text-slate-100">{{ hit.nodeLabel }}</strong>
              <code class="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {{ hit.nodeId }}
              </code>
              <span class="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {{ REASON_LABELS[hit.matchReason] ?? hit.matchReason }}: {{ hit.matchedToken }}
              </span>
            </div>

            <div class="flex items-center gap-1.5">
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[10.5px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                @click="openNodeSourcePeek(hit.nodeId)"
              >
                <Code2 class="h-3 w-3 text-cyan-500" />
                Soi Code
              </button>
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10.5px] font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-cyan-500/35 dark:bg-cyan-500/15 dark:text-cyan-300"
                @click="emit('jumpToNode', hit.nodeId)"
              >
                Tới Node
                <ExternalLink class="h-3 w-3" />
              </button>
            </div>
          </div>
          <pre class="mt-2 overflow-x-auto rounded-lg bg-slate-950/90 px-2.5 py-1.5 font-mono text-[11px] text-slate-200">{{ hit.rawLine }}</pre>
        </li>
      </ol>
    </template>
  </div>
</template>
