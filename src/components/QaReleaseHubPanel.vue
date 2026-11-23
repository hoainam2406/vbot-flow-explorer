<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import {
  ClipboardCheck,
  Download,
  ExternalLink,
  Plus,
  Trash2,
  Upload,
} from 'lucide-vue-next';
import { FLOW_EXPLORER_KEY } from '../composables/useFlowExplorer';
import { useToast } from '../composables/useToast';
import { downloadTextFile, slugifyFilename } from '../core/downloadHelper';
import {
  createQaReleaseSession,
  ensureDefaultQaRelease,
  exportReleaseSignoffMarkdown,
  mergeQaReleaseSessions,
  parseQaReleaseJson,
  saveQaReleases,
  serializeQaRelease,
  setActiveReleaseId,
  summarizeReleaseProgress,
  type QaMergeStrategy,
  type QaReleaseSession,
} from '../core/qaReleaseHub';

const emit = defineEmits<{
  closeHub: [];
}>();

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const { pushToast } = useToast();
const initState = ensureDefaultQaRelease();
const releases = ref<QaReleaseSession[]>(initState.releases);
const activeReleaseId = ref<string>(initState.activeRelease.id);
const newReleaseName = ref('');
const mergeStrategy = ref<QaMergeStrategy>('latest_timestamp');
const importFileRef = ref<HTMLInputElement | null>(null);

const activeRelease = computed<QaReleaseSession>(
  () => releases.value.find((r) => r.id === activeReleaseId.value) ?? releases.value[0],
);

const summary = computed(() =>
  summarizeReleaseProgress(explorer.dataset, activeRelease.value),
);

const persistReleases = (nextList: QaReleaseSession[], nextActiveId?: string) => {
  releases.value = nextList;
  saveQaReleases(nextList);
  if (nextActiveId) {
    activeReleaseId.value = nextActiveId;
    setActiveReleaseId(nextActiveId);
  }
};

const selectRelease = (id: string) => {
  activeReleaseId.value = id;
  setActiveReleaseId(id);
};

const handleCreateRelease = () => {
  const name = newReleaseName.value.trim();
  if (!name) return;
  const created = createQaReleaseSession(name, activeRelease.value.testerName);
  persistReleases([created, ...releases.value], created.id);
  newReleaseName.value = '';
  pushToast(`Đã tạo đợt test "${created.name}"`, 'success');
};

const handleDeleteRelease = () => {
  if (releases.value.length <= 1) {
    pushToast('Cần giữ lại ít nhất 1 đợt test.', 'info');
    return;
  }
  const next = releases.value.filter((r) => r.id !== activeRelease.value.id);
  persistReleases(next, next[0].id);
  pushToast('Đã xóa đợt test', 'info');
};

const updateTesterName = (testerName: string) => {
  const next = releases.value.map((r) =>
    r.id === activeRelease.value.id
      ? { ...r, testerName, updatedAt: new Date().toISOString() }
      : r,
  );
  persistReleases(next);
};

const openScenarioChecklist = (scenarioId: string, parentId: string) => {
  emit('closeHub');
  explorer.setAudienceMode('tech');
  explorer.jumpToNode(parentId, { recordHistory: false });
  explorer.openScenarioDialog(scenarioId);
};

const exportJson = () => {
  const json = serializeQaRelease(activeRelease.value);
  downloadTextFile(
    `qa-release-${slugifyFilename(activeRelease.value.name)}.json`,
    json,
    'application/json;charset=utf-8',
  );
  pushToast('Đã tải file tiến độ QA (.json)', 'success');
};

const exportSignoffMd = () => {
  const md = exportReleaseSignoffMarkdown(explorer.dataset, activeRelease.value);
  downloadTextFile(`qa-signoff-${slugifyFilename(activeRelease.value.name)}.md`, md);
  pushToast('Đã tải báo cáo Release Sign-off (.md)', 'success');
};

