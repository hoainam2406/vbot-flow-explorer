<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  FileJson,
  FlaskConical,
  HelpCircle,
  Link2,
  Play,
  PlayCircle,
  PlaySquare,
  RotateCcw,
  Send,
  Sparkles,
  Terminal,
  Trash2,
  Upload,
  X,
  Zap,
} from 'lucide-vue-next';
import { useToast } from '../composables/useToast';
import { copyTextToClipboard, downloadTextFile } from '../core/downloadHelper';
import {
  buildCommandSdkSnippet,
  buildMiniAppContract,
  buildStarterSdkCode,
  exportAppIntegrationMarkdown,
  FEATURED_STUDIO_APP_IDS,
  type ContractCommandSpec,
} from '../core/miniAppContractBuilder';
import {
  evaluateLiveIframeWireLogs,
  exportContractReportMarkdown,
  runSimulationContractSuite,
  type ContractTestSuiteReport,
  type LiveComplianceCheck,
} from '../core/miniAppContractTestRunner';
import {
  parseWireSessionJson,
  replayWireSessionOnEngine,
  restoreHostConfigFromSession,
  serializeWireSession,
  type WireReplaySummary,
  type WireSessionFile,
} from '../core/miniAppWireSession';
import {
  buildHostPushEvent,
  buildLaunchHashString,
  buildLaunchParamsObject,
  createDefaultHostConfig,
  createInitialHostState,
  executeHostCommand,
  resolveHotlinePicker,
  SANDBOX_FAULT_OPTIONS,
  type SandboxCommandResult,
  type SandboxFaultId,
  type SandboxHostConfig,
  type SandboxHostState,
  type SandboxPlatform,
  type SandboxWireLogEntry,
} from '../core/miniAppSandboxEngine';
import {
  loadStudioBannerDismissed,
  saveStudioBannerDismissed,
  type StudioQuickRecipe,
  type StudioTourStep,
} from '../core/miniAppStudioGuide';
import { MINI_APP_CATALOG } from '../data/miniAppBridgeCatalog';
import {
  createRoleStateFromPreset,
  ROLE_PRESETS,
  type RolePresetId,
} from '../data/miniAppPermissionMatrix';
import type { PlatformViewMode } from '../data/schema';
import JsonCodeBlock from './JsonCodeBlock.vue';
import MiniAppPhonePreview from './MiniAppPhonePreview.vue';

const props = defineProps<{
  initialAppId?: string;
  platformMode: PlatformViewMode;
}>();

const emit = defineEmits<{
  appChanged: [appId: string];
  openFlow: [flowId: string];
  startTour: [];
  openGuide: [];
  bannerDismissedChange: [dismissed: boolean];
}>();

const { pushToast } = useToast();

type StudioViewMode = 'sandbox' | 'contract' | 'testsuite';
type InspectorTab = 'response' | 'sdk' | 'native';

const studioView = ref<StudioViewMode>('sandbox');
const inspectorTab = ref<InspectorTab>('response');
const bannerDismissed = ref<boolean>(loadStudioBannerDismissed());
const suiteReport = ref<ContractTestSuiteReport | null>(null);
const suiteFilter = ref<'all' | 'fail' | 'warning' | 'pass'>('all');
const studioOpenedAt = ref<number>(Date.now());
const replaySession = ref<WireSessionFile | null>(null);
const replaySummary = ref<WireReplaySummary | null>(null);
const replayStepIndex = ref(0);
const importFileRef = ref<HTMLInputElement | null>(null);

function resolveValidAppId(candidate?: string): string {
  if (candidate && MINI_APP_CATALOG.some((a) => a.id === candidate)) {
    return candidate;
  }
  return FEATURED_STUDIO_APP_IDS[0] ?? 'vb-ma-autodial';
}

const selectedAppId = ref<string>(resolveValidAppId(props.initialAppId));
const hostConfig = ref<SandboxHostConfig>({
  ...createDefaultHostConfig(selectedAppId.value),
  platform: props.platformMode === 'android' ? 'android' : 'ios',
});
const hostState = ref<SandboxHostState>(createInitialHostState(hostConfig.value));

const wireLogs = ref<SandboxWireLogEntry[]>([]);
const selectedLogId = ref<string | null>(null);
const lastResult = ref<SandboxCommandResult | null>(null);
const selectedMethod = ref<string>('ready');
const requestJsonText = ref<string>('{}');

const phonePreviewRef = ref<InstanceType<typeof MiniAppPhonePreview> | null>(null);
const copiedKey = ref<string | null>(null);
let copyResetTimer: ReturnType<typeof setTimeout> | null = null;

onBeforeUnmount(() => {
  if (copyResetTimer) clearTimeout(copyResetTimer);
});

const copyValue = async (key: string, text: string, label: string) => {
  const ok = await copyTextToClipboard(text);
  if (!ok) {
    pushToast('Không thể sao chép vào clipboard', 'error');
    return;
  }
  copiedKey.value = key;
  if (copyResetTimer) clearTimeout(copyResetTimer);
  copyResetTimer = setTimeout(() => {
    copiedKey.value = null;
  }, 1800);
  pushToast(`Đã copy ${label}`, 'success');
};

const contract = computed(() => buildMiniAppContract(selectedAppId.value));
const starterCode = computed(() => buildStarterSdkCode(contract.value));
const launchParamsObj = computed(() => buildLaunchParamsObject(hostConfig.value));
const launchHash = computed(() => buildLaunchHashString(hostConfig.value));

const featuredApps = computed(() =>
  MINI_APP_CATALOG.filter((app) => FEATURED_STUDIO_APP_IDS.includes(app.id)),
);
const remainingApps = computed(() =>
  MINI_APP_CATALOG.filter((app) => !FEATURED_STUDIO_APP_IDS.includes(app.id)),
);

const appSpecificCommands = computed(() => contract.value.outgoingCommands);
const extraCommands = computed(() => {
  const existing = new Set(appSpecificCommands.value.map((c) => c.method));
  return contract.value.allAvailableCommands.filter((c) => !existing.has(c.method));
});

const activeCommandSpec = computed<ContractCommandSpec>(() => {
  return (
    contract.value.allAvailableCommands.find((c) => c.method === selectedMethod.value) ??
    contract.value.outgoingCommands[0]
  );
});

const selectCommand = (method: string, useInvalid = false) => {
  selectedMethod.value = method;
  const spec =
    contract.value.allAvailableCommands.find((c) => c.method === method) ??
    activeCommandSpec.value;
  const exampleObj = useInvalid ? spec.invalidExample : spec.validExample;
  requestJsonText.value = JSON.stringify(exampleObj, null, 2);
};

watch(
  () => props.initialAppId,
  (nextId) => {
    if (!nextId) return;
    const valid = resolveValidAppId(nextId);
    if (valid !== selectedAppId.value) {
      selectedAppId.value = valid;
    }
  },
);

watch(
  selectedAppId,
  (nextAppId) => {
    hostConfig.value = {
      ...hostConfig.value,
      appId: nextAppId,
    };
    hostState.value = createInitialHostState(hostConfig.value);
    wireLogs.value = [];
    lastResult.value = null;
    selectedLogId.value = null;
    suiteReport.value = null;
    replaySession.value = null;
    replaySummary.value = null;
    studioOpenedAt.value = Date.now();
    const nextContract = buildMiniAppContract(nextAppId);
    const preferred =
      nextContract.outgoingCommands.find((c) => c.isHostAction)?.method ??
      nextContract.outgoingCommands[0]?.method ??
      'ready';
    selectCommand(preferred);
    emit('appChanged', nextAppId);
  },
  { immediate: true },
);

