<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import {
  AlertTriangle,
  Blocks,
  Check,
  Copy,
  ExternalLink,
  Focus,
  GitBranch,
  GitCompare,
  Loader2,
  Network,
  Search,
  Settings,
  Workflow,
  X,
} from 'lucide-vue-next';
import { FLOW_EXPLORER_KEY } from '../composables/useFlowExplorer';
import { useToast } from '../composables/useToast';
import { copyTextToClipboard } from '../core/downloadHelper';
import { extractUniqueCodeRefs } from '../core/auditSyncEngine';
import {
  buildImpactIndex,
  queryImpact,
  type ImpactAxis,
  type ImpactIndex,
} from '../core/impactAnalyzer';
import {
  analyzePrImpact,
  evaluateCodeDrift,
  exportPrRegressionMarkdown,
  parseChangedFileList,
  type CodeDriftReport,
  type CodeDriftStatus,
} from '../core/prImpactEngine';
import { loadDevWorkspaceSettings } from '../core/workspaceSettings';
import {
  BRIDGE_PARITY_ALERTS,
  CORE_BRIDGE_SPECS,
  MINI_APP_CATALOG,
} from '../data/miniAppBridgeCatalog';
import { MINI_APP_PERMISSION_PROFILES } from '../data/miniAppPermissionMatrix';
import type { MiniAppBridgeLaunchContext } from './MiniAppBridgeModal.vue';

export interface ImpactLaunchContext {
  query: string;
  axis?: ImpactAxis;
}

const props = defineProps<{
  open: boolean;
  initialContext?: ImpactLaunchContext | null;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  openMiniappBridge: [context: MiniAppBridgeLaunchContext];
  openSettings: [];
}>();

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const { pushToast } = useToast();
const activeTab = ref<'single' | 'pr' | 'drift'>('single');
const query = ref('');
const selectedAxis = ref<ImpactAxis>('all');
const searchInputRef = ref<HTMLInputElement | null>(null);
const impactIndex = shallowRef<ImpactIndex | null>(null);

// PR Impact state
const prFilesText = ref('');
const gitInspectAvailable = ref(false);
const gitBaseRef = ref('Nam-dev');
const loadingGitDiff = ref(false);
const copiedPrMd = ref(false);

// Code Drift state
const loadingDrift = ref(false);
const driftReport = shallowRef<CodeDriftReport | null>(null);
const driftFilter = ref<'all' | CodeDriftStatus>('all');
const driftError = ref<string | null>(null);

const AXES: Array<{ id: ImpactAxis; label: string }> = [
  { id: 'all', label: 'Tất cả trục' },
  { id: 'api_event', label: 'API / Socket' },
  { id: 'bridge_method', label: 'Bridge Method' },
  { id: 'rbac_permission', label: 'Quyền RBAC' },
  { id: 'code_ref', label: 'File Code' },
  { id: 'miniapp', label: 'Mini App ID' },
];

const ensureIndex = () => {
  impactIndex.value = buildImpactIndex(
    explorer.dataset,
    MINI_APP_CATALOG,
    CORE_BRIDGE_SPECS,
    MINI_APP_PERMISSION_PROFILES,
    BRIDGE_PARITY_ALERTS,
  );
};

const close = () => emit('update:open', false);

const onWindowKeyDown = (event: KeyboardEvent) => {
  if (props.open && event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    close();
  }
};

watch(
  () => [props.open, props.initialContext] as const,
  async ([isOpen, ctx]) => {
    if (isOpen) {
      ensureIndex();
      if (ctx?.query) {
        activeTab.value = 'single';
        query.value = ctx.query;
      }
      if (ctx?.axis) {
        selectedAxis.value = ctx.axis;
      }
      if (import.meta.env.DEV) {
        try {
          const resp = await fetch('/__vbot-dev/status');
          if (resp.ok) {
            const data = (await resp.json()) as { capabilities?: { gitInspect?: boolean } };
            gitInspectAvailable.value = Boolean(data.capabilities?.gitInspect);
          }
        } catch {
          gitInspectAvailable.value = false;
        }
      }
      window.addEventListener('keydown', onWindowKeyDown, true);
      await nextTick();
      searchInputRef.value?.focus();
    } else {
      window.removeEventListener('keydown', onWindowKeyDown, true);
    }
  },
);

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeyDown, true);
});

