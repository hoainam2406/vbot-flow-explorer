<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Image as ImageIcon,
  Upload,
} from 'lucide-vue-next';
import { FLOW_EXPLORER_KEY } from '../composables/useFlowExplorer';
import { useToast } from '../composables/useToast';
import { buildDataHealthReport, type DataHealthIssueKind } from '../core/dataHealthEngine';
import { processAndUploadMediaFile } from '../core/mediaUploadHelper';

const emit = defineEmits<{
  jumpToNode: [nodeId: string];
}>();

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const { pushToast } = useToast();
const issueFilter = ref<'all' | DataHealthIssueKind>('all');
const localUploadSupported = ref(false);
const uploadingSrc = ref<string | null>(null);
const uploadInputRef = ref<HTMLInputElement | null>(null);
const uploadTargetSrc = ref<string>('');

onMounted(async () => {
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
});

const report = computed(() => buildDataHealthReport(explorer.dataset));

const filteredIssues = computed(() => {
  if (issueFilter.value === 'all') return report.value.issues;
  return report.value.issues.filter((i) => i.kind === issueFilter.value);
});

const triggerUploadFor = (src: string) => {
  uploadTargetSrc.value = src;
  uploadInputRef.value?.click();
};

const onFilePicked = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  const targetSrc = uploadTargetSrc.value;
  if (!file || !targetSrc) return;

  uploadingSrc.value = targetSrc;
  const res = await processAndUploadMediaFile(file, targetSrc, localUploadSupported.value);
  uploadingSrc.value = null;

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
    pushToast(`Đã nén & lưu trực tiếp vào public${res.src}`, 'success');
  } else {
    pushToast(
      `Đã nén & tải ${res.filename} — hãy chép vào public${targetSrc}`,
      'info',
    );
  }
};
</script>