const parsedRequest = computed<{ valid: boolean; value: Record<string, unknown>; error?: string }>(() => {
  try {
    const parsed: unknown = JSON.parse(requestJsonText.value || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { valid: false, value: {}, error: 'Payload phải là JSON Object { ... }' };
    }
    return { valid: true, value: parsed as Record<string, unknown> };
  } catch (err) {
    return {
      valid: false,
      value: {},
      error: err instanceof Error ? err.message : 'Lỗi cú pháp JSON',
    };
  }
});

const applyHostResult = (res: SandboxCommandResult) => {
  hostState.value = res.nextState;
  lastResult.value = res;
  wireLogs.value = [...wireLogs.value, ...res.wireFrames];
  const lastFrame = res.wireFrames[res.wireFrames.length - 1];
  if (lastFrame) {
    selectedLogId.value = lastFrame.id;
  }
  phonePreviewRef.value?.postEventToIframe(res.responseEvent, res.responsePayload);
  for (const pushed of res.emittedPushEvents) {
    phonePreviewRef.value?.postEventToIframe(pushed.eventName, pushed.payload);
  }
};

const runSelectedCommand = () => {
  if (!parsedRequest.value.valid) {
    pushToast('Payload JSON chưa hợp lệ', 'error');
    return;
  }
  const res = executeHostCommand(
    selectedMethod.value,
    parsedRequest.value.value,
    hostConfig.value,
    hostState.value,
  );
  applyHostResult(res);
};

const runDirectCommand = (method: string, payload: Record<string, unknown>) => {
  selectCommand(method);
  requestJsonText.value = JSON.stringify(payload, null, 2);
  const res = executeHostCommand(method, payload, hostConfig.value, hostState.value);
  applyHostResult(res);
};

const handleResolveHotline = (hotline: string | null) => {
  const res = resolveHotlinePicker(hostConfig.value, hostState.value, hotline);
  applyHostResult(res);
};

const handleResolveClosingModal = (confirmClose: boolean) => {
  if (!confirmClose) {
    hostState.value = { ...hostState.value, closingModalOpen: false };
    return;
  }
  const res = executeHostCommand('close', { force: true }, hostConfig.value, hostState.value);
  applyHostResult(res);
};

const handleHangupCall = () => {
  hostState.value = {
    ...hostState.value,
    activeCall: null,
  };
  wireLogs.value = [
    ...wireLogs.value,
    {
      id: `sys-${Date.now()}`,
      timestamp: new Date().toTimeString().slice(0, 8),
      direction: 'system',
      channel: 'InCall UI',
      methodOrEvent: 'call_ended',
      status: 'ok',
      payload: { reason: 'user_hangup_in_simulator' },
    },
  ];
};

const firePushEvent = (eventName: string, samplePayload: Record<string, unknown>) => {
  const res = buildHostPushEvent(eventName, samplePayload, hostConfig.value, hostState.value);
  hostState.value = res.nextState;
  hostConfig.value = { ...hostConfig.value, theme: res.nextState.theme };
  wireLogs.value = [...wireLogs.value, ...res.wireFrames];
  if (res.wireFrames[0]) {
    selectedLogId.value = res.wireFrames[0].id;
  }
  phonePreviewRef.value?.postEventToIframe(res.eventName, res.payload);
  pushToast(`Host đã đẩy event "${eventName}"`, res.parityAlertNote ? 'info' : 'success');
};

const setPlatform = (platform: SandboxPlatform) => {
  hostConfig.value = { ...hostConfig.value, platform };
};

const handleRoleChange = (presetId: RolePresetId) => {
  hostConfig.value = {
    ...hostConfig.value,
    rolePreset: presetId,
    roleState: createRoleStateFromPreset(presetId),
  };
};

const toggleTheme = () => {
  const nextTheme = hostConfig.value.theme === 'dark' ? 'light' : 'dark';
  hostConfig.value = { ...hostConfig.value, theme: nextTheme };
  hostState.value = { ...hostState.value, theme: nextTheme };
};

const resetHostSandbox = () => {
  hostState.value = createInitialHostState(hostConfig.value);
  wireLogs.value = [];
  lastResult.value = null;
  selectedLogId.value = null;
  pushToast('Đã reset trạng thái Virtual Host', 'info');
};

const copyShareLink = () => {
  const url = `${window.location.origin}${window.location.pathname}#/?mode=tech&bridge=sandbox&app=${selectedAppId.value}`;
  void copyValue('share-link', url, 'link Dev Studio cho app này');
};

const downloadAppMarkdown = () => {
  const md = exportAppIntegrationMarkdown(contract.value);
  downloadTextFile(`${selectedAppId.value}-integration-spec.md`, md);
  pushToast(`Đã tải ${selectedAppId.value}-integration-spec.md`, 'success');
};

const runContractTestSuite = () => {
  suiteReport.value = runSimulationContractSuite(contract.value);
  const r = suiteReport.value;
  pushToast(
    `Hoàn tất ${r.total} test: ${r.passed} Pass · ${r.warnings} Cảnh báo · ${r.failed} Fail`,
    r.failed > 0 ? 'error' : 'success',
  );
};

const openTestSuiteView = () => {
  studioView.value = 'testsuite';
  if (!suiteReport.value) {
    suiteReport.value = runSimulationContractSuite(contract.value);
  }
};

const liveComplianceChecks = computed<LiveComplianceCheck[]>(() =>
  evaluateLiveIframeWireLogs(contract.value, wireLogs.value, {
    elapsedMs: Date.now() - studioOpenedAt.value,
  }),
);

const filteredSuiteResults = computed(() => {
  if (!suiteReport.value) return [];
  if (suiteFilter.value === 'all') return suiteReport.value.results;
  return suiteReport.value.results.filter((r) => r.status === suiteFilter.value);
});

const downloadSuiteMarkdown = () => {
  const report = suiteReport.value ?? runSimulationContractSuite(contract.value);
  suiteReport.value = report;
  const md = exportContractReportMarkdown(report, liveComplianceChecks.value);
  downloadTextFile(`${selectedAppId.value}-bridge-test-report.md`, md);
  pushToast('Đã tải biên bản kiểm thử Bridge (.md)', 'success');
};

const downloadSuiteJson = () => {
  const report = suiteReport.value ?? runSimulationContractSuite(contract.value);
  suiteReport.value = report;
  downloadTextFile(
    `${selectedAppId.value}-bridge-test-report.json`,
    JSON.stringify(report, null, 2) + '\n',
    'application/json;charset=utf-8',
  );
  pushToast('Đã tải kết quả kiểm thử (.json)', 'success');
};

const triggerQuickLiveFault = async (fault: SandboxFaultId) => {
  studioView.value = 'sandbox';
  hostConfig.value = { ...hostConfig.value, fault };
  await nextTick();
  phonePreviewRef.value?.switchPreviewMode('iframe', false);
  pushToast(`Đã bật giả lập "${fault}" cho Iframe Live`, 'info');
};

const exportWireSessionJson = () => {
  const json = serializeWireSession(
    hostConfig.value,
    wireLogs.value,
    suiteReport.value
      ? {
          passed: suiteReport.value.passed,
          warnings: suiteReport.value.warnings,
          failed: suiteReport.value.failed,
          total: suiteReport.value.total,
        }
      : undefined,
  );
  downloadTextFile(
    `${selectedAppId.value}-wire-session.json`,
    json,
    'application/json;charset=utf-8',
  );
  pushToast('Đã xuất phiên Wire Log (.json, đã che token)', 'success');
};

