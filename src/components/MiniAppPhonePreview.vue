<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  AlertTriangle,
  Check,
  Code2,
  Copy,
  Globe,
  Maximize2,
  PhoneCall,
  PhoneOff,
  Play,
  RefreshCw,
  ShieldAlert,
  Smartphone,
  Terminal,
  X,
  Zap,
} from 'lucide-vue-next';
import { useToast } from '../composables/useToast';
import { copyTextToClipboard } from '../core/downloadHelper';
import type { MiniAppContract } from '../core/miniAppContractBuilder';
import {
  buildDevBridgeShimSnippet,
  parseIncomingIframeMessage,
  validateIframeDevUrl,
  type SandboxHostConfig,
  type SandboxHostState,
} from '../core/miniAppSandboxEngine';

const props = defineProps<{
  contract: MiniAppContract;
  config: SandboxHostConfig;
  state: SandboxHostState;
  launchHash: string;
  launchParamsObj: Record<string, unknown>;
}>();

const emit = defineEmits<{
  sendCommand: [method: string, payload: Record<string, unknown>];
  resolveHotline: [hotline: string | null];
  resolveClosingModal: [confirmClose: boolean];
  hangupCall: [];
  iframeIncoming: [method: string, payload: Record<string, unknown>];
}>();

const { pushToast } = useToast();

type PreviewMode = 'mock' | 'iframe';
const previewMode = ref<PreviewMode>('mock');

const iframeUrlInput = ref('http://localhost:5173');
const activeIframeSrc = ref('');
const iframeRef = ref<HTMLIFrameElement | null>(null);
const showShimCard = ref(true);
const showLaunchDetail = ref(false);
const copiedKey = ref<string | null>(null);
let copyTimer: ReturnType<typeof setTimeout> | null = null;

const iframeValidation = computed(() => validateIframeDevUrl(iframeUrlInput.value));

const fullIframeUrlWithHash = computed(() => {
  if (!iframeValidation.value.valid || !iframeValidation.value.normalizedUrl) return '';
  const base = iframeValidation.value.normalizedUrl.split('#')[0];
  return `${base}${props.launchHash}`;
});

const copyValue = async (key: string, text: string, label: string) => {
  const ok = await copyTextToClipboard(text);
  if (!ok) {
    pushToast('Không thể sao chép vào clipboard', 'error');
    return;
  }
  copiedKey.value = key;
  if (copyTimer) clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    copiedKey.value = null;
  }, 1800);
  pushToast(`Đã copy ${label}`, 'success');
};

const loadIframeUrl = () => {
  if (!iframeValidation.value.valid) {
    pushToast(iframeValidation.value.reason ?? 'URL không hợp lệ', 'error');
    return;
  }
  activeIframeSrc.value = fullIframeUrlWithHash.value;
};

const reloadIframe = () => {
  if (!activeIframeSrc.value) {
    loadIframeUrl();
    return;
  }
  const current = activeIframeSrc.value;
  activeIframeSrc.value = '';
  requestAnimationFrame(() => {
    activeIframeSrc.value = current;
  });
};

watch(
  () => [props.launchHash, previewMode.value] as const,
  ([, mode]) => {
    if (mode === 'iframe' && activeIframeSrc.value && iframeValidation.value.valid) {
      activeIframeSrc.value = fullIframeUrlWithHash.value;
    }
  },
);

const postEventToIframe = (eventName: string, payload: Record<string, unknown>): boolean => {
  const targetWindow = iframeRef.value?.contentWindow;
  if (previewMode.value !== 'iframe' || !targetWindow || !activeIframeSrc.value) {
    return false;
  }
  let targetOrigin = '*';
  try {
    targetOrigin = new URL(activeIframeSrc.value).origin;
  } catch {
    return false;
  }
  targetWindow.postMessage(
    {
      source: 'vbot-studio-host',
      eventName,
      payload,
    },
    targetOrigin,
  );
  return true;
};

defineExpose({
  postEventToIframe,
});

const handleWindowMessage = (event: MessageEvent) => {
  if (!iframeRef.value?.contentWindow || event.source !== iframeRef.value.contentWindow) {
    return;
  }
  const parsed = parseIncomingIframeMessage(event.data);
  if (!parsed) return;
  emit('iframeIncoming', parsed.method, {
    ...parsed.payload,
    ...(parsed.requestId ? { request_id: parsed.requestId } : {}),
  });
};