<template>
  <div class="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 text-xs">
    <input
      ref="uploadInputRef"
      type="file"
      accept="image/*,video/mp4,video/webm"
      class="hidden"
      @change="onFilePicked"
    />

    <!-- Top Health Summary Cards -->
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/80">
        <div class="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Điểm Sức khỏe Dữ liệu</div>
        <div class="mt-1 font-mono text-2xl font-extrabold text-indigo-600 dark:text-cyan-400">
          {{ report.overallScore }} / 100
        </div>
        <div class="mt-1 text-[11px] text-slate-500">Tổng {{ report.totalNodes }} node toàn app</div>
      </div>

      <div class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/80">
        <div class="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Đồng bộ Mini App Catalog</div>
        <div class="mt-1 flex items-center gap-1.5 font-mono text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 v-if="report.miniAppAudit.errors.length === 0 && report.miniAppAudit.warnings.length === 0" class="h-5 w-5" />
          {{ report.miniAppAudit.stats.catalogCount }} Apps
        </div>
        <div class="mt-1 text-[11px] text-slate-500">
          {{ report.miniAppAudit.errors.length }} lỗi · {{ report.miniAppAudit.warnings.length }} cảnh báo
        </div>
      </div>

      <div class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/80">
        <div class="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Độ phủ Media</div>
        <div class="mt-1 font-mono text-2xl font-extrabold text-slate-900 dark:text-slate-100">
          {{ report.mediaCoverage.present }} / {{ report.mediaCoverage.total }}
        </div>
        <div class="mt-1 text-[11px] text-slate-500">Còn thiếu {{ report.mediaCoverage.missing }} ảnh/video</div>
      </div>

      <div class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/80">
        <div class="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Cảnh báo Chất lượng Node</div>
        <div class="mt-1 font-mono text-2xl font-extrabold text-amber-600 dark:text-amber-400">
          {{ report.issues.length }}
        </div>
        <div class="mt-1 text-[11px] text-slate-500">
          Thiếu edgeCases / byPlatform / ngày kiểm
        </div>
      </div>
    </div>

    <!-- Branch Parity Progress -->
    <div class="space-y-2.5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/80">
      <h3 class="font-bold text-slate-900 dark:text-slate-100">
        Tiến độ Parity iOS ↔ Android theo Phân hệ
      </h3>
      <div class="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="b in report.branchParityHealth"
          :key="b.branchId"
          class="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/60"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="truncate font-bold text-slate-900 dark:text-slate-100">{{ b.branchLabel }}</span>
            <span class="font-mono text-[11px] font-bold text-emerald-600 dark:text-emerald-400">{{ b.syncPercent }}%</span>
          </div>
          <div class="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div class="h-full rounded-full bg-emerald-500" :style="{ width: `${b.syncPercent}%` }" />
          </div>
          <div class="flex flex-wrap gap-2 text-[10.5px] text-slate-500">
            <span>Gap: <strong class="text-rose-600">{{ b.actionNeeded }}</strong></span>
            <span>Khác logic: <strong class="text-amber-600">{{ b.logicDiff }}</strong></span>
            <span>Khớp: <strong>{{ b.synced + b.osImplOnly }}</strong></span>
          </div>
        </div>
      </div>
    </div>

    <!-- Media Upload Slots -->
    <div class="space-y-2.5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/80">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="flex items-center gap-1.5 font-bold text-slate-900 dark:text-slate-100">
          <ImageIcon class="h-4 w-4 text-indigo-600 dark:text-cyan-400" />
          Upload &amp; Tối ưu WebP cho Media ({{ report.mediaCoverage.present }}/{{ report.mediaCoverage.total }})
        </h3>
        <span class="text-[11px] text-slate-500 dark:text-slate-400">
          {{ localUploadSupported ? 'Đang chạy local: ảnh tự nén .webp & lưu thẳng vào public/media/' : 'Chế độ tĩnh: ảnh tự nén .webp & tải về để chép vào repo' }}
        </span>
      </div>

      <ul class="grid gap-2 sm:grid-cols-2">
        <li
          v-for="m in report.mediaCoverage.items"
          :key="`${m.nodeId}-${m.src}`"
          class="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/60"
        >
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5">
              <span
                class="rounded px-1.5 py-0.5 text-[9.5px] font-bold"
                :class="
                  m.exists
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                "
              >
                {{ m.exists ? 'Đã có' : 'Thiếu' }}
              </span>
              <code class="truncate font-mono text-[10.5px] font-semibold text-slate-800 dark:text-slate-200">
                {{ m.src }}
              </code>
            </div>
            <div class="mt-0.5 truncate text-[10.5px] text-slate-500">{{ m.nodeLabel }} · {{ m.caption }}</div>
          </div>

          <button
            type="button"
            :disabled="uploadingSrc === m.src"
            class="inline-flex shrink-0 items-center gap-1 rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50 dark:border-cyan-500/35 dark:bg-slate-800 dark:text-cyan-300"
            @click="triggerUploadFor(m.src)"
          >
            <Upload class="h-3 w-3" />
            {{ m.exists ? 'Thay ảnh' : 'Upload' }}
          </button>
        </li>
      </ul>
    </div>

    <!-- Quality Issues Filter & List -->
    <div class="space-y-2.5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/80">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="flex items-center gap-1.5 font-bold text-slate-900 dark:text-slate-100">
          <AlertTriangle class="h-4 w-4 text-amber-500" />
          Danh sách Node cần bổ sung dữ liệu ({{ filteredIssues.length }})
        </h3>
        <div class="flex flex-wrap gap-1">
          <button
            v-for="tab in [
              { id: 'all', label: `Tất cả (${report.issues.length})` },
              { id: 'missing_edge_cases', label: `Thiếu edgeCases (${report.countsByKind.missing_edge_cases})` },
              { id: 'missing_by_platform', label: `Thiếu byPlatform (${report.countsByKind.missing_by_platform})` },
              { id: 'missing_last_verified', label: `Chưa có ngày kiểm (${report.countsByKind.missing_last_verified})` },
              { id: 'stale_verified', label: `Quá hạn >60 ngày (${report.countsByKind.stale_verified})` },
            ] as const"
            :key="tab.id"
            type="button"
            class="rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition"
            :class="
              issueFilter === tab.id
                ? 'border-indigo-600 bg-indigo-600 text-white dark:border-cyan-500 dark:bg-cyan-500 dark:text-slate-950'
                : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
            "
            @click="issueFilter = tab.id"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>

      <ul class="max-h-72 space-y-1.5 overflow-y-auto">
        <li
          v-for="(issue, idx) in filteredIssues"
          :key="`${issue.kind}-${issue.nodeId}-${idx}`"
          class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/60"
        >
          <div class="min-w-0 flex-1">
            <div class="font-bold text-slate-900 dark:text-slate-100">
              {{ issue.nodeLabel }} <span class="font-mono text-[10px] text-slate-400">({{ issue.nodeId }})</span>
            </div>
            <div class="text-[11px] text-slate-600 dark:text-slate-400">{{ issue.detail }}</div>
          </div>
          <button
            type="button"
            class="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            @click="emit('jumpToNode', issue.nodeId)"
          >
            Xem node
            <ExternalLink class="h-3 w-3" />
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