const copyWireSessionJson = async () => {
  const json = serializeWireSession(hostConfig.value, wireLogs.value);
  await copyValue('wire-session', json, 'Wire Session JSON (đã che token)');
};

const triggerImportWireSession = () => {
  importFileRef.value?.click();
};

const handleImportWireSession = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const raw = await file.text();
    const parsed = parseWireSessionJson(raw);
    if (!parsed.ok) {
      pushToast(parsed.error, 'error');
      return;
    }
    const session = parsed.session;
    const validApp = resolveValidAppId(session.appId);
    if (selectedAppId.value !== validApp) {
      selectedAppId.value = validApp;
      await nextTick();
    }
    hostConfig.value = restoreHostConfigFromSession(session);
    hostState.value = createInitialHostState(hostConfig.value);
    wireLogs.value = session.wireLogs;
    replaySession.value = session;
    replaySummary.value = null;
    replayStepIndex.value = 0;
    selectedLogId.value = session.wireLogs[0]?.id ?? null;
    studioView.value = 'sandbox';
    pushToast(`Đã nạp phiên Replay (${session.wireLogs.length} frames)`, 'success');
  } catch {
    pushToast('Không thể đọc file phiên JSON', 'error');
  }
};

const runReplayEngineComparison = () => {
  if (!replaySession.value) return;
  replaySummary.value = replayWireSessionOnEngine(replaySession.value);
  const r = replaySummary.value;
  pushToast(
    `Replay ${r.totalCommands} lệnh: khớp ${r.matchedCount}, khác ${r.changedCount}`,
    r.changedCount > 0 ? 'info' : 'success',
  );
};

const stepReplayFrame = (delta: number) => {
  if (wireLogs.value.length === 0) return;
  const next = Math.max(0, Math.min(wireLogs.value.length - 1, replayStepIndex.value + delta));
  replayStepIndex.value = next;
  selectedLogId.value = wireLogs.value[next]?.id ?? null;
};

const exitReplayMode = () => {
  replaySession.value = null;
  replaySummary.value = null;
};

const jumpToSandboxWithCommand = (method: string) => {
  selectCommand(method);
  studioView.value = 'sandbox';
};

const jumpToSandboxWithPush = (eventName: string, samplePayload: Record<string, unknown>) => {
  studioView.value = 'sandbox';
  firePushEvent(eventName, samplePayload);
};

const setBannerDismissed = (dismissed: boolean) => {
  bannerDismissed.value = dismissed;
  saveStudioBannerDismissed(dismissed);
  emit('bannerDismissedChange', dismissed);
};

const prepareForTourStep = async (step: StudioTourStep) => {
  studioView.value = step.requiredView;
  if (step.preferredPhoneMode) {
    await nextTick();
    phonePreviewRef.value?.switchPreviewMode(
      step.preferredPhoneMode,
      step.preferredPhoneMode === 'iframe',
    );
  }
};

const runQuickRecipe = async (recipe: StudioQuickRecipe) => {
  studioView.value = 'sandbox';
  const targetAppId = resolveValidAppId(recipe.appId);
  const appChanged = selectedAppId.value !== targetAppId;
  selectedAppId.value = targetAppId;
  if (appChanged) {
    // Đợi watch(selectedAppId) reset state xong trước khi áp dụng cấu hình của kịch bản
    await nextTick();
  }
  hostConfig.value = {
    ...hostConfig.value,
    appId: targetAppId,
    platform: recipe.platform,
    rolePreset: recipe.rolePreset,
    roleState: createRoleStateFromPreset(recipe.rolePreset),
    fault: recipe.fault,
  };
  hostState.value = createInitialHostState(hostConfig.value);
  wireLogs.value = [];
  lastResult.value = null;
  selectedLogId.value = null;

  await nextTick();
  phonePreviewRef.value?.switchPreviewMode(
    recipe.phoneMode,
    recipe.phoneMode === 'iframe',
  );

  if (recipe.command) {
    runDirectCommand(recipe.command.method, recipe.command.payload);
    inspectorTab.value = 'response';
  }
  pushToast(`Đang chạy thử: ${recipe.title}`, 'info');
};

defineExpose({
  prepareForTourStep,
  runQuickRecipe,
  setBannerDismissed,
});

const selectedWireFrame = computed(() =>
  wireLogs.value.find((w) => w.id === selectedLogId.value) ?? wireLogs.value[wireLogs.value.length - 1] ?? null,
);

const inspectedJsonString = computed(() => {
  if (selectedWireFrame.value) {
    return JSON.stringify(selectedWireFrame.value.payload, null, 2);
  }
  return JSON.stringify(activeCommandSpec.value.responseOk, null, 2);
});

const inspectedSdkSnippet = computed(() =>
  buildCommandSdkSnippet(
    activeCommandSpec.value.method,
    parsedRequest.value.valid ? parsedRequest.value.value : activeCommandSpec.value.validExample,
    activeCommandSpec.value.isHostAction,
  ),
);