const result = computed(() => {
  if (!impactIndex.value) {
    return {
      query: query.value,
      axis: selectedAxis.value,
      nodes: [],
      scenarios: [],
      miniApps: [],
      parityAlerts: [],
    };
  }
  return queryImpact(impactIndex.value, query.value, selectedAxis.value);
});

const hotTokens = computed(() => {
  if (!impactIndex.value) return [];
  return impactIndex.value.tokenCounts.slice(0, 12);
});

const jumpToNode = (nodeId: string) => {
  explorer.setAudienceMode('tech');
  explorer.jumpToNode(nodeId);
  close();
};

const highlightAllOnCanvas = () => {
  const ids = result.value.nodes.map((n) => n.node.id);
  if (ids.length === 0) return;
  explorer.setAudienceMode('tech');
  explorer.setImpactHighlight(ids, query.value.trim() || 'Impact');
  pushToast(`Đã tô sáng ${ids.length} node bị ảnh hưởng trên sơ đồ`, 'info');
  close();
};

const openScenario = (scenarioId: string, parentId: string) => {
  explorer.setAudienceMode('tech');
  explorer.jumpToNode(parentId, { recordHistory: false });
  explorer.openScenarioDialog(scenarioId);
  close();
};

const openStudio = (appId: string) => {
  close();
  emit('openMiniappBridge', { tab: 'sandbox', miniAppId: appId });
};

const parsedPrFiles = computed(() => parseChangedFileList(prFilesText.value));
const prReport = computed(() => {
  if (!impactIndex.value) {
    return analyzePrImpact(
      buildImpactIndex(
        explorer.dataset,
        MINI_APP_CATALOG,
        CORE_BRIDGE_SPECS,
        MINI_APP_PERMISSION_PROFILES,
        BRIDGE_PARITY_ALERTS,
      ),
      parsedPrFiles.value,
      explorer.dataset,
    );
  }
  return analyzePrImpact(impactIndex.value, parsedPrFiles.value, explorer.dataset);
});

const highlightPrNodesOnCanvas = () => {
  const ids = prReport.value.affectedNodes.map((n) => n.node.id);
  if (ids.length === 0) return;
  explorer.setAudienceMode('tech');
  explorer.setImpactHighlight(ids, `PR (${parsedPrFiles.value.length} files)`);
  pushToast(`Đã tô sáng ${ids.length} node bị ảnh hưởng trên sơ đồ`, 'info');
  close();
};

const copyPrChecklist = async () => {
  const md = exportPrRegressionMarkdown(prReport.value);
  const ok = await copyTextToClipboard(md);
  if (ok) {
    copiedPrMd.value = true;
    pushToast('Đã sao chép PR Regression Checklist', 'success');
    setTimeout(() => {
      copiedPrMd.value = false;
    }, 1600);
  }
};

const pullChangedFilesFromGit = async () => {
  const settings = loadDevWorkspaceSettings();
  if (!settings.localIosRepoPath.trim() && !settings.localAndroidRepoPath.trim()) {
    pushToast('Hãy nhập đường dẫn local VBot-iOS hoặc VBot-Android trong Cài đặt Dev trước.', 'info');
    emit('openSettings');
    return;
  }
  loadingGitDiff.value = true;
  try {
    const resp = await fetch('/__vbot-dev/git/inspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'diff',
        iosRepoPath: settings.localIosRepoPath,
        androidRepoPath: settings.localAndroidRepoPath,
        baseRef: gitBaseRef.value.trim() || undefined,
      }),
    });
    const data = (await resp.json()) as { ok?: boolean; changedFiles?: string[]; error?: string };
    if (!resp.ok || !data.ok) {
      pushToast(data.error ?? 'Không thể đọc git diff local', 'error');
      return;
    }
    prFilesText.value = (data.changedFiles ?? []).join('\n');
    pushToast(`Đã lấy ${(data.changedFiles ?? []).length} file thay đổi từ git local`, 'success');
  } catch (err) {
    pushToast(err instanceof Error ? err.message : 'Lỗi kết nối git inspect local', 'error');
  } finally {
    loadingGitDiff.value = false;
  }
};

const devSettingsSnapshot = computed(() => loadDevWorkspaceSettings());