const handleImportMerge = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const raw = await file.text();
    const parsed = parseQaReleaseJson(raw);
    if (!parsed.ok) {
      pushToast(parsed.error, 'error');
      return;
    }
    const merged = mergeQaReleaseSessions(
      activeRelease.value,
      parsed.release,
      mergeStrategy.value,
    );
    const next = releases.value.map((r) => (r.id === merged.id ? merged : r));
    persistReleases(next);
    pushToast(`Đã gộp kết quả từ "${parsed.release.testerName}"`, 'success');
  } catch {
    pushToast('Không thể đọc file tiến độ QA (.json)', 'error');
  }
};
</script>

<template>
  <div class="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
    <input
      ref="importFileRef"
      type="file"
      accept="application/json,.json"
      class="hidden"
      @change="handleImportMerge"
    />

    <!-- Release Switcher & Actions -->
    <div class="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-xs dark:border-slate-800 dark:bg-slate-900/80">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex flex-wrap items-center gap-2">
          <select
            :value="activeRelease.id"
            aria-label="Chọn đợt test Release"
            class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            @change="selectRelease(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="rel in releases" :key="rel.id" :value="rel.id">
              {{ rel.name }} ({{ rel.testerName }})
            </option>
          </select>

          <input
            :value="activeRelease.testerName"
            type="text"
            placeholder="Tên QA"
            title="Tên người phụ trách đợt test"
            class="w-36 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
            @input="updateTesterName(($event.target as HTMLInputElement).value)"
          />

          <button
            v-if="releases.length > 1"
            type="button"
            class="rounded-lg border border-rose-200 p-1.5 text-rose-600 hover:bg-rose-50 dark:border-rose-500/35 dark:text-rose-400"
            title="Xóa đợt test này"
            @click="handleDeleteRelease"
          >
            <Trash2 class="h-3.5 w-3.5" />
          </button>
        </div>

        <div class="flex flex-wrap items-center gap-1.5">
          <input
            v-model="newReleaseName"
            type="text"
            placeholder="Tên đợt mới (VD: v2.4.0 - RC1)"
            class="w-52 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
            @keydown.enter="handleCreateRelease"
          />
          <button
            type="button"
            :disabled="!newReleaseName.trim()"
            class="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 font-bold text-white hover:bg-indigo-500 disabled:opacity-50 dark:bg-cyan-500 dark:text-slate-950"
            @click="handleCreateRelease"
          >
            <Plus class="h-3.5 w-3.5" />
            Tạo đợt test
          </button>
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <div class="flex flex-wrap items-center gap-2">
          <select
            v-model="mergeStrategy"
            class="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-900"
            title="Chiến lược khi gộp file QA của tester khác"
          >
            <option value="latest_timestamp">Gộp: Ưu tiên cập nhật mới hơn</option>
            <option value="fill_untested">Gộp: Chỉ điền vào ô Chưa test</option>
            <option value="overwrite_incoming">Gộp: Ghi đè bằng file nhập vào</option>
          </select>
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            @click="importFileRef?.click()"
          >
            <Upload class="h-3.5 w-3.5" />
            Nhập &amp; Gộp JSON
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            @click="exportJson"
          >
            <Download class="h-3.5 w-3.5" />
            Xuất JSON
          </button>
        </div>

        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white hover:bg-emerald-500"
          @click="exportSignoffMd"
        >
          <ClipboardCheck class="h-3.5 w-3.5" />
          Xuất Báo cáo Sign-off (.md)
        </button>
      </div>
    </div>

    <!-- Overall iOS & Android Progress -->
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div class="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-xs dark:border-slate-800 dark:bg-slate-900/80">
        <div class="flex items-center justify-between font-bold">
          <span class="text-slate-900 dark:text-slate-100">Tiến độ iOS</span>
          <span class="font-mono text-indigo-700 dark:text-cyan-300">{{ summary.passRateIos }}% Pass</span>
        </div>
        <div class="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div class="h-full rounded-full bg-indigo-600 dark:bg-cyan-500" :style="{ width: `${summary.passRateIos}%` }" />
        </div>
        <div class="flex flex-wrap gap-2 text-[11px] text-slate-600 dark:text-slate-400">
          <span>Pass: <strong class="text-emerald-600">{{ summary.ios.pass }}</strong></span>
          <span>Fail: <strong class="text-rose-600">{{ summary.ios.fail }}</strong></span>
          <span>Blocked: <strong class="text-amber-600">{{ summary.ios.blocked }}</strong></span>
          <span>Chưa test: <strong>{{ summary.ios.untested }}</strong></span>
        </div>
      </div>

      <div class="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-xs dark:border-slate-800 dark:bg-slate-900/80">
        <div class="flex items-center justify-between font-bold">
          <span class="text-slate-900 dark:text-slate-100">Tiến độ Android</span>
          <span class="font-mono text-emerald-700 dark:text-emerald-300">{{ summary.passRateAndroid }}% Pass</span>
        </div>
        <div class="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div class="h-full rounded-full bg-emerald-500" :style="{ width: `${summary.passRateAndroid}%` }" />
        </div>
        <div class="flex flex-wrap gap-2 text-[11px] text-slate-600 dark:text-slate-400">
          <span>Pass: <strong class="text-emerald-600">{{ summary.android.pass }}</strong></span>
          <span>Fail: <strong class="text-rose-600">{{ summary.android.fail }}</strong></span>
          <span>Blocked: <strong class="text-amber-600">{{ summary.android.blocked }}</strong></span>
          <span>Chưa test: <strong>{{ summary.android.untested }}</strong></span>
        </div>
      </div>
    </div>

    <!-- Per-Scenario Table -->
    <div class="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/80">
      <div class="border-b border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 dark:border-slate-800 dark:text-slate-300">
        Toàn bộ Kịch bản trên App ({{ summary.totalScenarios }} kịch bản · {{ summary.totalCases }} cases)
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead class="bg-slate-50 text-[11px] text-slate-500 uppercase dark:bg-slate-950/60 dark:text-slate-400">
            <tr>
              <th class="px-4 py-2">Phân hệ</th>
              <th class="px-4 py-2">Kịch bản</th>
              <th class="px-3 py-2 text-center">Cases</th>
              <th class="px-3 py-2 text-center">iOS (Pass/Fail/Blk)</th>
              <th class="px-3 py-2 text-center">Android (Pass/Fail/Blk)</th>
              <th class="px-4 py-2 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr v-for="row in summary.scenarios" :key="row.scenarioId" class="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
              <td class="px-4 py-2.5 text-[11px] text-slate-500 dark:text-slate-400">{{ row.parentLabel }}</td>
              <td class="px-4 py-2.5 font-semibold text-slate-900 dark:text-slate-100">{{ row.scenarioName }}</td>
              <td class="px-3 py-2.5 text-center font-mono">{{ row.totalCases }}</td>
              <td class="px-3 py-2.5 text-center font-mono text-[11px]">
                <span class="text-emerald-600">{{ row.ios.pass }}</span> /
                <span class="text-rose-600">{{ row.ios.fail }}</span> /
                <span class="text-amber-600">{{ row.ios.blocked }}</span>
              </td>
              <td class="px-3 py-2.5 text-center font-mono text-[11px]">
                <span class="text-emerald-600">{{ row.android.pass }}</span> /
                <span class="text-rose-600">{{ row.android.fail }}</span> /
                <span class="text-amber-600">{{ row.android.blocked }}</span>
              </td>
              <td class="px-4 py-2.5 text-right">
                <button
                  type="button"
                  class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  @click="openScenarioChecklist(row.scenarioId, row.parentId)"
                >
                  Mở Checklist
                  <ExternalLink class="h-3 w-3" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
