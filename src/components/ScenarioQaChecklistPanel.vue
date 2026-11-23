<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  Check,
  Copy,
  Download,
  FileSpreadsheet,
  RotateCcw,
} from 'lucide-vue-next';
import { useToast } from '../composables/useToast';
import { copyTextToClipboard, downloadTextFile, slugifyFilename } from '../core/downloadHelper';
import {
  buildQaTestCasesForScenario,
  clearQaRunState,
  createEmptyQaResult,
  exportQaRunToCsv,
  exportQaRunToMarkdown,
  loadQaRunState,
  QA_STATUS_META,
  saveQaRunState,
  summarizeQaRun,
  type QaCaseResult,
  type QaCaseStatus,
  type QaRunState,
  type QaTestCase,
} from '../core/qaChecklistEngine';
import type { ScenarioTimelineModel } from '../core/scenarioFlowEngine';
import { buildQaBugTaskMarkdown } from '../core/vbotWorkTemplates';
import type { PlatformViewMode } from '../data/schema';

const props = defineProps<{
  timeline: ScenarioTimelineModel;
  platformMode: PlatformViewMode;
}>();

const { pushToast } = useToast();
const runState = ref<QaRunState>({});
const statusFilter = ref<'all' | QaCaseStatus>('all');
const copiedId = ref<string | null>(null);

const cases = computed(() =>
  buildQaTestCasesForScenario(props.timeline, props.platformMode),
);

const summary = computed(() =>
  summarizeQaRun(cases.value, runState.value, props.platformMode),
);

watch(
  () => props.timeline.scenarioId,
  (id) => {
    runState.value = loadQaRunState(id);
  },
  { immediate: true },
);

const getCaseResult = (caseId: string): QaCaseResult =>
  runState.value[caseId] ?? createEmptyQaResult();

const setStatus = (caseId: string, platform: 'ios' | 'android', status: QaCaseStatus) => {
  const cur = getCaseResult(caseId);
  const next: QaCaseResult = {
    ...cur,
    [platform]: status,
    updatedAt: new Date().toISOString(),
  };
  runState.value = { ...runState.value, [caseId]: next };
  saveQaRunState(props.timeline.scenarioId, runState.value);
};

const setNote = (caseId: string, note: string) => {
  const cur = getCaseResult(caseId);
  const next: QaCaseResult = {
    ...cur,
    note,
    updatedAt: new Date().toISOString(),
  };
  runState.value = { ...runState.value, [caseId]: next };
  saveQaRunState(props.timeline.scenarioId, runState.value);
};

const filteredCases = computed(() => {
  if (statusFilter.value === 'all') return cases.value;
  return cases.value.filter((tc) => {
    const res = getCaseResult(tc.id);
    if (props.platformMode === 'ios') return res.ios === statusFilter.value;
    if (props.platformMode === 'android') return res.android === statusFilter.value;
    return res.ios === statusFilter.value || res.android === statusFilter.value;
  });
});

const resetAll = () => {
  clearQaRunState(props.timeline.scenarioId);
  runState.value = {};
  pushToast('Đã xóa tiến độ QA của kịch bản này', 'info');
};

const downloadMd = () => {
  const md = exportQaRunToMarkdown(
    props.timeline,
    cases.value,
    runState.value,
    props.platformMode,
  );
  downloadTextFile(`qa-${slugifyFilename(props.timeline.title)}.md`, md);
  pushToast('Đã tải biên bản QA (.md)', 'success');
};

const downloadCsv = () => {
  const csv = exportQaRunToCsv(props.timeline, cases.value, runState.value);
  downloadTextFile(`qa-${slugifyFilename(props.timeline.title)}.csv`, csv, 'text/csv;charset=utf-8');
  pushToast('Đã tải bảng QA (.csv)', 'success');
};

const copyBugTemplate = async (tc: QaTestCase) => {
  const res = getCaseResult(tc.id);
  const pageUrl = typeof window !== 'undefined' ? window.location.href : undefined;
  const md = buildQaBugTaskMarkdown(props.timeline.title, tc, res, pageUrl);
  const ok = await copyTextToClipboard(md);
  if (ok) {
    copiedId.value = tc.id;
    pushToast('Đã copy mẫu Bug VBot Work', 'success');
    setTimeout(() => {
      if (copiedId.value === tc.id) copiedId.value = null;
    }, 1500);
  }
};

const STATUS_BUTTONS: Array<{ id: QaCaseStatus; label: string; activeCls: string }> = [
  { id: 'pass', label: 'Pass', activeCls: 'bg-emerald-600 text-white border-emerald-600' },
  { id: 'fail', label: 'Fail', activeCls: 'bg-rose-600 text-white border-rose-600' },
  { id: 'blocked', label: 'Blk', activeCls: 'bg-amber-500 text-white border-amber-500' },
  { id: 'skip', label: 'Skip', activeCls: 'bg-slate-600 text-white border-slate-600' },
];
</script>