const runCodeDriftScan = async () => {
  const settings = loadDevWorkspaceSettings();
  if (!settings.localIosRepoPath.trim() && !settings.localAndroidRepoPath.trim()) {
    driftError.value = 'Chưa cấu hình đường dẫn local VBot-iOS hoặc VBot-Android trong Cài đặt Dev.';
    return;
  }
  loadingDrift.value = true;
  driftError.value = null;
  try {
    const extracted = extractUniqueCodeRefs(explorer.dataset);
    const refs = extracted.all.map((r) => r.ref);
    const resp = await fetch('/__vbot-dev/git/inspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'drift',
        iosRepoPath: settings.localIosRepoPath,
        androidRepoPath: settings.localAndroidRepoPath,
        codeRefs: refs,
      }),
    });
    const data = (await resp.json()) as {
      ok?: boolean;
      files?: Record<string, { exists: boolean; lastCommitDate?: string }>;
      error?: string;
    };
    if (!resp.ok || !data.ok || !data.files) {
      driftError.value = data.error ?? 'Không thể quét Code Drift từ git local.';
      return;
    }
    driftReport.value = evaluateCodeDrift(explorer.dataset, data.files);
    pushToast(`Đã kiểm tra ${driftReport.value.totalCheckedNodes} node có codeRefs`, 'success');
  } catch (err) {
    driftError.value = err instanceof Error ? err.message : 'Lỗi kết nối local dev server.';
  } finally {
    loadingDrift.value = false;
  }
};

const filteredDriftItems = computed(() => {
  if (!driftReport.value) return [];
  if (driftFilter.value === 'all') return driftReport.value.items;
  return driftReport.value.items.filter((i) => i.status === driftFilter.value);
});