onMounted(() => {
  window.addEventListener('message', handleWindowMessage);
});

onBeforeUnmount(() => {
  window.removeEventListener('message', handleWindowMessage);
  if (copyTimer) clearTimeout(copyTimer);
});

const quickMockButtons = computed(() => {
  const appId = props.contract.app.id;
  const buttons: Array<{ label: string; method: string; payload: Record<string, unknown>; accent?: string }> = [
    { label: 'ready()', method: 'ready', payload: { sdk_version: '1.4.2' } },
    { label: 'Get Token', method: 'request_mini_app_token', payload: { force: false } },
  ];

  if (appId === 'vb-ma-autodial') {
    buttons.push(
      {
        label: 'Start Autodial',
        method: 'start_autodial',
        payload: { autoDialId: 151, hotline: props.config.defaultHotline, campaignName: 'CSKH T11' },
        accent: 'primary',
      },
      { label: 'Pause', method: 'pause_autodial', payload: {} },
      { label: 'Resume', method: 'resume_autodial', payload: {} },
      { label: 'Stop', method: 'stop_autodial', payload: {} },
    );
  } else if (appId === 'vb-ma-monitoring') {
    buttons.push(
      { label: 'Listen (1)', method: 'monitor_call', payload: { call_id: 'call_live_77', mode: 1 }, accent: 'primary' },
      { label: 'Whisper (5)', method: 'monitor_call', payload: { call_id: 'call_live_77', mode: 5 } },
    );
  } else if (appId === 'vb-ma-user-contact') {
    buttons.push(
      { label: 'Đọc Local', method: 'user_contact_get_local', payload: { limit: 20 }, accent: 'primary' },
      { label: 'Import OS', method: 'user_contact_import_device', payload: {} },
      { label: 'Sync Server', method: 'user_contact_refresh_server', payload: {} },
    );
  } else {
    buttons.push(
      {
        label: 'Gọi ra',
        method: 'make_call',
        payload: { phone: '0901234567', hotline: props.config.defaultHotline, name: 'Nguyễn Văn A' },
        accent: 'primary',
      },
      {
        label: 'Mở App con',
        method: 'open_mini_app',
        payload: { app_id: 'vb-ma-activity-history', extra_data: { customerId: 'CUS-1042' } },
      },
    );
  }

  buttons.push({ label: 'Show Toast', method: 'show_toast', payload: { message: 'Thao tác thành công', type: 'success' } });
  return buttons;
});

const missingThemeOnAndroidHistory = computed(
  () => props.config.platform === 'android' && props.contract.app.id === 'vb-ma-user-history-call',
);
</script>