const WIRE_BADGE: Record<SandboxWireLogEntry['direction'], { label: string; cls: string }> = {
  miniapp_to_host: {
    label: 'TX JS → Host',
    cls: 'border-cyan-300 bg-cyan-50 text-cyan-800 dark:border-cyan-500/35 dark:bg-cyan-500/15 dark:text-cyan-300',
  },
  native_process: {
    label: 'NATIVE',
    cls: 'border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-500/35 dark:bg-indigo-500/15 dark:text-indigo-300',
  },
  host_to_miniapp: {
    label: 'RX Host → JS',
    cls: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
  system: {
    label: 'SYSTEM',
    cls: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300',
  },
};
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50/50 dark:bg-[#090d16]">
    <!-- Top Studio Header Bar -->
    <div
      data-studio-tour="studio-header"
      class="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-200 bg-white px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900"
    >
      <div class="flex min-w-0 flex-wrap items-center gap-2">
        <label class="text-[11px] font-bold text-slate-600 dark:text-slate-300" for="studio-app-select">
          Mini App:
        </label>
        <select
          id="studio-app-select"
          v-model="selectedAppId"
          class="max-w-[300px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-cyan-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          <optgroup label="🔥 Mini App tiêu biểu (Custom Bridge & Push)">
            <option v-for="app in featuredApps" :key="app.id" :value="app.id">
              {{ app.nameVi }} [{{ app.id }}]
            </option>
          </optgroup>
          <optgroup label="📦 Toàn bộ Mini App còn lại">
            <option v-for="app in remainingApps" :key="app.id" :value="app.id">
              {{ app.nameVi }} [{{ app.id }}]
            </option>
          </optgroup>
        </select>

        <!-- Mode Tabs -->
        <div class="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800">
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition"
            :class="
              studioView === 'sandbox'
                ? 'bg-white text-cyan-700 shadow-2xs dark:bg-cyan-500/20 dark:text-cyan-300'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
            "
            @click="studioView = 'sandbox'"
          >
            <Terminal class="h-3.5 w-3.5" />
            Mô phỏng Tương tác (Sandbox)
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition"
            :class="
              studioView === 'contract'
                ? 'bg-white text-indigo-700 shadow-2xs dark:bg-indigo-500/20 dark:text-indigo-300'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
            "
            @click="studioView = 'contract'"
          >
            <FileJson class="h-3.5 w-3.5" />
            Hợp đồng 2 Chiều &amp; Starter Code
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition"
            :class="
              studioView === 'testsuite'
                ? 'bg-white text-emerald-700 shadow-2xs dark:bg-emerald-500/20 dark:text-emerald-300'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
            "
            @click="openTestSuiteView"
          >
            <FlaskConical class="h-3.5 w-3.5" />
            Kiểm thử chuẩn
          </button>
        </div>
      </div>

      <!-- Quick Share & Export Bar -->
      <div class="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[11px] font-semibold text-cyan-800 transition hover:bg-cyan-100 dark:border-cyan-500/35 dark:bg-cyan-500/15 dark:text-cyan-300 dark:hover:bg-cyan-500/25"
          @click="copyShareLink"
        >
          <Check v-if="copiedKey === 'share-link'" class="h-3 w-3 text-emerald-500" />
          <Link2 v-else class="h-3 w-3" />
          Copy link gửi Dev
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          @click="copyValue('starter-ts', starterCode, 'Starter Code .ts')"
        >
          <Check v-if="copiedKey === 'starter-ts'" class="h-3 w-3 text-emerald-500" />
          <Code2 v-else class="h-3 w-3" />
          Copy Starter (.ts)
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-slate-800 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400"
          @click="downloadAppMarkdown"
        >
          <Download class="h-3 w-3" />
          Tải Spec (.md)
        </button>
      </div>
    </div>

    <!-- First-visit Dismissible Quick Start Banner (always restorable via ? Hướng dẫn) -->
    <div
      v-if="!bannerDismissed"
      class="flex flex-wrap items-center justify-between gap-2 border-b border-cyan-200/80 bg-cyan-50/75 px-4 py-2 text-xs text-cyan-950 dark:border-cyan-500/25 dark:bg-cyan-500/10 dark:text-cyan-100"
    >
      <div class="flex min-w-0 items-center gap-2">
        <Sparkles class="h-3.5 w-3.5 shrink-0 text-cyan-600 dark:text-cyan-400" />
        <span class="truncate sm:whitespace-normal">
          <strong>Mới dùng Dev Studio?</strong> Chọn Mini App → xem <em>Hợp đồng 2 Chiều</em> → thử lệnh &amp; <em>Giả lập lỗi</em> → hoặc nối <em>Iframe Localhost</em>.
        </span>
      </div>
      <div class="flex items-center gap-1.5">
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-md bg-cyan-600 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-cyan-500"
          @click="emit('startTour')"
        >
          <Play class="h-3 w-3" />
          Bắt đầu Tour 60s
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-md border border-cyan-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-cyan-800 transition hover:bg-cyan-100 dark:border-cyan-500/40 dark:bg-slate-900 dark:text-cyan-300 dark:hover:bg-slate-800"
          @click="emit('openGuide')"
        >
          5 Bài test mẫu
        </button>
        <button
          type="button"
          aria-label="Ẩn gợi ý đầu trang"
          title="Ẩn thanh gợi ý (luôn mở lại được ở nút ? Hướng dẫn)"
          class="rounded p-1 text-cyan-700/70 hover:bg-cyan-200/60 hover:text-cyan-900 dark:text-cyan-300/70 dark:hover:bg-slate-800 dark:hover:text-cyan-200"
          @click="setBannerDismissed(true)"
        >
          <X class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>

    <!-- VIEW 1: INTERACTIVE SANDBOX -->
    <template v-if="studioView === 'sandbox'">
      <!-- Host Environment Config Bar -->
      <div
        data-studio-tour="env-bar"
        class="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-100/70 px-4 py-2 text-xs dark:border-slate-800 dark:bg-slate-950/60"
      >
        <!-- Platform -->
        <div class="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-800">
          <button
            type="button"
            class="rounded-md px-2 py-0.5 text-[11px] font-bold transition"
            :class="
              hostConfig.platform === 'ios'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 dark:text-slate-300'
            "
            @click="setPlatform('ios')"
          >
            iOS (Swift)
          </button>
          <button
            type="button"
            class="rounded-md px-2 py-0.5 text-[11px] font-bold transition"
            :class="
              hostConfig.platform === 'android'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-600 dark:text-slate-300'
            "
            @click="setPlatform('android')"
          >
            Android (Kotlin)
          </button>
        </div>

        <!-- Role Preset -->
        <div class="flex items-center gap-1">
          <span class="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Role:</span>
          <span
            title="Giả lập vai trò user (Admin, CSKH/Sales, Giám sát, Member tối giản) để test lệnh check_permissions 2 tầng"
            class="inline-flex cursor-help items-center text-slate-400 hover:text-cyan-500 dark:text-slate-500 dark:hover:text-cyan-300"
          >
            <HelpCircle class="h-3 w-3" />
          </span>
          <select
            :value="hostConfig.rolePreset"
            class="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            @change="handleRoleChange(($event.target as HTMLSelectElement).value as RolePresetId)"
          >
            <option v-for="role in ROLE_PRESETS" :key="role.id" :value="role.id">
              {{ role.label }}
            </option>
          </select>
        </div>

        <!-- Fault Injection -->
        <div class="flex items-center gap-1">
          <span class="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Giả lập lỗi:</span>
          <span
            title="Tiêm lỗi có chủ đích (401 Fail, RBAC Deny, Android Hotline Picker, Timeout 5000ms...) để kiểm tra cách Mini App xử lý"
            class="inline-flex cursor-help items-center text-slate-400 hover:text-cyan-500 dark:text-slate-500 dark:hover:text-cyan-300"
          >
            <HelpCircle class="h-3 w-3" />
          </span>
          <select
            v-model="hostConfig.fault"
            class="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            @change="(e) => { hostConfig.fault = (e.target as HTMLSelectElement).value as SandboxFaultId; }"
          >
            <option v-for="f in SANDBOX_FAULT_OPTIONS" :key="f.id" :value="f.id">
              {{ f.label }}
            </option>
          </select>
        </div>

        <!-- Theme & Reset -->
        <button
          type="button"
          class="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          @click="toggleTheme"
        >
          Theme: {{ hostConfig.theme === 'dark' ? 'Dark' : 'Light' }}
        </button>

        <button
          type="button"
          class="ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          @click="resetHostSandbox"
        >
          <RotateCcw class="h-3 w-3" />
          Reset Host
        </button>
      </div>

      <!-- 3-Column Interactive Studio Grid -->
      <div class="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 xl:grid-cols-12 xl:overflow-hidden">
        <!-- LEFT COLUMN (4 cols): Request Composer + Push Events -->
        <div data-studio-tour="composer-col" class="flex min-h-0 flex-col gap-3 xl:col-span-4">
          <div class="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/75">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="inline-flex items-center gap-1 text-xs font-bold text-slate-900 dark:text-slate-100">
                Mini App → Host (Gửi lệnh &amp; Test Input)
                <span
                  title="Chọn hàm/action Mini App gọi lên Host, thử bấm Mẫu lỗi để xem validation của Native"
                  class="inline-flex cursor-help items-center text-slate-400 hover:text-cyan-500 dark:text-slate-500 dark:hover:text-cyan-300"
                >
                  <HelpCircle class="h-3 w-3" />
                </span>
              </span>
              <div class="flex items-center gap-1">
                <button
                  type="button"
                  class="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-300"
                  @click="selectCommand(selectedMethod, false)"
                >
                  Mẫu chuẩn
                </button>
                <button
                  type="button"
                  class="rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-500/35 dark:bg-rose-500/15 dark:text-rose-300"
                  @click="selectCommand(selectedMethod, true)"
                >
                  Mẫu lỗi
                </button>
              </div>
            </div>

            <select
              :value="selectedMethod"
              class="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-cyan-300"
              @change="selectCommand(($event.target as HTMLSelectElement).value)"
            >
              <optgroup label="Lệnh chuẩn của App này">
                <option v-for="cmd in appSpecificCommands" :key="cmd.method" :value="cmd.method">
                  {{ cmd.method }} — {{ cmd.title }}
                </option>
              </optgroup>
              <optgroup v-if="extraCommands.length > 0" label="Tất cả lệnh Core / Host khác">
                <option v-for="cmd in extraCommands" :key="cmd.method" :value="cmd.method">
                  {{ cmd.method }} — {{ cmd.title }}
                </option>
              </optgroup>
            </select>

            <p class="mt-1.5 text-[11px] leading-snug text-slate-600 dark:text-slate-300">
              {{ activeCommandSpec.summary }}
            </p>

            <!-- Compact schema tags -->
            <div v-if="activeCommandSpec.requestSchema.length > 0" class="mt-2 flex flex-wrap gap-1">
              <span
                v-for="field in activeCommandSpec.requestSchema"
                :key="field.name"
                :title="field.description"
                class="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                {{ field.name }}{{ field.required ? '*' : '' }}: {{ field.type }}
              </span>
            </div>

            <div class="mt-2 flex min-h-[130px] flex-1 flex-col">
              <textarea
                v-model="requestJsonText"
                spellcheck="false"
                class="min-h-[130px] w-full flex-1 rounded-lg border border-slate-300 bg-[#0b1120] p-2.5 font-mono text-xs text-cyan-100 focus:border-cyan-500 focus:outline-none dark:border-slate-700"
              />
              <p v-if="!parsedRequest.valid" class="mt-1 text-[11px] font-medium text-rose-500">
                JSON lỗi: {{ parsedRequest.error }}
              </p>
            </div>

            <button
              type="button"
              :disabled="!parsedRequest.valid"
              class="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
              @click="runSelectedCommand"
            >
              <Send class="h-3.5 w-3.5" />
              Gửi lên Host ({{ hostConfig.platform === 'ios' ? 'WKWebView' : 'VbMABridge' }})
            </button>
          </div>

          <!-- Host Push Events Trigger Box -->
          <div class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/75">
            <div class="flex items-center gap-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-300">
              <Zap class="h-3.5 w-3.5" />
              Host → Mini App (Bắn Push Event giả lập)
              <span
                title="Giả lập sự kiện 1 chiều Native chủ động đẩy xuống onEvent(...) của Mini App (và đẩy thẳng vào Iframe nếu đang nối localhost)"
                class="inline-flex cursor-help items-center text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-200"
              >
                <HelpCircle class="h-3 w-3" />
              </span>
            </div>
            <p class="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
              Giả lập Native chủ động đẩy sự kiện xuống WebView <code class="font-mono">onEvent(...)</code>:
            </p>
            <div class="mt-2 flex flex-wrap gap-1.5">
              <button
                v-for="evt in contract.incomingEvents"
                :key="evt.eventName"
                type="button"
                class="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50/80 px-2 py-1 font-mono text-[10px] font-semibold text-indigo-800 transition hover:bg-indigo-100 dark:border-indigo-500/35 dark:bg-indigo-500/15 dark:text-indigo-300 dark:hover:bg-indigo-500/25"
                @click="firePushEvent(evt.eventName, evt.samplePayload)"
              >
                <Play class="h-2.5 w-2.5" />
                {{ evt.eventName }}
              </button>
            </div>
          </div>
        </div>

        <!-- CENTER COLUMN (4 cols): Live Wire Console + Frame Inspector -->
        <div data-studio-tour="console-col" class="flex min-h-0 flex-col gap-3 xl:col-span-4">
          <!-- Wire Console Log -->
          <div class="flex min-h-[180px] flex-1 flex-col rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/75">
            <div class="flex flex-wrap items-center justify-between gap-1.5 border-b border-slate-200 px-3 py-2 dark:border-slate-800">
              <span class="inline-flex items-center gap-1 text-xs font-bold text-slate-900 dark:text-slate-100">
                Live Wire ({{ wireLogs.length }})
                <span
                  title="Bấm bất kỳ dòng TX / NATIVE / RX nào để soi payload JSON, xuất/nhập phiên JSON hoặc replay"
                  class="inline-flex cursor-help items-center text-slate-400 hover:text-cyan-500 dark:text-slate-500 dark:hover:text-cyan-300"
                >
                  <HelpCircle class="h-3 w-3" />
                </span>
              </span>
              <div class="flex flex-wrap items-center gap-1.5">
                <input
                  ref="importFileRef"
                  type="file"
                  accept="application/json,.json"
                  class="hidden"
                  @change="handleImportWireSession"
                />
                <button
                  type="button"
                  title="Nhập file phiên Wire Log (.json) để xem & Replay"
                  class="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  @click="triggerImportWireSession"
                >
                  <Upload class="h-2.5 w-2.5" />
                  Nhập
                </button>
                <button
                  type="button"
                  :disabled="wireLogs.length === 0"
                  title="Copy phiên JSON (đã che token)"
                  class="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  @click="copyWireSessionJson"
                >
                  <Copy class="h-2.5 w-2.5" />
                  Copy
                </button>
                <button
                  type="button"
                  :disabled="wireLogs.length === 0"
                  title="Tải file phiên Wire Log (.json)"
                  class="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  @click="exportWireSessionJson"
                >
                  <Download class="h-2.5 w-2.5" />
                  .json
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-rose-500 dark:text-slate-400"
                  @click="wireLogs = []; selectedLogId = null; exitReplayMode()"
                >
                  <Trash2 class="h-3 w-3" />
                  Xoá
                </button>
              </div>
            </div>

            <div
              v-if="replaySession"
              class="flex flex-wrap items-center justify-between gap-1.5 border-b border-cyan-200 bg-cyan-50/80 px-3 py-1.5 text-[10.5px] text-cyan-950 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-200"
            >
              <div class="flex items-center gap-1.5">
                <span class="font-bold">Replay: {{ replaySession.appId }}</span>
                <button
                  type="button"
                  class="rounded border border-cyan-300 bg-white p-0.5 dark:border-cyan-500/40 dark:bg-slate-900"
                  @click="stepReplayFrame(-1)"
                >
                  <ChevronLeft class="h-3 w-3" />
                </button>
                <span class="font-mono">{{ replayStepIndex + 1 }}/{{ wireLogs.length }}</span>
                <button
                  type="button"
                  class="rounded border border-cyan-300 bg-white p-0.5 dark:border-cyan-500/40 dark:bg-slate-900"
                  @click="stepReplayFrame(1)"
                >
                  <ChevronRight class="h-3 w-3" />
                </button>
              </div>
              <div class="flex items-center gap-1.5">
                <button
                  type="button"
                  class="inline-flex items-center gap-1 rounded bg-cyan-600 px-2 py-0.5 font-semibold text-white hover:bg-cyan-500"
                  @click="runReplayEngineComparison"
                >
                  <PlaySquare class="h-3 w-3" />
                  Chạy lại Engine
                </button>
                <span v-if="replaySummary" class="font-mono font-bold">
                  Khớp {{ replaySummary.matchedCount }}/{{ replaySummary.totalCommands }}
                </span>
                <button
                  type="button"
                  class="rounded p-0.5 hover:bg-cyan-200/70 dark:hover:bg-cyan-500/30"
                  @click="exitReplayMode"
                >
                  <X class="h-3 w-3" />
                </button>
              </div>
            </div>

            <div class="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2.5">
              <p v-if="wireLogs.length === 0" class="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                Bấm <strong>Gửi lên Host</strong> hoặc dùng nút trên <strong>Mock Phone</strong> để xem packet chạy qua Bridge.
              </p>

              <button
                v-for="frame in wireLogs"
                :key="frame.id"
                type="button"
                class="flex w-full flex-col gap-0.5 rounded-lg border p-2 text-left transition"
                :class="
                  selectedWireFrame?.id === frame.id
                    ? 'border-cyan-400 bg-cyan-50/60 dark:border-cyan-500/60 dark:bg-cyan-500/10'
                    : 'border-slate-200 bg-slate-50/50 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/50 dark:hover:border-slate-700'
                "
                @click="selectedLogId = frame.id"
              >
                <div class="flex items-center justify-between gap-1.5">
                  <span class="rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold" :class="WIRE_BADGE[frame.direction].cls">
                    {{ WIRE_BADGE[frame.direction].label }}
                  </span>
                  <span class="font-mono text-[10px] font-bold text-slate-800 dark:text-slate-200">
                    {{ frame.methodOrEvent }}
                  </span>
                  <span
                    class="ml-auto rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase"
                    :class="
                      frame.status === 'ok'
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                        : frame.status === 'pending'
                          ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300'
                          : 'bg-rose-500/20 text-rose-600 dark:text-rose-300'
                    "
                  >
                    {{ frame.status }}
                  </span>
                </div>
                <div class="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                  <span class="truncate font-mono">{{ frame.channel }}</span>
                  <span class="shrink-0 font-mono">{{ frame.timestamp }}</span>
                </div>
              </button>
            </div>
          </div>

          <!-- 3-Tab Frame Inspector -->
          <div class="flex min-h-[210px] flex-1 flex-col rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/75">
            <div class="flex items-center gap-1 border-b border-slate-200 px-3 py-1.5 dark:border-slate-800">
              <button
                type="button"
                class="rounded-md px-2 py-1 text-[11px] font-semibold transition"
                :class="
                  inspectorTab === 'response'
                    ? 'bg-slate-900 text-white dark:bg-cyan-500/20 dark:text-cyan-300'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                "
                @click="inspectorTab = 'response'"
              >
                Response &amp; Wire JSON
              </button>
              <button
                type="button"
                class="rounded-md px-2 py-1 text-[11px] font-semibold transition"
                :class="
                  inspectorTab === 'sdk'
                    ? 'bg-slate-900 text-white dark:bg-cyan-500/20 dark:text-cyan-300'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                "
                @click="inspectorTab = 'sdk'"
              >
                Code @vbotma/sdk
              </button>
              <button
                type="button"
                class="rounded-md px-2 py-1 text-[11px] font-semibold transition"
                :class="
                  inspectorTab === 'native'
                    ? 'bg-slate-900 text-white dark:bg-cyan-500/20 dark:text-cyan-300'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                "
                @click="inspectorTab = 'native'"
              >
                Host Native iOS/Android
              </button>
            </div>

            <div class="min-h-0 flex-1 overflow-y-auto p-3">
              <!-- Inspector 1: JSON -->
              <div v-if="inspectorTab === 'response'" class="space-y-2">
                <div
                  v-if="lastResult?.parityAlertNote"
                  class="flex items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200"
                >
                  <AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{{ lastResult.parityAlertNote }}</span>
                </div>
                <div class="flex items-center justify-between text-[11px]">
                  <span class="font-mono font-semibold text-slate-500 dark:text-slate-400">
                    {{ selectedWireFrame ? selectedWireFrame.methodOrEvent : activeCommandSpec.method }}
                  </span>
                  <button
                    type="button"
                    class="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    @click="copyValue('inspect-json', inspectedJsonString, 'Wire JSON')"
                  >
                    <Copy class="h-2.5 w-2.5" />
                    Copy
                  </button>
                </div>
                <JsonCodeBlock :code="inspectedJsonString" />
              </div>

              <!-- Inspector 2: SDK Snippet -->
              <div v-else-if="inspectorTab === 'sdk'" class="space-y-2">
                <div class="flex items-center justify-between text-[11px]">
                  <span class="font-semibold text-cyan-700 dark:text-cyan-300">Copy vào project Mini App Web:</span>
                  <button
                    type="button"
                    class="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    @click="copyValue('inspect-sdk', inspectedSdkSnippet, 'Code SDK')"
                  >
                    <Copy class="h-2.5 w-2.5" />
                    Copy Code
                  </button>
                </div>
                <pre class="overflow-x-auto rounded-lg border border-slate-800 bg-[#0b1120] p-2.5 font-mono text-[11px] leading-relaxed text-cyan-100"><code>{{ inspectedSdkSnippet }}</code></pre>
              </div>

              <!-- Inspector 3: Native Traces -->
              <div v-else class="space-y-2 text-xs">
                <div class="rounded-lg border border-indigo-200 bg-indigo-50/60 p-2.5 dark:border-indigo-500/30 dark:bg-indigo-500/10">
                  <div class="flex items-center gap-1 text-[10px] font-bold text-indigo-700 uppercase dark:text-indigo-300">
                    <Cpu class="h-3 w-3" />
                    iOS Swift Handler
                  </div>
                  <code class="mt-1 block font-mono text-[11px] font-bold text-slate-900 dark:text-slate-100">
                    {{ lastResult?.nativeIosTrace.fn ?? activeCommandSpec.iosHandler }}
                  </code>
                  <p v-if="lastResult" class="mt-1 text-[11px] text-slate-600 dark:text-slate-300">
                    {{ lastResult.nativeIosTrace.detail }}
                  </p>
                </div>

                <div class="rounded-lg border border-emerald-200 bg-emerald-50/60 p-2.5 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                  <div class="flex items-center gap-1 text-[10px] font-bold text-emerald-700 uppercase dark:text-emerald-300">
                    <Cpu class="h-3 w-3" />
                    Android Kotlin Handler
                  </div>
                  <code class="mt-1 block font-mono text-[11px] font-bold text-slate-900 dark:text-slate-100">
                    {{ lastResult?.nativeAndroidTrace.fn ?? activeCommandSpec.androidHandler }}
                  </code>
                  <p v-if="lastResult" class="mt-1 text-[11px] text-slate-600 dark:text-slate-300">
                    {{ lastResult.nativeAndroidTrace.detail }}
                  </p>
                </div>

                <div
                  v-if="lastResult?.parityAlertNote || activeCommandSpec.parityNote"
                  class="rounded-lg border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200"
                >
                  <strong>Cảnh báo Parity:</strong> {{ lastResult?.parityAlertNote ?? activeCommandSpec.parityNote }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- RIGHT COLUMN (4 cols): Mock Phone UI & Localhost Iframe -->
        <div class="flex min-h-[480px] flex-col xl:col-span-4 xl:min-h-0">
          <MiniAppPhonePreview
            ref="phonePreviewRef"
            :contract="contract"
            :config="hostConfig"
            :state="hostState"
            :launch-hash="launchHash"
            :launch-params-obj="launchParamsObj"
            @send-command="runDirectCommand"
            @resolve-hotline="handleResolveHotline"
            @resolve-closing-modal="handleResolveClosingModal"
            @hangup-call="handleHangupCall"
            @iframe-incoming="runDirectCommand"
          />
        </div>
      </div>
    </template>

    <!-- VIEW 2: 2-WAY CONTRACT SHEET & STARTER CODE -->
    <div v-else-if="studioView === 'contract'" class="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
      <!-- App Contract Header Summary -->
      <div class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/80">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">
                {{ contract.app.nameVi }} ({{ contract.app.nameEn }})
              </h3>
              <span class="rounded border border-cyan-200 bg-cyan-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-cyan-800 dark:border-cyan-500/35 dark:bg-cyan-500/15 dark:text-cyan-300">
                {{ contract.app.id }}
              </span>
              <span class="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {{ contract.app.placement }} · {{ contract.app.accessLevel }}
              </span>
            </div>
            <ul class="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300">
              <li v-for="note in contract.launchNotes" :key="note">• {{ note }}</li>
            </ul>
          </div>

          <button
            v-if="contract.app.simulatorFlowId"
            type="button"
            class="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/35 dark:bg-indigo-500/15 dark:text-indigo-300"
            @click="emit('openFlow', contract.app.simulatorFlowId)"
          >
            Xem Sequence Flow
            <ExternalLink class="h-3 w-3" />
          </button>
        </div>

        <div
          v-if="contract.parityAlerts.length > 0"
          class="mt-3 space-y-1.5 rounded-lg border border-amber-300 bg-amber-50/80 p-3 text-xs text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200"
        >
          <div class="flex items-center gap-1.5 font-bold">
            <AlertTriangle class="h-3.5 w-3.5" />
            Lưu ý lệch iOS ↔ Android dành cho Dev Mini App:
          </div>
          <div v-for="alert in contract.parityAlerts" :key="alert.id" class="text-[11px]">
            • <strong>{{ alert.title }}:</strong> {{ alert.recommendationForMiniApp }}
          </div>
        </div>
      </div>

      <!-- 2-Column Symmetric Contract Table -->
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <!-- Column 1: Host -> Mini App -->
        <div class="space-y-3 rounded-xl border border-indigo-200/80 bg-white p-4 dark:border-indigo-500/30 dark:bg-slate-900/80">
          <div class="flex items-center gap-2 border-b border-slate-100 pb-2 dark:border-slate-800">
            <ArrowDownLeft class="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <h4 class="text-xs font-bold tracking-wide text-indigo-800 uppercase dark:text-indigo-300">
              1. Host → Mini App (Host truyền vào &amp; đẩy xuống)
            </h4>
          </div>

          <!-- Launch Params -->
          <div class="space-y-2">
            <div class="text-[11px] font-bold text-slate-700 dark:text-slate-300">
              A. Launch Params khi mở WebView (URL Hash):
            </div>
            <div
              v-for="lp in contract.launchParams"
              :key="lp.key"
              class="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 text-xs dark:border-slate-800 dark:bg-slate-950/60"
            >
              <div class="flex flex-wrap items-center justify-between gap-1">
                <code class="font-mono font-bold text-indigo-700 dark:text-indigo-300">{{ lp.key }}</code>
                <span class="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                  {{ lp.type }} · {{ lp.required ? 'Bắt buộc' : 'Tuỳ chọn' }}
                </span>
              </div>
              <p class="mt-1 text-[11px] text-slate-700 dark:text-slate-300">{{ lp.description }}</p>
              <code class="mt-1 block truncate rounded bg-slate-900 px-2 py-1 font-mono text-[10px] text-cyan-200">
                {{ lp.exampleValue }}
              </code>
              <p v-if="lp.parityNote" class="mt-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                ⚠️ {{ lp.parityNote }}
              </p>
            </div>
          </div>

          <!-- Push Events -->
          <div class="space-y-2 pt-1">
            <div class="text-[11px] font-bold text-slate-700 dark:text-slate-300">
              B. Host Push Events (Nhận qua <code class="font-mono">onEvent(...)</code>):
            </div>
            <div
              v-for="evt in contract.incomingEvents"
              :key="evt.eventName"
              class="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 text-xs dark:border-slate-800 dark:bg-slate-950/60"
            >
              <div class="flex items-center justify-between gap-2">
                <div>
                  <code class="font-mono font-bold text-slate-900 dark:text-slate-100">{{ evt.eventName }}</code>
                  <span class="ml-1.5 text-[11px] text-slate-500 dark:text-slate-400">— {{ evt.title }}</span>
                </div>
                <button
                  type="button"
                  class="inline-flex shrink-0 items-center gap-1 rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/35 dark:bg-indigo-500/15 dark:text-indigo-300"
                  @click="jumpToSandboxWithPush(evt.eventName, evt.samplePayload)"
                >
                  <PlayCircle class="h-3 w-3" />
                  Bắn thử
                </button>
              </div>
              <p class="mt-1 text-[11px] text-slate-600 dark:text-slate-300">{{ evt.summary }}</p>
              <JsonCodeBlock class="mt-1.5" :code="JSON.stringify(evt.samplePayload, null, 2)" />
              <p v-if="evt.parityNote" class="mt-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                ⚠️ {{ evt.parityNote }}
              </p>
            </div>
          </div>
        </div>

        <!-- Column 2: Mini App -> Host -->
        <div class="space-y-3 rounded-xl border border-cyan-200/80 bg-white p-4 dark:border-cyan-500/30 dark:bg-slate-900/80">
          <div class="flex items-center gap-2 border-b border-slate-100 pb-2 dark:border-slate-800">
            <ArrowUpRight class="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
            <h4 class="text-xs font-bold tracking-wide text-cyan-800 uppercase dark:text-cyan-300">
              2. Mini App → Host (Gửi lên &amp; Host trả về)
            </h4>
          </div>

          <div
            v-for="cmd in contract.outgoingCommands"
            :key="cmd.method"
            class="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 text-xs dark:border-slate-800 dark:bg-slate-950/60"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-1.5">
                <code class="font-mono text-xs font-bold text-slate-900 dark:text-slate-100">{{ cmd.method }}</code>
                <span
                  class="rounded px-1.5 py-0.5 text-[9px] font-bold"
                  :class="
                    cmd.isHostAction
                      ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-300'
                      : 'bg-cyan-100 text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-300'
                  "
                >
                  {{ cmd.isHostAction ? 'Host Action' : 'Core SDK' }}
                </span>
              </div>
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded border border-cyan-300 bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-cyan-800 hover:bg-cyan-100 dark:border-cyan-500/35 dark:bg-cyan-500/15 dark:text-cyan-300"
                @click="jumpToSandboxWithCommand(cmd.method)"
              >
                <PlayCircle class="h-3 w-3" />
                Thử lệnh này
              </button>
            </div>
            <p class="mt-1 text-[11px] text-slate-600 dark:text-slate-300">{{ cmd.summary }}</p>
            <code class="mt-1 block font-mono text-[10px] text-cyan-700 dark:text-cyan-300">{{ cmd.sdkCallSummary }}</code>
            <div class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <div class="mb-0.5 text-[10px] font-bold text-slate-500 dark:text-slate-400">Request gửi lên</div>
                <JsonCodeBlock :code="JSON.stringify(cmd.validExample, null, 2)" />
              </div>
              <div>
                <div class="mb-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">Response Host trả về</div>
                <JsonCodeBlock :code="JSON.stringify(cmd.responseOk, null, 2)" />
              </div>
            </div>
            <p v-if="cmd.parityNote" class="mt-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
              ⚠️ {{ cmd.parityNote }}
            </p>
          </div>
        </div>
      </div>

      <!-- Bottom Row: manifest.json + Starter Code -->
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/80">
          <div class="mb-2 flex items-center justify-between">
            <h4 class="text-xs font-bold text-slate-900 dark:text-slate-100">
              manifest.json · Khai báo quyền module ({{ contract.app.id }})
            </h4>
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              @click="copyValue('manifest-json', contract.manifestPermissionsJson, 'manifest.json')"
            >
              <Copy class="h-2.5 w-2.5" />
              Copy JSON
            </button>
          </div>
          <JsonCodeBlock :code="contract.manifestPermissionsJson" />
        </div>

        <div class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/80">
          <div class="mb-2 flex items-center justify-between">
            <h4 class="text-xs font-bold text-slate-900 dark:text-slate-100">
              Starter Code TypeScript (@vbotma/sdk)
            </h4>
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              @click="copyValue('starter-bottom', starterCode, 'Starter Code .ts')"
            >
              <Copy class="h-2.5 w-2.5" />
              Copy TypeScript
            </button>
          </div>
          <pre class="max-h-72 overflow-auto rounded-lg border border-slate-800 bg-[#0b1120] p-3 font-mono text-[11px] leading-relaxed text-cyan-100"><code>{{ starterCode }}</code></pre>
        </div>
      </div>
    </div>

    <!-- VIEW 3: AUTOMATED BRIDGE CONTRACT TEST SUITE & LIVE COMPLIANCE -->
    <div v-else class="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
      <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/80">
        <div>
          <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">
            Kiểm thử Chuẩn Hợp đồng Bridge — {{ contract.app.nameVi }} ({{ contract.app.id }})
          </h3>
          <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Chạy tự động trên cả iOS &amp; Android (Lifecycle, 401 Refresh/Logout, RBAC 2 tầng, Bảo mật &amp; Custom Actions) + Đánh giá Live Iframe.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-500"
            @click="runContractTestSuite"
          >
            <FlaskConical class="h-3.5 w-3.5" />
            Chạy lại Test Suite
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            @click="downloadSuiteMarkdown"
          >
            <Download class="h-3.5 w-3.5" />
            Biên bản (.md)
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            @click="downloadSuiteJson"
          >
            <FileJson class="h-3.5 w-3.5" />
            Kết quả (.json)
          </button>
        </div>
      </div>

      <div v-if="suiteReport" class="space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-2 text-xs">
            <span class="rounded-full bg-emerald-100 px-3 py-1 font-bold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
              Pass: {{ suiteReport.passed }}
            </span>
            <span class="rounded-full bg-amber-100 px-3 py-1 font-bold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
              Cảnh báo Parity: {{ suiteReport.warnings }}
            </span>
            <span class="rounded-full bg-rose-100 px-3 py-1 font-bold text-rose-800 dark:bg-rose-500/20 dark:text-rose-300">
              Fail: {{ suiteReport.failed }}
            </span>
            <span class="font-mono text-[11px] text-slate-500 dark:text-slate-400">
              ({{ suiteReport.durationMs }} ms)
            </span>
          </div>

          <div class="flex flex-wrap gap-1">
            <button
              v-for="tab in [
                { id: 'all', label: `Tất cả (${suiteReport.total})` },
                { id: 'fail', label: `Fail (${suiteReport.failed})` },
                { id: 'warning', label: `Parity (${suiteReport.warnings})` },
                { id: 'pass', label: `Pass (${suiteReport.passed})` },
              ] as const"
              :key="tab.id"
              type="button"
              class="rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition"
              :class="
                suiteFilter === tab.id
                  ? 'border-indigo-600 bg-indigo-600 text-white dark:border-cyan-500 dark:bg-cyan-500 dark:text-slate-950'
                  : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
              "
              @click="suiteFilter = tab.id"
            >
              {{ tab.label }}
            </button>
          </div>
        </div>

        <ul class="space-y-2">
          <li
            v-for="item in filteredSuiteResults"
            :key="item.id"
            class="rounded-xl border border-slate-200 bg-white p-3.5 text-xs dark:border-slate-800 dark:bg-slate-900/75"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex flex-wrap items-center gap-1.5">
                <span
                  class="rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase"
                  :class="
                    item.platform === 'ios'
                      ? 'bg-slate-800 text-white'
                      : 'bg-emerald-600 text-white'
                  "
                >
                  {{ item.platform }}
                </span>
                <code class="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-800 dark:bg-slate-800 dark:text-cyan-300">
                  {{ item.method }}
                </code>
                <span class="font-bold text-slate-900 dark:text-slate-100">
                  {{ item.title }}
                </span>
              </div>

              <span
                class="rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase"
                :class="
                  item.status === 'pass'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                    : item.status === 'warning'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                      : 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300'
                "
              >
                {{ item.status === 'warning' ? 'PARITY WARN' : item.status }}
              </span>
            </div>

            <div class="mt-2 grid gap-2 text-[11px] sm:grid-cols-2">
              <div class="rounded-lg bg-slate-50 px-2.5 py-1.5 text-slate-600 dark:bg-slate-950/60 dark:text-slate-300">
                <strong>Kỳ vọng:</strong> {{ item.expectedSummary }}
              </div>
              <div class="rounded-lg bg-slate-50 px-2.5 py-1.5 text-slate-600 dark:bg-slate-950/60 dark:text-slate-300">
                <strong>Thực tế:</strong> {{ item.actualSummary }}
              </div>
            </div>
            <p
              v-if="item.parityNote"
              class="mt-1.5 text-[11px] font-medium text-amber-800 dark:text-amber-300"
            >
              ⚠️ {{ item.parityNote }}
            </p>
          </li>
        </ul>
      </div>

      <!-- Mode 2: Live Iframe Compliance -->
      <div class="space-y-3 rounded-xl border border-cyan-200 bg-cyan-50/40 p-4 dark:border-cyan-500/30 dark:bg-cyan-500/10">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 class="text-xs font-bold text-cyan-950 uppercase dark:text-cyan-200">
              Nghiệm thu Mini App thật đang nhúng qua Iframe (Live Wire Logs)
            </h4>
            <p class="mt-0.5 text-[11px] text-slate-600 dark:text-slate-300">
              Tự động đối chiếu các lệnh Mini App localhost gửi lên trong tab Sandbox hiện tại ({{ wireLogs.length }} frames).
            </p>
          </div>
          <div class="flex flex-wrap gap-1.5">
            <button
              type="button"
              class="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/20 dark:text-amber-200"
              @click="triggerQuickLiveFault('token_401_refresh_fail')"
            >
              Thử Fault 401 Logout
            </button>
            <button
              type="button"
              class="rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-900 hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-500/20 dark:text-rose-200"
              @click="triggerQuickLiveFault('rbac_denied')"
            >
              Thử Fault RBAC 403
            </button>
          </div>
        </div>

        <ul class="grid gap-2 sm:grid-cols-2">
          <li
            v-for="chk in liveComplianceChecks"
            :key="chk.id"
            class="rounded-lg border border-slate-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-900/90"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="font-bold text-slate-900 dark:text-slate-100">{{ chk.title }}</span>
              <span
                class="rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase"
                :class="
                  chk.status === 'pass'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                    : chk.status === 'warning'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                      : 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300'
                "
              >
                {{ chk.status }}
              </span>
            </div>
            <p class="mt-1 text-[11px] text-slate-600 dark:text-slate-300">{{ chk.detail }}</p>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