const DRIFT_STATUS_META: Record<CodeDriftStatus, { label: string; cls: string }> = {
  missing_file: {
    label: 'Mất file',
    cls: 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300',
  },
  stale: {
    label: 'Code mới hơn tài liệu',
    cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
  },
  unverified_date: {
    label: 'Chưa có ngày kiểm',
    cls: 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300',
  },
  fresh: {
    label: 'Khớp',
    cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300',
  },
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
          aria-label="Phân tích ảnh hưởng"
          class="vbot-modal-panel flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700/80 dark:bg-[#0f172a]"
        >
          <div class="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div class="flex items-center gap-2.5">
              <span class="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300">
                <Network class="h-4 w-4" />
              </span>
              <div>
                <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">
                  Phân tích ảnh hưởng (Impact Analysis)
                </h2>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  Tra cứu ngược mọi Node, Kịch bản, Mini App &amp; Điểm lệch phụ thuộc vào 1 API, Bridge, Quyền hay File code.
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Đóng phân tích ảnh hưởng"
              class="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              @click="close"
            >
              <X class="h-4 w-4" />
            </button>
          </div>

          <div class="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 px-5 py-2 dark:border-slate-800 dark:bg-slate-900/80">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition"
              :class="
                activeTab === 'single'
                  ? 'bg-white text-indigo-700 shadow-2xs dark:bg-slate-800 dark:text-cyan-300'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              "
              @click="activeTab = 'single'"
            >
              <Search class="h-3.5 w-3.5" />
              Tra cứu đơn lẻ
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition"
              :class="
                activeTab === 'pr'
                  ? 'bg-white text-indigo-700 shadow-2xs dark:bg-slate-800 dark:text-cyan-300'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              "
              @click="activeTab = 'pr'"
            >
              <GitCompare class="h-3.5 w-3.5" />
              Kiểm tra PR / File sửa
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition"
              :class="
                activeTab === 'drift'
                  ? 'bg-white text-indigo-700 shadow-2xs dark:bg-slate-800 dark:text-cyan-300'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              "
              @click="activeTab = 'drift'"
            >
              <GitBranch class="h-3.5 w-3.5" />
              Code Drift (Git)
            </button>
          </div>

          <template v-if="activeTab === 'single'">

          <div class="space-y-2.5 border-b border-slate-200 bg-slate-50/70 px-5 py-3 dark:border-slate-800 dark:bg-slate-900/60">
            <div class="flex flex-wrap items-center gap-2">
              <div class="relative min-w-60 flex-1">
                <Search class="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  ref="searchInputRef"
                  v-model="query"
                  type="text"
                  placeholder="Nhập tên API, Socket event, Bridge method (VD: make_call), quyền RBAC (KHACH_HANG) hoặc tên file..."
                  class="w-full rounded-xl border border-slate-200 bg-white py-2 pr-3 pl-9 text-xs text-slate-900 placeholder:text-slate-400 focus:border-cyan-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <button
                v-if="result.nodes.length > 0"
                type="button"
                class="inline-flex items-center gap-1.5 rounded-xl bg-cyan-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-cyan-500 dark:bg-cyan-500 dark:text-slate-950"
                @click="highlightAllOnCanvas"
              >
                <Focus class="h-3.5 w-3.5" />
                Tô sáng {{ result.nodes.length }} node trên sơ đồ
              </button>
            </div>

            <div class="flex flex-wrap items-center gap-1.5">
              <button
                v-for="axis in AXES"
                :key="axis.id"
                type="button"
                class="rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition"
                :class="
                  selectedAxis === axis.id
                    ? 'border-indigo-600 bg-indigo-600 text-white dark:border-cyan-500 dark:bg-cyan-500 dark:text-slate-950'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                "
                @click="selectedAxis = axis.id"
              >
                {{ axis.label }}
              </button>
            </div>
          </div>

          <div class="flex-1 space-y-5 overflow-y-auto p-5">
            <div v-if="!query.trim()" class="space-y-2.5">
              <div class="text-xs font-bold text-slate-600 dark:text-slate-300">
                Điểm nóng phụ thuộc nhiều nhất (chọn nhanh để kiểm tra):
              </div>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="tok in hotTokens"
                  :key="`${tok.axis}-${tok.token}`"
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-mono text-slate-700 transition hover:border-cyan-400 hover:bg-cyan-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-cyan-500/50"
                  @click="
                    query = tok.token;
                    selectedAxis = tok.axis;
                  "
                >
                  <span>{{ tok.token }}</span>
                  <span class="rounded bg-slate-200 px-1 py-0.2 text-[10px] font-bold text-slate-700 dark:bg-slate-700 dark:text-cyan-300">
                    {{ tok.count }}
                  </span>
                </button>
              </div>
            </div>

            <template v-else>
              <div
                v-if="
                  result.nodes.length === 0 &&
                  result.scenarios.length === 0 &&
                  result.miniApps.length === 0 &&
                  result.parityAlerts.length === 0
                "
                class="py-12 text-center text-xs text-slate-500 dark:text-slate-400"
              >
                Không tìm thấy thành phần nào phụ thuộc vào "{{ query }}".
              </div>

              <section v-if="result.nodes.length > 0" class="space-y-2">
                <h3 class="text-xs font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                  Node bị ảnh hưởng ({{ result.nodes.length }})
                </h3>
                <ul class="space-y-2">
                  <li
                    v-for="hit in result.nodes"
                    :key="hit.node.id"
                    class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/75"
                  >
                    <div class="min-w-0 flex-1 space-y-1">
                      <div class="flex flex-wrap items-center gap-1.5">
                        <span class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {{ hit.branchLabel }}
                        </span>
                        <span class="text-xs font-bold text-slate-900 dark:text-slate-100">
                          {{ hit.nodeLabel }}
                        </span>
                      </div>
                      <div class="flex flex-wrap gap-1">
                        <code
                          v-for="tok in hit.tokens.slice(0, 5)"
                          :key="`${tok.axis}-${tok.token}`"
                          class="rounded border border-cyan-200 bg-cyan-50/70 px-1.5 py-0.5 font-mono text-[10px] text-cyan-900 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-300"
                        >
                          {{ tok.token }}
                        </code>
                      </div>
                    </div>
                    <button
                      type="button"
                      class="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:text-cyan-300"
                      @click="jumpToNode(hit.node.id)"
                    >
                      Mở node
                      <ExternalLink class="h-3 w-3" />
                    </button>
                  </li>
                </ul>
              </section>

              <section v-if="result.scenarios.length > 0" class="space-y-2">
                <h3 class="flex items-center gap-1.5 text-xs font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                  <Workflow class="h-3.5 w-3.5" />
                  Kịch bản cần test lại ({{ result.scenarios.length }})
                </h3>
                <div class="grid gap-2 sm:grid-cols-2">
                  <button
                    v-for="sc in result.scenarios"
                    :key="sc.scenario.id"
                    type="button"
                    class="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 text-left text-xs transition hover:border-indigo-300 hover:bg-indigo-50/30 dark:border-slate-800 dark:bg-slate-900/75 dark:hover:border-cyan-500/40"
                    @click="openScenario(sc.scenario.id, sc.parentId)"
                  >
                    <div class="min-w-0">
                      <div class="truncate font-bold text-slate-900 dark:text-slate-100">
                        {{ sc.scenario.name }}
                      </div>
                      <div class="text-[11px] text-slate-500 dark:text-slate-400">
                        Liên quan {{ sc.matchedNodeIds.length }} bước
                      </div>
                    </div>
                    <ExternalLink class="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  </button>
                </div>
              </section>

              <section v-if="result.miniApps.length > 0" class="space-y-2">
                <h3 class="flex items-center gap-1.5 text-xs font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                  <Blocks class="h-3.5 w-3.5" />
                  Mini App liên quan ({{ result.miniApps.length }})
                </h3>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="app in result.miniApps"
                    :key="app.id"
                    type="button"
                    class="inline-flex items-center gap-1.5 rounded-lg border border-cyan-200 bg-cyan-50/70 px-3 py-1.5 text-xs font-semibold text-cyan-900 transition hover:bg-cyan-100 dark:border-cyan-500/35 dark:bg-cyan-500/15 dark:text-cyan-200"
                    @click="openStudio(app.id)"
                  >
                    <span>{{ app.nameVi }}</span>
                    <code class="font-mono text-[10px] opacity-80">{{ app.id }}</code>
                  </button>
                </div>
              </section>

              <section v-if="result.parityAlerts.length > 0" class="space-y-2">
                <h3 class="flex items-center gap-1.5 text-xs font-bold tracking-wide text-amber-600 uppercase dark:text-amber-400">
                  <AlertTriangle class="h-3.5 w-3.5" />
                  Cảnh báo Parity iOS ↔ Android ({{ result.parityAlerts.length }})
                </h3>
                <ul class="space-y-2">
                  <li
                    v-for="al in result.parityAlerts"
                    :key="al.id"
                    class="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-950 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-200"
                  >
                    <div class="font-bold">{{ al.title }}</div>
                    <p class="mt-0.5 text-[11px]">{{ al.recommendationForMiniApp }}</p>
                  </li>
                </ul>
              </section>
            </template>
          </div>
          </template>

          <!-- TAB 2: PR / CHANGED FILES IMPACT -->
          <div v-else-if="activeTab === 'pr'" class="flex-1 space-y-4 overflow-y-auto p-5 text-xs">
            <div class="space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-slate-900/70">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="font-bold text-slate-800 dark:text-slate-200">
                  Dán danh sách file thay đổi (hỗ trợ <code class="font-mono">git diff --name-only</code>, <code class="font-mono">git status --short</code>)
                </span>
                <div v-if="gitInspectAvailable" class="flex flex-wrap items-center gap-1.5">
                  <input
                    v-model="gitBaseRef"
                    type="text"
                    placeholder="Nam-dev"
                    title="Nhánh gốc so sánh git diff"
                    class="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1 font-mono text-[11px] dark:border-slate-700 dark:bg-slate-900"
                  />
                  <button
                    type="button"
                    :disabled="loadingGitDiff"
                    class="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-indigo-500 disabled:opacity-60 dark:bg-cyan-500 dark:text-slate-950"
                    @click="pullChangedFilesFromGit"
                  >
                    <Loader2 v-if="loadingGitDiff" class="h-3 w-3 animate-spin" />
                    <GitCompare v-else class="h-3 w-3" />
                    Kéo từ Git local
                  </button>
                </div>
              </div>

              <textarea
                v-model="prFilesText"
                rows="4"
                placeholder="VD:&#10;VBot/Service/MiniAppService.swift&#10;VBot-Android/app/src/main/java/com/vpmedia/vbot/ui/call/NewCallActivity.kt"
                class="w-full rounded-xl border border-slate-200 bg-white p-2.5 font-mono text-[11px] text-slate-900 focus:border-cyan-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-cyan-100"
              />

              <div v-if="parsedPrFiles.length > 0" class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="rounded-full bg-indigo-100 px-2.5 py-0.5 font-bold text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-200">
                    Node ảnh hưởng: {{ prReport.affectedNodes.length }}
                  </span>
                  <span class="rounded-full bg-cyan-100 px-2.5 py-0.5 font-bold text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-200">
                    Kịch bản cần test: {{ prReport.affectedScenarios.length }}
                  </span>
                  <span class="rounded-full bg-amber-100 px-2.5 py-0.5 font-bold text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
                    File chưa map: {{ prReport.unmatchedFiles.length }}
                  </span>
                </div>

                <div class="flex flex-wrap items-center gap-1.5">
                  <button
                    v-if="prReport.affectedNodes.length > 0"
                    type="button"
                    class="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-cyan-500"
                    @click="highlightPrNodesOnCanvas"
                  >
                    <Focus class="h-3 w-3" />
                    Tô sáng trên sơ đồ
                  </button>
                  <button
                    type="button"
                    class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    @click="copyPrChecklist"
                  >
                    <Check v-if="copiedPrMd" class="h-3 w-3 text-emerald-500" />
                    <Copy v-else class="h-3 w-3" />
                    Copy PR Regression Checklist
                  </button>
                </div>
              </div>
            </div>

            <div v-if="prReport.affectedNodes.length > 0" class="space-y-2">
              <h3 class="text-xs font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                Node bị ảnh hưởng ({{ prReport.affectedNodes.length }})
              </h3>
              <ul class="space-y-1.5">
                <li
                  v-for="item in prReport.affectedNodes"
                  :key="item.node.id"
                  class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/75"
                >
                  <div class="min-w-0 flex-1 space-y-1">
                    <div class="flex flex-wrap items-center gap-1.5">
                      <span class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {{ item.branchLabel }}
                      </span>
                      <span class="font-bold text-slate-900 dark:text-slate-100">{{ item.nodeLabel }}</span>
                    </div>
                    <div class="flex flex-wrap gap-1">
                      <code
                        v-for="f in item.matchedFiles"
                        :key="f"
                        class="rounded bg-cyan-50 px-1.5 py-0.5 font-mono text-[10px] text-cyan-800 dark:bg-cyan-500/15 dark:text-cyan-300"
                      >
                        {{ f }}
                      </code>
                    </div>
                  </div>
                  <button
                    type="button"
                    class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    @click="jumpToNode(item.node.id)"
                  >
                    Mở node
                    <ExternalLink class="h-3 w-3" />
                  </button>
                </li>
              </ul>
            </div>

            <div v-if="prReport.affectedScenarios.length > 0" class="space-y-2">
              <h3 class="text-xs font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                Kịch bản &amp; QA Checklist cần test lại ({{ prReport.affectedScenarios.length }})
              </h3>
              <div class="grid gap-2 sm:grid-cols-2">
                <button
                  v-for="sc in prReport.affectedScenarios"
                  :key="sc.scenario.id"
                  type="button"
                  class="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-900/75"
                  @click="openScenario(sc.scenario.id, sc.parentId)"
                >
                  <div class="min-w-0">
                    <div class="truncate font-bold text-slate-900 dark:text-slate-100">{{ sc.scenario.name }}</div>
                    <div class="text-[11px] text-slate-500 dark:text-slate-400">
                      {{ sc.estimatedQaCaseCount }} QA test cases · {{ sc.matchedNodeIds.length }} bước liên quan
                    </div>
                  </div>
                  <ExternalLink class="h-3.5 w-3.5 shrink-0 text-slate-400" />
                </button>
              </div>
            </div>

            <div v-if="prReport.unmatchedFiles.length > 0" class="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-500/35 dark:bg-amber-500/10">
              <div class="font-bold text-amber-900 dark:text-amber-200">
                File chưa có trong <code class="font-mono">codeRefs</code> ({{ prReport.unmatchedFiles.length }})
              </div>
              <div class="flex flex-wrap gap-1.5 font-mono text-[10.5px] text-amber-800 dark:text-amber-300">
                <span v-for="f in prReport.unmatchedFiles" :key="f" class="rounded bg-white/80 px-1.5 py-0.5 dark:bg-slate-900">
                  {{ f }}
                </span>
              </div>
            </div>
          </div>

          <!-- TAB 3: CODE DRIFT (GIT LOCAL) -->
          <div v-else class="flex-1 space-y-4 overflow-y-auto p-5 text-xs">
            <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-slate-900/70">
              <div class="space-y-1">
                <div class="font-bold text-slate-900 dark:text-slate-100">
                  Đối chiếu độ mới của code thật với <code class="font-mono">meta.lastVerifiedAt</code>
                </div>
                <div class="font-mono text-[10.5px] text-slate-500 dark:text-slate-400">
                  iOS: {{ devSettingsSnapshot.localIosRepoPath || '(chưa cài)' }} · Android: {{ devSettingsSnapshot.localAndroidRepoPath || '(chưa cài)' }}
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  @click="emit('openSettings')"
                >
                  <Settings class="h-3.5 w-3.5" />
                  Cấu hình Repo
                </button>
                <button
                  v-if="gitInspectAvailable"
                  type="button"
                  :disabled="loadingDrift"
                  class="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-60 dark:bg-cyan-500 dark:text-slate-950"
                  @click="runCodeDriftScan"
                >
                  <Loader2 v-if="loadingDrift" class="h-3.5 w-3.5 animate-spin" />
                  <GitBranch v-else class="h-3.5 w-3.5" />
                  Quét Code Drift (iOS &amp; Android)
                </button>
              </div>
            </div>

            <div
              v-if="!gitInspectAvailable"
              class="rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-amber-950 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-200"
            >
              Quét <code class="font-mono">git log</code> trực tiếp cần chạy server local (<code class="font-mono">pnpm dev</code>). Trên bản web tĩnh, hãy dùng tab <strong>Kiểm tra PR / File sửa</strong> để dán danh sách file.
            </div>

            <div
              v-if="driftError"
              class="rounded-xl border border-rose-300 bg-rose-50 p-3 text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-200"
            >
              {{ driftError }}
            </div>

            <template v-if="driftReport">
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="tab in [
                    { id: 'all', label: `Tất cả (${driftReport.totalCheckedNodes})` },
                    { id: 'missing_file', label: `Mất file (${driftReport.missingFileCount})` },
                    { id: 'stale', label: `Code mới hơn tài liệu (${driftReport.staleCount})` },
                    { id: 'unverified_date', label: `Chưa có ngày kiểm (${driftReport.unverifiedDateCount})` },
                    { id: 'fresh', label: `Khớp (${driftReport.freshCount})` },
                  ] as const"
                  :key="tab.id"
                  type="button"
                  class="rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition"
                  :class="
                    driftFilter === tab.id
                      ? 'border-indigo-600 bg-indigo-600 text-white dark:border-cyan-500 dark:bg-cyan-500 dark:text-slate-950'
                      : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  "
                  @click="driftFilter = tab.id"
                >
                  {{ tab.label }}
                </button>
              </div>

              <ul class="space-y-2">
                <li
                  v-for="item in filteredDriftItems"
                  :key="item.nodeId"
                  class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/75"
                >
                  <div class="min-w-0 flex-1 space-y-1">
                    <div class="flex flex-wrap items-center gap-1.5">
                      <span class="rounded px-1.5 py-0.5 text-[10px] font-bold" :class="DRIFT_STATUS_META[item.status].cls">
                        {{ DRIFT_STATUS_META[item.status].label }}
                      </span>
                      <span class="font-bold text-slate-900 dark:text-slate-100">{{ item.nodeLabel }}</span>
                      <span class="font-mono text-[10px] text-slate-400">
                        verified: {{ item.lastVerifiedAt ?? 'chưa ghi' }} · commit: {{ item.newestCommitDate ?? 'n/a' }}
                      </span>
                    </div>
                    <div class="flex flex-wrap gap-1 font-mono text-[10px]">
                      <span
                        v-for="f in item.files"
                        :key="f.ref"
                        class="rounded px-1.5 py-0.5"
                        :class="
                          f.exists
                            ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            : 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
                        "
                      >
                        {{ f.ref }}{{ f.lastCommitDate ? ` (${f.lastCommitDate})` : '' }}{{ !f.exists ? ' [MISSING]' : '' }}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    @click="jumpToNode(item.nodeId)"
                  >
                    Mở node
                    <ExternalLink class="h-3 w-3" />
                  </button>
                </li>
              </ul>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