<template>
  <div class="flex h-full min-h-0 flex-col rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/75">
    <!-- Top mode switcher -->
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-800">
      <div class="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800">
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition"
          :class="
            previewMode === 'mock'
              ? 'bg-white text-slate-900 shadow-2xs dark:bg-slate-700 dark:text-white'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
          "
          @click="previewMode = 'mock'"
        >
          <Smartphone class="h-3 w-3" />
          Mock UI (Sẵn)
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition"
          :class="
            previewMode === 'iframe'
              ? 'bg-white text-cyan-700 shadow-2xs dark:bg-cyan-500/20 dark:text-cyan-300'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
          "
          @click="previewMode = 'iframe'"
        >
          <Globe class="h-3 w-3" />
          Iframe Localhost
        </button>
      </div>

      <div class="flex items-center gap-1.5 text-[10px] font-semibold">
        <span
          class="rounded-full border px-2 py-0.5"
          :class="
            state.isReady
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-300'
              : 'border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
          "
        >
          {{ state.isReady ? 'SDK ready()' : 'Chưa ready()' }}
        </span>
      </div>
    </div>

    <!-- Phone Bezel Wrapper -->
    <div class="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
      <div
        class="relative mx-auto flex min-h-[460px] w-full max-w-[360px] flex-1 flex-col overflow-hidden rounded-[26px] border-[4px] shadow-md transition-colors"
        :class="[
          config.platform === 'ios'
            ? 'border-slate-800 dark:border-slate-700'
            : 'border-emerald-900/70 dark:border-emerald-700/60',
          state.theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-white text-slate-900',
        ]"
      >
        <!-- OS Status Bar -->
        <div
          class="flex items-center justify-between px-4 py-1.5 text-[10px] font-bold"
          :class="state.theme === 'dark' ? 'bg-slate-900 text-slate-300' : 'bg-slate-100 text-slate-700'"
        >
          <span>{{ config.platform === 'ios' ? '9:41 · iOS WKWebView' : '09:41 · Android WebView' }}</span>
          <div class="flex items-center gap-1.5">
            <span v-if="state.closingConfirmation" title="closingConfirmation=true" class="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] text-amber-400">
              ConfirmClose
            </span>
            <span
              class="rounded px-1.5 py-0.5 text-[9px] uppercase"
              :class="config.platform === 'ios' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-emerald-500/20 text-emerald-400'"
            >
              {{ config.platform }}
            </span>
          </div>
        </div>

        <!-- VBot Native Mini App Header -->
        <div
          class="flex items-center justify-between border-b px-3 py-2"
          :class="state.theme === 'dark' ? 'border-slate-800 bg-slate-900/80' : 'border-slate-200 bg-slate-50'"
        >
          <div class="min-w-0">
            <div class="truncate text-xs font-bold">{{ contract.app.nameVi }}</div>
            <div class="truncate font-mono text-[10px] opacity-65">{{ contract.app.id }}</div>
          </div>
          <div class="flex items-center gap-1">
            <button
              type="button"
              title="expand()"
              class="rounded-md p-1 opacity-75 transition hover:bg-slate-500/15 hover:opacity-100"
              @click="emit('sendCommand', 'expand', {})"
            >
              <Maximize2 class="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="close()"
              class="rounded-md p-1 opacity-75 transition hover:bg-rose-500/20 hover:text-rose-400 hover:opacity-100"
              @click="emit('sendCommand', 'close', {})"
            >
              <X class="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <!-- Native Logout Error Banner (Android 401 fail) -->
        <div
          v-if="state.sessionLogoutTriggered"
          class="flex items-center gap-2 bg-rose-600 px-3 py-1.5 text-[10px] font-semibold text-white"
        >
          <ShieldAlert class="h-3.5 w-3.5 shrink-0" />
          <span>Host đã gọi logout 1 lần vì 401 Refresh Token thất bại!</span>
        </div>

        <!-- Native Active Call / Autodial Banner -->
        <div
          v-if="state.activeCall"
          class="flex items-center justify-between gap-2 bg-emerald-600 px-3 py-1.5 text-[10px] text-white"
        >
          <div class="flex min-w-0 items-center gap-1.5">
            <PhoneCall class="h-3.5 w-3.5 shrink-0 animate-pulse" />
            <div class="min-w-0 truncate">
              <span class="font-bold">{{ state.activeCall.phone }}</span>
              <span class="opacity-85"> · {{ state.activeCall.hotline }} ({{ state.activeCall.modeLabel || state.activeCall.state }})</span>
            </div>
          </div>
          <button
            type="button"
            class="inline-flex shrink-0 items-center gap-1 rounded bg-rose-600 px-2 py-0.5 text-[10px] font-bold hover:bg-rose-500"
            @click="emit('hangupCall')"
          >
            <PhoneOff class="h-3 w-3" />
            Kết thúc
          </button>
        </div>

        <div
          v-if="state.autodial.status === 'running' || state.autodial.status === 'paused'"
          class="flex items-center justify-between gap-2 border-b border-indigo-500/30 bg-indigo-600/90 px-3 py-1.5 text-[10px] text-white"
        >
          <span class="truncate font-semibold">
            Autodial #{{ state.autodial.autoDialId }} · {{ state.autodial.status.toUpperCase() }} ({{ state.autodial.dialedCount }}/{{ state.autodial.totalCount }})
          </span>
          <div class="flex items-center gap-1">
            <button
              v-if="state.autodial.status === 'running'"
              type="button"
              class="rounded bg-white/20 px-1.5 py-0.5 font-semibold hover:bg-white/30"
              @click="emit('sendCommand', 'pause_autodial', {})"
            >
              Pause
            </button>
            <button
              v-else
              type="button"
              class="rounded bg-white/20 px-1.5 py-0.5 font-semibold hover:bg-white/30"
              @click="emit('sendCommand', 'resume_autodial', {})"
            >
              Resume
            </button>
            <button
              type="button"
              class="rounded bg-rose-500 px-1.5 py-0.5 font-semibold hover:bg-rose-400"
              @click="emit('sendCommand', 'stop_autodial', {})"
            >
              Stop
            </button>
          </div>
        </div>

        <!-- BODY: MOCK UI vs IFRAME LOCALHOST -->
        <div v-if="previewMode === 'mock'" class="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3 text-xs">
          <!-- Launch Params Summary Card -->
          <div
            class="rounded-lg border p-2.5"
            :class="state.theme === 'dark' ? 'border-slate-800 bg-slate-900/90' : 'border-slate-200 bg-slate-50'"
          >
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-bold tracking-wide text-cyan-500 uppercase">Launch Params (#vbma_data)</span>
              <button
                type="button"
                class="text-[10px] font-semibold text-cyan-500 hover:underline"
                @click="showLaunchDetail = !showLaunchDetail"
              >
                {{ showLaunchDetail ? 'Thu gọn' : 'Chi tiết' }}
              </button>
            </div>
            <div class="mt-1 flex flex-wrap gap-1 font-mono text-[10px]">
              <span class="rounded bg-slate-500/15 px-1.5 py-0.5">user: {{ config.userId }}</span>
              <span class="rounded bg-slate-500/15 px-1.5 py-0.5">admin: {{ config.roleState.isAdmin }}</span>
              <span
                class="rounded px-1.5 py-0.5"
                :class="
                  missingThemeOnAndroidHistory
                    ? 'bg-amber-500/20 text-amber-400'
                    : 'bg-slate-500/15'
                "
              >
                {{ missingThemeOnAndroidHistory ? 'theme_params: THIẾU (Parity!)' : `theme: ${config.theme}` }}
              </span>
            </div>
            <pre
              v-if="showLaunchDetail"
              class="mt-2 max-h-28 overflow-auto rounded bg-slate-950 p-2 font-mono text-[10px] text-cyan-200"
            >{{ JSON.stringify(launchParamsObj, null, 2) }}</pre>
          </div>

          <!-- Latest Host Push Event Banner -->
          <div
            v-if="state.lastPushEvent"
            class="rounded-lg border border-cyan-500/35 bg-cyan-500/10 p-2 text-[11px]"
          >
            <div class="flex items-center gap-1 font-bold text-cyan-500">
              <Zap class="h-3 w-3" />
              Host Push → {{ state.lastPushEvent.eventName }}
            </div>
            <pre class="mt-1 overflow-x-auto font-mono text-[10px] opacity-85">{{ JSON.stringify(state.lastPushEvent.payload, null, 2) }}</pre>
          </div>

          <!-- Quick Test Buttons inside Mock WebView -->
          <div class="space-y-1.5">
            <div class="text-[10px] font-bold tracking-wide uppercase opacity-65">
              Thao tác thử trực tiếp từ Mock WebView
            </div>
            <div class="grid grid-cols-2 gap-1.5">
              <button
                v-for="btn in quickMockButtons"
                :key="btn.label"
                type="button"
                class="flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition"
                :class="
                  btn.accent === 'primary'
                    ? 'border-cyan-500 bg-cyan-600 text-white hover:bg-cyan-500'
                    : state.theme === 'dark'
                      ? 'border-slate-700 bg-slate-800/90 text-slate-200 hover:bg-slate-700'
                      : 'border-slate-200 bg-slate-100 text-slate-800 hover:bg-slate-200'
                "
                @click="emit('sendCommand', btn.method, btn.payload)"
              >
                <Play class="h-2.5 w-2.5 shrink-0" />
                <span class="truncate">{{ btn.label }}</span>
              </button>
            </div>
          </div>

          <!-- Contacts state summary when relevant -->
          <div
            v-if="contract.app.id === 'vb-ma-user-contact'"
            class="rounded-lg border p-2 text-[10px]"
            :class="state.theme === 'dark' ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-slate-50'"
          >
            SQLite Local Contacts: <strong>{{ state.contacts.localCount }}</strong> · Quyền OS: <strong>{{ state.contacts.devicePermission }}</strong>
          </div>

          <!-- Extra status footer -->
          <div v-if="state.lastHaptic || state.lastOpenedUrl" class="mt-auto space-y-1 text-[10px] opacity-75">
            <div v-if="state.lastHaptic">Haptic gần nhất: <code>{{ state.lastHaptic }}</code></div>
            <div v-if="state.lastOpenedUrl" class="truncate">URL vừa mở: <code>{{ state.lastOpenedUrl }}</code></div>
          </div>
        </div>

        <!-- IFRAME LOCALHOST MODE -->
        <div v-else class="flex min-h-0 flex-1 flex-col gap-2 p-2.5 text-xs">
          <div class="space-y-1.5">
            <div class="flex items-center gap-1">
              <input
                v-model="iframeUrlInput"
                type="text"
                placeholder="http://localhost:5173"
                class="min-w-0 flex-1 rounded-lg border px-2 py-1 font-mono text-[11px] focus:outline-none"
                :class="
                  state.theme === 'dark'
                    ? 'border-slate-700 bg-slate-900 text-slate-100 focus:border-cyan-500'
                    : 'border-slate-300 bg-white text-slate-900 focus:border-cyan-600'
                "
                @keydown.enter="loadIframeUrl"
              />
              <button
                type="button"
                class="rounded-lg bg-cyan-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-cyan-500"
                @click="loadIframeUrl"
              >
                Nạp
              </button>
              <button
                v-if="activeIframeSrc"
                type="button"
                title="Tải lại Iframe"
                class="rounded-lg border p-1 opacity-80 hover:opacity-100"
                :class="state.theme === 'dark' ? 'border-slate-700' : 'border-slate-300'"
                @click="reloadIframe"
              >
                <RefreshCw class="h-3.5 w-3.5" />
              </button>
            </div>
            <p v-if="!iframeValidation.valid" class="text-[10px] font-medium text-rose-400">
              {{ iframeValidation.reason }}
            </p>
            <div v-else class="flex items-center justify-between gap-1 text-[10px] opacity-75">
              <span class="truncate font-mono">Hash: {{ launchHash.slice(0, 44) }}...</span>
              <button
                type="button"
                class="shrink-0 font-semibold text-cyan-500 hover:underline"
                @click="copyValue('hash', launchHash, 'URL Hash Launch Params')"
              >
                {{ copiedKey === 'hash' ? 'Đã copy' : 'Copy Hash' }}
              </button>
            </div>
          </div>

          <!-- 1-click JS Dev Bridge Shim Card -->
          <div
            class="rounded-lg border p-2 text-[10px]"
            :class="state.theme === 'dark' ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-slate-50'"
          >
            <div class="flex items-center justify-between gap-1">
              <button
                type="button"
                class="inline-flex items-center gap-1 font-bold text-cyan-500"
                @click="showShimCard = !showShimCard"
              >
                <Terminal class="h-3 w-3" />
                Dev Bridge Shim JS {{ showShimCard ? '▾' : '▸' }}
              </button>
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded border border-cyan-500/40 bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-500 hover:bg-cyan-500/25"
                @click="copyValue('shim', buildDevBridgeShimSnippet(), 'Dev Bridge Shim JS')"
              >
                <Check v-if="copiedKey === 'shim'" class="h-2.5 w-2.5" />
                <Copy v-else class="h-2.5 w-2.5" />
                {{ copiedKey === 'shim' ? 'Đã copy' : 'Copy Shim' }}
              </button>
            </div>
            <p v-if="showShimCard" class="mt-1 leading-snug opacity-80">
              Dán vào <code class="font-mono">index.html</code> của Mini App đang chạy localhost để bắt <code class="font-mono">VbMABridge</code> &amp; <code class="font-mono">webkit.vbma</code> chuyển tiếp hai chiều qua <code class="font-mono">postMessage</code>.
            </p>
          </div>

          <iframe
            v-if="activeIframeSrc"
            ref="iframeRef"
            :src="activeIframeSrc"
            title="Mini App Localhost Preview"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            class="min-h-[240px] w-full flex-1 rounded-lg border bg-white"
            :class="state.theme === 'dark' ? 'border-slate-700' : 'border-slate-300'"
          />
          <div
            v-else
            class="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed p-4 text-center text-[11px] opacity-70"
            :class="state.theme === 'dark' ? 'border-slate-700' : 'border-slate-300'"
          >
            <Code2 class="mb-1.5 h-6 w-6 opacity-60" />
            Bấm <strong>Nạp</strong> để nhúng Mini App chạy local kèm tự động gắn Launch Params.
          </div>
        </div>

        <!-- OVERLAY 1: Android ChooseHotlineCallBottomSheet -->
        <div
          v-if="state.pendingHotlinePicker"
          class="absolute inset-0 z-20 flex flex-col justify-end bg-slate-950/65 backdrop-blur-[1px]"
        >
          <div
            class="space-y-2 rounded-t-2xl border-t p-3.5"
            :class="state.theme === 'dark' ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'"
          >
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold">ChooseHotlineCallBottomSheet</span>
              <span class="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400">Android</span>
            </div>
            <p class="text-[11px] opacity-75">
              Chọn hotline để quay tới <strong>{{ state.pendingHotlinePicker.phone }}</strong>:
            </p>
            <div class="space-y-1.5">
              <button
                v-for="hl in state.pendingHotlinePicker.availableHotlines"
                :key="hl"
                type="button"
                class="flex w-full items-center justify-between rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 font-mono text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20"
                @click="emit('resolveHotline', hl)"
              >
                <span>{{ hl }}</span>
                <PhoneCall class="h-3.5 w-3.5" />
              </button>
            </div>
            <button
              type="button"
              class="w-full rounded-lg border border-rose-500/40 bg-rose-500/10 py-1.5 text-[11px] font-semibold text-rose-400 hover:bg-rose-500/20"
              @click="emit('resolveHotline', null)"
            >
              Huỷ (Trả USER_CANCELLED)
            </button>
          </div>
        </div>

        <!-- OVERLAY 2: Child Mini App Sheet -->
        <div
          v-if="state.openedChildApp"
          class="absolute inset-0 z-20 flex flex-col justify-end bg-slate-950/60"
        >
          <div
            class="flex h-[78%] flex-col justify-between rounded-t-2xl border-t p-3.5"
            :class="state.theme === 'dark' ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'"
          >
            <div class="space-y-2">
              <div class="flex items-center justify-between border-b pb-2" :class="state.theme === 'dark' ? 'border-slate-800' : 'border-slate-200'">
                <div>
                  <div class="text-xs font-bold">App con: {{ state.openedChildApp.appName }}</div>
                  <div class="font-mono text-[10px] opacity-70">{{ state.openedChildApp.appId }}</div>
                </div>
                <span class="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[9px] font-bold text-cyan-400">Child Stack</span>
              </div>
              <div class="text-[10px] font-bold opacity-75">Dữ liệu nhận qua #vbma_extra_data:</div>
              <pre class="max-h-36 overflow-auto rounded-lg bg-slate-950 p-2 font-mono text-[10px] text-cyan-200">{{ JSON.stringify(state.openedChildApp.extraData, null, 2) }}</pre>
            </div>
            <button
              type="button"
              class="w-full rounded-lg bg-cyan-600 py-2 text-xs font-bold text-white hover:bg-cyan-500"
              @click="emit('sendCommand', 'close', { data: { status: 'success', updated: true } })"
            >
              Đóng App con &amp; đẩy mini_app_closed
            </button>
          </div>
        </div>

        <!-- OVERLAY 3: closingConfirmation Dialog -->
        <div
          v-if="state.closingModalOpen"
          class="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/70 p-4"
        >
          <div
            class="w-full space-y-2.5 rounded-xl border p-3.5 shadow-xl"
            :class="state.theme === 'dark' ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'"
          >
            <div class="flex items-center gap-1.5 text-xs font-bold text-amber-400">
              <AlertTriangle class="h-4 w-4" />
              Xác nhận đóng Mini App
            </div>
            <p class="text-[11px] opacity-80">
              Mini App đã bật <code class="font-mono">setup_closing_behavior(true)</code>. Bạn có chắc muốn đóng?
            </p>
            <div class="flex justify-end gap-2">
              <button
                type="button"
                class="rounded-lg border px-2.5 py-1 text-[11px] font-semibold"
                :class="state.theme === 'dark' ? 'border-slate-700 hover:bg-slate-800' : 'border-slate-300 hover:bg-slate-100'"
                @click="emit('resolveClosingModal', false)"
              >
                Ở lại
              </button>
              <button
                type="button"
                class="rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-500"
                @click="emit('resolveClosingModal', true)"
              >
                Đóng ngay
              </button>
            </div>
          </div>
        </div>

        <!-- Android Native Toast Pill -->
        <div
          v-if="state.activeToast"
          class="pointer-events-none absolute inset-x-4 bottom-3 z-20 rounded-full bg-slate-900/95 px-3 py-1.5 text-center text-[11px] font-medium text-white shadow-lg ring-1 ring-white/15"
        >
          [Android Toast] {{ state.activeToast.message }}
        </div>
      </div>
    </div>
  </div>
</template>