<template>
  <div class="flex h-full min-h-0 flex-col space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900/80">
      <div class="flex flex-wrap items-center gap-2 text-xs">
        <span class="rounded-full bg-slate-100 px-2.5 py-1 font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-200">
          Tổng: {{ summary.total }}
        </span>
        <span class="rounded-full bg-emerald-100 px-2.5 py-1 font-bold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
          Pass: {{ summary.pass }}
        </span>
        <span class="rounded-full bg-rose-100 px-2.5 py-1 font-bold text-rose-800 dark:bg-rose-500/20 dark:text-rose-300">
          Fail: {{ summary.fail }}
        </span>
        <span class="rounded-full bg-amber-100 px-2.5 py-1 font-bold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
          Blocked: {{ summary.blocked }}
        </span>
        <span class="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
          Chưa test: {{ summary.untested }}
        </span>
      </div>

      <div class="flex flex-wrap items-center gap-1.5">
        <select
          v-model="statusFilter"
          aria-label="Lọc trạng thái QA"
          class="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          <option value="all">Mọi trạng thái</option>
          <option value="untested">{{ QA_STATUS_META.untested.label }}</option>
          <option value="pass">{{ QA_STATUS_META.pass.label }}</option>
          <option value="fail">{{ QA_STATUS_META.fail.label }}</option>
          <option value="blocked">{{ QA_STATUS_META.blocked.label }}</option>
        </select>

        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          @click="downloadMd"
        >
          <Download class="h-3.5 w-3.5" />
          Xuất .md
        </button>

        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          @click="downloadCsv"
        >
          <FileSpreadsheet class="h-3.5 w-3.5" />
          Xuất .csv
        </button>

        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          @click="resetAll"
        >
          <RotateCcw class="h-3.5 w-3.5" />
          Reset
        </button>
      </div>
    </div>

    <div class="min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1">
      <div
        v-for="tc in filteredCases"
        :key="tc.id"
        class="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900/75"
      >
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div class="min-w-0 flex-1 space-y-1">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                Bước {{ tc.stepNumber }}
              </span>
              <span
                class="rounded px-1.5 py-0.5 text-[10px] font-bold"
                :class="
                  tc.category === 'parity'
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                    : tc.category === 'edge_case'
                      ? 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300'
                      : 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300'
                "
              >
                {{ tc.category === 'parity' ? 'Parity' : tc.category === 'edge_case' ? 'Edge Case' : 'Luồng chính' }}
              </span>
              <span class="text-xs font-bold text-slate-900 dark:text-slate-100">
                {{ tc.title }}
              </span>
            </div>
            <p v-if="tc.detail" class="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
              {{ tc.detail }}
            </p>
          </div>

          <button
            v-if="
              getCaseResult(tc.id).ios === 'fail' ||
              getCaseResult(tc.id).android === 'fail' ||
              getCaseResult(tc.id).ios === 'blocked' ||
              getCaseResult(tc.id).android === 'blocked'
            "
            type="button"
            class="inline-flex shrink-0 items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-500/35 dark:bg-rose-500/15 dark:text-rose-300"
            @click="copyBugTemplate(tc)"
          >
            <Check v-if="copiedId === tc.id" class="h-3 w-3" />
            <Copy v-else class="h-3 w-3" />
            Copy Bug VBot Work
          </button>
        </div>

        <div class="mt-2.5 flex flex-wrap items-center gap-3">
          <div
            v-if="props.platformMode !== 'android' && tc.platformScope !== 'android'"
            class="flex items-center gap-1"
          >
            <span class="mr-1 text-[10px] font-bold text-slate-500 uppercase dark:text-indigo-300">iOS:</span>
            <button
              v-for="btn in STATUS_BUTTONS"
              :key="`ios-${btn.id}`"
              type="button"
              class="rounded border px-2 py-0.5 text-[10px] font-bold transition"
              :class="
                getCaseResult(tc.id).ios === btn.id
                  ? btn.activeCls
                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
              "
              @click="
                setStatus(
                  tc.id,
                  'ios',
                  getCaseResult(tc.id).ios === btn.id ? 'untested' : btn.id,
                )
              "
            >
              {{ btn.label }}
            </button>
          </div>

          <div
            v-if="props.platformMode !== 'ios' && tc.platformScope !== 'ios'"
            class="flex items-center gap-1"
          >
            <span class="mr-1 text-[10px] font-bold text-emerald-700 uppercase dark:text-emerald-300">Android:</span>
            <button
              v-for="btn in STATUS_BUTTONS"
              :key="`and-${btn.id}`"
              type="button"
              class="rounded border px-2 py-0.5 text-[10px] font-bold transition"
              :class="
                getCaseResult(tc.id).android === btn.id
                  ? btn.activeCls
                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
              "
              @click="
                setStatus(
                  tc.id,
                  'android',
                  getCaseResult(tc.id).android === btn.id ? 'untested' : btn.id,
                )
              "
            >
              {{ btn.label }}
            </button>
          </div>

          <input
            :value="getCaseResult(tc.id).note"
            type="text"
            placeholder="Ghi chú lỗi / build test..."
            class="min-w-44 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200"
            @input="setNote(tc.id, ($event.target as HTMLInputElement).value)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
