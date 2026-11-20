// src/core/miniAppSandboxEngine.ts
import { MINI_APP_CATALOG } from '../data/miniAppBridgeCatalog';
import {
  createRoleStateFromPreset,
  evaluateActionGrant,
  MINI_APP_PERMISSION_PROFILES,
  type PermissionModuleCode,
  type RolePresetId,
  type SimulatedUserRoleState,
} from '../data/miniAppPermissionMatrix';

export type SandboxPlatform = 'ios' | 'android';

export type SandboxFaultId =
  | 'none'
  | 'token_401_refresh_ok'
  | 'token_401_refresh_fail'
  | 'rbac_denied'
  | 'android_hotline_picker'
  | 'autodial_busy'
  | 'contacts_limited_ios'
  | 'ios_toast_unsupported'
  | 'timeout_5000ms';

export interface SandboxFaultOption {
  id: SandboxFaultId;
  label: string;
  description: string;
  badge?: string;
}

export const SANDBOX_FAULT_OPTIONS: SandboxFaultOption[] = [
  {
    id: 'none',
    label: 'Bình thường (Happy Path)',
    description: 'Host xử lý bình thường theo logic thực tế trên iOS / Android.',
  },
  {
    id: 'token_401_refresh_ok',
    label: '401 → Refresh Token OK',
    description: 'Giả lập API hết hạn 401 nhưng Native refresh token thành công và cấp token mới.',
    badge: '401 OK',
  },
  {
    id: 'token_401_refresh_fail',
    label: '401 → Refresh Fail (Logout)',
    description: 'Refresh token thất bại — Android kích hoạt sessionLogoutTriggered = true (1 lần).',
    badge: '401 FAIL',
  },
  {
    id: 'rbac_denied',
    label: 'Bị chặn phân quyền (RBAC 403)',
    description: 'Host từ chối mọi kiểm tra quyền và các lệnh gọi/giám sát do thiếu Role.',
    badge: 'RBAC',
  },
  {
    id: 'android_hotline_picker',
    label: 'Android Chọn Hotline (Sheet)',
    description: 'make_call trên Android tạm dừng ở pending để hiện ChooseHotlineCallBottomSheet.',
    badge: 'Android',
  },
  {
    id: 'autodial_busy',
    label: 'Đang bận cuộc gọi (Autodial Busy)',
    description: 'Host báo đang có cuộc gọi active nên từ chối start_autodial (CALL_BUSY).',
    badge: 'SIP Busy',
  },
  {
    id: 'contacts_limited_ios',
    label: 'iOS 18+ Danh bạ Limited',
    description: 'user_contact_import_device trên iOS trả quyền limited (chỉ lấy contact user chọn).',
    badge: 'iOS 18+',
  },
  {
    id: 'ios_toast_unsupported',
    label: 'show_toast lỗi trên iOS',
    description: 'Nhấn mạnh hành vi iOS chưa hỗ trợ show_toast.',
    badge: 'Parity',
  },
  {
    id: 'timeout_5000ms',
    label: 'Bridge Timeout 5000ms',
    description: 'Giả lập Native treo không trả callback quá 5000ms để test error boundary JS.',
    badge: 'Timeout',
  },
];

export interface SandboxHostConfig {
  appId: string;
  platform: SandboxPlatform;
  rolePreset: RolePresetId;
  roleState: SimulatedUserRoleState;
  theme: 'dark' | 'light';
  fault: SandboxFaultId;
  apiBaseUrl: string;
  projectCode: string;
  userId: string;
  defaultHotline: string;
  extraData: Record<string, unknown>;
}

export interface PendingHotlinePickerState {
  requestId: string;
  phone: string;
  name?: string;
  availableHotlines: string[];
}

export interface SandboxActiveCallState {
  callId: string;
  phone: string;
  hotline: string;
  name?: string;
  state: 'ringing' | 'connected' | 'monitoring';
  modeLabel?: string;
}

export interface SandboxAutodialState {
  status: 'idle' | 'running' | 'paused' | 'stopped';
  autoDialId: number | null;
  campaignName: string;
  hotline: string;
  currentPhone: string;
  dialedCount: number;
  totalCount: number;
}

export interface SandboxHostState {
  isReady: boolean;
  isExpanded: boolean;
  closingConfirmation: boolean;
  closingModalOpen: boolean;
  theme: 'dark' | 'light';
  viewportHeight: number;
  sessionLogoutTriggered: boolean;
  tokenRefreshCount: number;
  currentAccessToken: string;
  activeCall: SandboxActiveCallState | null;
  autodial: SandboxAutodialState;
  monitor: {
    activeCallId: string | null;
    mode: number | null;
    modeName: string | null;
    isCapturing: boolean;
  };
  contacts: {
    localCount: number;
    devicePermission: 'granted' | 'limited' | 'denied';
    hasPromptedReadContacts: boolean;
    signatureHash: string;
  };
  pendingHotlinePicker: PendingHotlinePickerState | null;
  activeToast: { message: string; type: 'info' | 'success' | 'error'; timestamp: number } | null;
  openedChildApp: { appId: string; appName: string; extraData: Record<string, unknown> } | null;
  lastPushEvent: { eventName: string; payload: Record<string, unknown>; timestamp: number } | null;
  lastHaptic: string | null;
  closedCount: number;
  lastOpenedUrl: string | null;
}

export interface SandboxWireLogEntry {
  id: string;
  timestamp: string;
  direction: 'miniapp_to_host' | 'native_process' | 'host_to_miniapp' | 'system';
  channel: string;
  methodOrEvent: string;
  status: 'ok' | 'pending' | 'error' | 'warning';
  payload: Record<string, unknown>;
  note?: string;
}

export interface SandboxCommandResult {
  ok: boolean;
  status: 'ok' | 'pending' | 'error' | 'warning';
  method: string;
  requestId: string;
  responseEvent: string;
  responsePayload: Record<string, unknown>;
  nextState: SandboxHostState;
  wireFrames: SandboxWireLogEntry[];
  emittedPushEvents: Array<{ eventName: string; payload: Record<string, unknown> }>;
  parityAlertNote?: string;
  nativeIosTrace: { fn: string; detail: string; codeRef: string };
  nativeAndroidTrace: { fn: string; detail: string; codeRef: string };
}

export interface IframeUrlValidationResult {
  valid: boolean;
  normalizedUrl?: string;
  reason?: string;
}

export interface ParsedIframeMessage {
  method: string;
  payload: Record<string, unknown>;
  requestId?: string;
  isHostAction?: boolean;
}

let wireSeq = 0;
function nextWireId(prefix = 'wire'): string {
  wireSeq += 1;
  return `${prefix}-${Date.now()}-${wireSeq}`;
}

function nowTimeStr(): string {
  const d = new Date();
  return d.toTimeString().slice(0, 8);
}

function cloneState(state: SandboxHostState): SandboxHostState {
  return JSON.parse(JSON.stringify(state)) as SandboxHostState;
}

export function createDefaultHostConfig(appId = 'vb-ma-autodial'): SandboxHostConfig {
  return {
    appId,
    platform: 'ios',
    rolePreset: 'member_sales',
    roleState: createRoleStateFromPreset('member_sales'),
    theme: 'dark',
    fault: 'none',
    apiBaseUrl: 'https://api-dev.vbot.vn/v1',
    projectCode: 'vbot-demo',
    userId: 'u_9812',
    defaultHotline: '02499998888',
    extraData: { customerId: 'CUS-1042', source: 'sandbox' },
  };
}

export function createInitialHostState(config: SandboxHostConfig): SandboxHostState {
  return {
    isReady: false,
    isExpanded: false,
    closingConfirmation: false,
    closingModalOpen: false,
    theme: config.theme,
    viewportHeight: 620,
    sessionLogoutTriggered: false,
    tokenRefreshCount: 0,
    currentAccessToken: `vbt_ma_${config.projectCode}_initial`,
    activeCall: null,
    autodial: {
      status: 'idle',
      autoDialId: null,
      campaignName: '',
      hotline: config.defaultHotline,
      currentPhone: '',
      dialedCount: 0,
      totalCount: 12,
    },
    monitor: {
      activeCallId: null,
      mode: null,
      modeName: null,
      isCapturing: false,
    },
    contacts: {
      localCount: 18,
      devicePermission: config.fault === 'contacts_limited_ios' ? 'limited' : 'granted',
      hasPromptedReadContacts: false,
      signatureHash: 'sig_91ab2c',
    },
    pendingHotlinePicker: null,
    activeToast: null,
    openedChildApp: null,
    lastPushEvent: null,
    lastHaptic: null,
    closedCount: 0,
    lastOpenedUrl: null,
  };
}

export function buildLaunchParamsObject(config: SandboxHostConfig): Record<string, unknown> {
  const omitThemeOnAndroidHistory =
    config.platform === 'android' && config.appId === 'vb-ma-user-history-call';

  const result: Record<string, unknown> = {
    vbma_data: {
      user_id: config.userId,
      project_code: config.projectCode,
      app_id: config.appId,
      platform: config.platform,
      is_admin: config.roleState.isAdmin,
      language: 'vi',
    },
    vbma_api_base_url: config.apiBaseUrl,
  };

  if (!omitThemeOnAndroidHistory) {
    result.vbma_theme = {
      theme: config.theme,
      theme_params:
        config.theme === 'dark'
          ? { bg_color: '#0f172a', text_color: '#f8fafc', hint_color: '#94a3b8', button_color: '#06b6d4' }
          : { bg_color: '#ffffff', text_color: '#0f172a', hint_color: '#64748b', button_color: '#0284c7' },
    };
  }

  if (Object.keys(config.extraData).length > 0) {
    result.vbma_extra_data = config.extraData;
  }

  return result;
}

export function buildLaunchHashString(config: SandboxHostConfig): string {
  const params = buildLaunchParamsObject(config);
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    search.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  }
  return `#${search.toString()}`;
}

export function validateIframeDevUrl(rawUrl: string): IframeUrlValidationResult {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { valid: false, reason: 'Vui lòng nhập URL Dev Server (ví dụ: http://localhost:5173).' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, reason: 'URL không đúng cú pháp chuẩn (thiếu scheme http:// hoặc https://).' };
  }

  if (parsed.protocol === 'https:') {
    if (!parsed.hostname) {
      return { valid: false, reason: 'Hostname HTTPS không hợp lệ.' };
    }
    return { valid: true, normalizedUrl: parsed.toString() };
  }

  if (parsed.protocol === 'http:') {
    const host = parsed.hostname.toLowerCase();
    const isLocalHost =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '[::1]' ||
      host === '::1' ||
      host.endsWith('.local');

    if (!isLocalHost) {
      return {
        valid: false,
        reason: 'HTTP không mã hoá chỉ được phép cho localhost / 127.0.0.1 / *.local. Production vui lòng dùng HTTPS.',
      };
    }
    return { valid: true, normalizedUrl: parsed.toString() };
  }

  return {
    valid: false,
    reason: `Scheme "${parsed.protocol}" không được phép. Chỉ chấp nhận http://localhost hoặc https://.`,
  };
}

export function buildDevBridgeShimSnippet(): string {
  return [
    `<script>`,
    `  // VBot Dev Studio Bridge Shim — Dán vào index.html lúc dev localhost`,
    `  (function () {`,
    `    if (window.parent === window) return;`,
    `    const postToStudio = (method, rawPayload) => {`,
    `      let payload = rawPayload;`,
    `      if (typeof rawPayload === 'string') {`,
    `        try { payload = JSON.parse(rawPayload); } catch (_) { payload = { raw: rawPayload }; }`,
    `      }`,
    `      window.parent.postMessage({ source: 'vbot-miniapp-shim', method, payload }, '*');`,
    `    };`,
    `    window.VbMABridge = { post: postToStudio };`,
    `    window.webkit = window.webkit || {};`,
    `    window.webkit.messageHandlers = window.webkit.messageHandlers || {};`,
    `    window.webkit.messageHandlers.vbma = {`,
    `      postMessage(msg) {`,
    `        const method = msg?.eventType || msg?.method || 'unknown';`,
    `        postToStudio(method, msg?.eventData ?? msg?.payload ?? msg ?? {});`,
    `      }`,
    `    };`,
    `    window.addEventListener('message', (event) => {`,
    `      if (event.data?.source === 'vbot-studio-host' && event.data?.eventName) {`,
    `        window.VbMA?.receive?.(event.data.eventName, event.data.payload);`,
    `        window.VBot?.WebView?.receiveEvent?.(event.data.eventName, event.data.payload);`,
    `      }`,
    `    });`,
    `  })();`,
    `</script>`,
  ].join('\n');
}

export function parseIncomingIframeMessage(data: unknown): ParsedIframeMessage | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;

  if (record.source === 'vbot-miniapp-shim' && typeof record.method === 'string') {
    let payload: Record<string, unknown> = {};
    if (record.payload && typeof record.payload === 'object') {
      payload = record.payload as Record<string, unknown>;
    }
    if (record.method === 'request_host_action' && typeof payload.action === 'string') {
      return {
        method: payload.action,
        payload:
          payload.payload && typeof payload.payload === 'object'
            ? (payload.payload as Record<string, unknown>)
            : {},
        requestId: typeof payload.request_id === 'string' ? payload.request_id : undefined,
        isHostAction: true,
      };
    }
    return {
      method: record.method,
      payload,
      requestId: typeof payload.request_id === 'string' ? payload.request_id : undefined,
      isHostAction: false,
    };
  }

  if (typeof record.eventType === 'string') {
    const evData =
      record.eventData && typeof record.eventData === 'object'
        ? (record.eventData as Record<string, unknown>)
        : {};
    if (record.eventType === 'request_host_action' && typeof evData.action === 'string') {
      return {
        method: evData.action,
        payload:
          evData.payload && typeof evData.payload === 'object'
            ? (evData.payload as Record<string, unknown>)
            : {},
        requestId: typeof evData.request_id === 'string' ? evData.request_id : undefined,
        isHostAction: true,
      };
    }
    return {
      method: record.eventType,
      payload: evData,
      isHostAction: false,
    };
  }

  return null;
}

const HOST_ACTION_METHODS = new Set([
  'get_supported_actions',
  'get_session_info',
  'make_call',
  'start_autodial',
  'pause_autodial',
  'resume_autodial',
  'stop_autodial',
  'get_autodial_state',
  'monitor_call',
  'user_contact_get_local',
  'user_contact_refresh_server',
  'user_contact_import_device',
  'user_contact_delete_local',
  'user_contact_open_settings',
]);

function makeChannelLabel(platform: SandboxPlatform, method: string): string {
  const hostAction = HOST_ACTION_METHODS.has(method);
  const postName = hostAction ? 'request_host_action' : method;
  return platform === 'ios'
    ? `webkit.messageHandlers.vbma.postMessage("${postName}")`
    : `VbMABridge.post("${postName}", json)`;
}

function buildTraces(method: string) {
  const hostAction = HOST_ACTION_METHODS.has(method);
  if (hostAction) {
    return {
      ios: {
        fn: `VbMaViewController.handleRequestHostAction("${method}")`,
        detail: `Swift Delegate xác nhận supportedHostActions.contains("${method}") và điều hướng về VBot Host Service.`,
        codeRef: 'VBot/Service/MiniAppService.swift',
      },
      android: {
        fn: `MiniAppHelper.dispatchHostAction("${method}")`,
        detail: `Kotlin @JavascriptInterface parse JSONObject và gọi handler tương ứng trên Main/IO dispatcher.`,
        codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/MiniAppHelper.kt',
      },
    };
  }
  return {
    ios: {
      fn: `VbMaViewController.handleCoreBridge("${method}")`,
      detail: `Xử lý sự kiện Core SDK trong VbMaSDK và đẩy phản hồi lại WebView qua evaluateJavaScript.`,
      codeRef: 'vb-ma-ios-sdk/VbMaSDK/UI/VbMaViewController.swift',
    },
    android: {
      fn: `VbMABridge.post("${method}", paramsStr)`,
      detail: `VbMABridge xử lý Core SDK method và trả callback qua webView.evaluateJavascript.`,
      codeRef: 'vb-ma-android-sdk/vbotma-sdk/src/main/java/com/vbot/miniapp/sdk/VbMABridge.kt',
    },
  };
}

export function executeHostCommand(
  method: string,
  rawPayload: Record<string, unknown>,
  config: SandboxHostConfig,
  state: SandboxHostState,
): SandboxCommandResult {
  const payload = rawPayload ?? {};
  const requestId =
    typeof payload.request_id === 'string' && payload.request_id.trim()
      ? payload.request_id.trim()
      : `req-${Date.now().toString(36)}`;
  const nextState = cloneState(state);
  const channel = makeChannelLabel(config.platform, method);
  const traces = buildTraces(method);
  const wireFrames: SandboxWireLogEntry[] = [
    {
      id: nextWireId('tx'),
      timestamp: nowTimeStr(),
      direction: 'miniapp_to_host',
      channel,
      methodOrEvent: method,
      status: 'ok',
      payload: HOST_ACTION_METHODS.has(method)
        ? { request_id: requestId, action: method, payload }
        : payload,
    },
  ];

  const emittedPushEvents: Array<{ eventName: string; payload: Record<string, unknown> }> = [];
  let parityAlertNote: string | undefined;

  const finalize = (
    ok: boolean,
    status: 'ok' | 'pending' | 'error' | 'warning',
    responseEvent: string,
    responsePayload: Record<string, unknown>,
    nativeNote?: string,
  ): SandboxCommandResult => {
    wireFrames.push({
      id: nextWireId('native'),
      timestamp: nowTimeStr(),
      direction: 'native_process',
      channel: config.platform === 'ios' ? 'Swift Native Host' : 'Kotlin Native Host',
      methodOrEvent: method,
      status,
      payload: { platform: config.platform, fault: config.fault, appId: config.appId },
      note: nativeNote ?? (config.platform === 'ios' ? traces.ios.fn : traces.android.fn),
    });

    wireFrames.push({
      id: nextWireId('rx'),
      timestamp: nowTimeStr(),
      direction: 'host_to_miniapp',
      channel: `VbMA.receive("${responseEvent}", payload)`,
      methodOrEvent: responseEvent,
      status,
      payload: responsePayload,
    });

    for (const pushed of emittedPushEvents) {
      wireFrames.push({
        id: nextWireId('push'),
        timestamp: nowTimeStr(),
        direction: 'host_to_miniapp',
        channel: `Host Push → onEvent("${pushed.eventName}")`,
        methodOrEvent: pushed.eventName,
        status: 'ok',
        payload: pushed.payload,
      });
      nextState.lastPushEvent = {
        eventName: pushed.eventName,
        payload: pushed.payload,
        timestamp: Date.now(),
      };
    }

    return {
      ok,
      status,
      method,
      requestId,
      responseEvent,
      responsePayload,
      nextState,
      wireFrames,
      emittedPushEvents,
      parityAlertNote,
      nativeIosTrace: traces.ios,
      nativeAndroidTrace: traces.android,
    };
  };

  // Timeout fault simulation on async commands
  const asyncMethods = new Set([
    'request_mini_app_token',
    'request_module_token',
    'host_fetch',
    'make_call',
    'start_autodial',
    'monitor_call',
    'user_contact_refresh_server',
    'user_contact_import_device',
  ]);
  if (config.fault === 'timeout_5000ms' && asyncMethods.has(method)) {
    return finalize(
      false,
      'error',
      HOST_ACTION_METHODS.has(method) ? 'host_action_result' : `${method}_error`,
      {
        request_id: requestId,
        success: false,
        error_code: 'BRIDGE_TIMEOUT_5000MS',
        message: 'Host Native không phản hồi sau 5000ms (mô phỏng Timeout — JS cần fallback).',
      },
      'Simulated 5000ms bridge hang',
    );
  }

  switch (method) {
    case 'ready': {
      nextState.isReady = true;
      return finalize(
        true,
        'ok',
        'ready_ack',
        {
          success: true,
          ready: true,
          platform: config.platform,
          flushed_queued_events: config.platform === 'ios' ? 1 : 0,
        },
        config.platform === 'ios'
          ? 'iOS xả queuedHostEvents ngay sau ready()'
          : 'Android đánh dấu WebView ready',
      );
    }

    case 'expand': {
      nextState.isExpanded = true;
      nextState.viewportHeight = 760;
      return finalize(true, 'ok', 'viewport_changed', {
        success: true,
        is_expanded: true,
        viewport_height: 760,
      });
    }

    case 'setup_closing_behavior': {
      const needConfirm = Boolean(payload.need_confirm ?? payload.is_confirmation_enabled ?? true);
      nextState.closingConfirmation = needConfirm;
      return finalize(true, 'ok', 'closing_behavior_updated', {
        success: true,
        closingConfirmation: needConfirm,
      });
    }

    case 'close': {
      const force = Boolean(payload.force);
      if (state.closingConfirmation && !force) {
        nextState.closingModalOpen = true;
        return finalize(
          true,
          'pending',
          'close_confirmation_pending',
          {
            success: false,
            pending_confirmation: true,
            message: 'closingConfirmation=true — Host mở dialog hỏi xác nhận người dùng trước khi đóng.',
          },
          'Hiển thị modal xác nhận đóng Mini App',
        );
      }
      nextState.closingModalOpen = false;
      nextState.closedCount += 1;
      const hadChild = state.openedChildApp;
      nextState.openedChildApp = null;
      if (hadChild) {
        emittedPushEvents.push({
          eventName: 'mini_app_closed',
          payload: {
            app_id: hadChild.appId,
            data: (payload.data as Record<string, unknown>) ?? { status: 'success', updated: true },
          },
        });
      }
      return finalize(true, 'ok', 'mini_app_close_ack', {
        success: true,
        closed: true,
        closed_count: nextState.closedCount,
        return_data: payload.data ?? null,
      });
    }

    case 'open_link':
    case 'open_vb_link': {
      const rawUrl = typeof payload.url === 'string' ? payload.url.trim() : '';
      if (!rawUrl || (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://'))) {
        return finalize(false, 'error', `${method}_result`, {
          success: false,
          error_code: 'INVALID_URL',
          message: 'URL phải bắt đầu bằng http:// hoặc https://',
        });
      }
      nextState.lastOpenedUrl = rawUrl;
      return finalize(true, 'ok', `${method}_result`, {
        success: true,
        url: rawUrl,
        mode: method === 'open_vb_link' ? 'in_app_webview' : 'external_browser',
      });
    }

    case 'open_mini_app': {
      const targetId = typeof payload.app_id === 'string' ? payload.app_id.trim() : '';
      if (!targetId) {
        return finalize(false, 'error', 'open_mini_app_result', {
          success: false,
          error_code: 'MISSING_APP_ID',
          message: 'Thiếu trường app_id khi gọi open_mini_app',
        });
      }
      const catalogApp = MINI_APP_CATALOG.find((a) => a.id === targetId);
      const extraData =
        payload.extra_data && typeof payload.extra_data === 'object'
          ? (payload.extra_data as Record<string, unknown>)
          : {};
      nextState.openedChildApp = {
        appId: targetId,
        appName: catalogApp?.nameVi ?? targetId,
        extraData,
      };
      return finalize(true, 'ok', 'open_mini_app_result', {
        success: true,
        opened_app_id: targetId,
        extra_data: extraData,
      });
    }

    case 'trigger_haptic': {
      const style = typeof payload.style === 'string' ? payload.style : 'impact_medium';
      nextState.lastHaptic = style;
      return finalize(true, 'ok', 'haptic_ack', { success: true, style });
    }

    case 'show_toast': {
      const msg = typeof payload.message === 'string' ? payload.message.trim() : '';
      if (!msg) {
        return finalize(false, 'error', 'show_toast_result', {
          success: false,
          error_code: 'MISSING_MESSAGE',
          message: 'Thiếu trường message khi gọi show_toast',
        });
      }
      if (config.platform === 'ios' || config.fault === 'ios_toast_unsupported') {
        parityAlertNote =
          'Host iOS chưa hỗ trợ show_toast! Mini App cần tự kiểm tra platform hoặc dùng web Toast fallback.';
        return finalize(
          false,
          'warning',
          'show_toast_result',
          {
            success: false,
            error_code: 'UNSUPPORTED_ON_IOS',
            platform: config.platform,
            message: 'Host iOS hiện không xử lý show_toast — chỉ Android có HandleShowToast().',
          },
          'Parity mismatch: UNSUPPORTED_ON_IOS',
        );
      }
      const toastType =
        payload.type === 'error' || payload.type === 'success' ? payload.type : 'info';
      nextState.activeToast = { message: msg, type: toastType, timestamp: Date.now() };
      return finalize(true, 'ok', 'show_toast_result', {
        success: true,
        platform: 'android',
        message: msg,
        type: toastType,
      });
    }

    case 'request_theme': {
      const omitAndroidHistory =
        config.platform === 'android' && config.appId === 'vb-ma-user-history-call';
      if (omitAndroidHistory) {
        parityAlertNote =
          'Lưu ý Parity: Android CallHistoryFragment chưa truyền theme_params ở màn Lịch sử cuộc gọi.';
      }
      return finalize(true, 'ok', 'theme_response', {
        theme: nextState.theme,
        theme_params:
          omitAndroidHistory
            ? null
            : nextState.theme === 'dark'
              ? { bg_color: '#0f172a', text_color: '#f8fafc', button_color: '#06b6d4' }
              : { bg_color: '#ffffff', text_color: '#0f172a', button_color: '#0284c7' },
      });
    }

    case 'request_viewport': {
      return finalize(true, 'ok', 'viewport_response', {
        width: 390,
        height: nextState.viewportHeight,
        is_expanded: nextState.isExpanded,
      });
    }

    case 'request_mini_app_token':
    case 'request_module_token': {
      const mod = typeof payload.module === 'string' && payload.module.trim() ? payload.module.trim() : 'vbot';
      const force = Boolean(payload.force);
      if (method === 'request_module_token' && !mod) {
        return finalize(false, 'error', 'module_token_result', {
          success: false,
          error_code: 'INVALID_MODULE',
          message: 'Thiếu tên module',
        });
      }
      if (config.fault === 'token_401_refresh_fail') {
        nextState.tokenRefreshCount += 1;
        const androidLogout = config.platform === 'android';
        if (androidLogout) {
          nextState.sessionLogoutTriggered = true;
        }
        parityAlertNote = androidLogout
          ? 'Android gọi logout VbMaSDK & xoá credentials 1 lần khi 401 refresh fail.'
          : 'iOS báo lỗi 401 token thất bại và đóng phiên module an toàn.';
        return finalize(false, 'error', `${method}_result`, {
          success: false,
          module: mod,
          error_code: 'REFRESH_TOKEN_FAILED',
          session_logout_triggered: androidLogout,
          message: 'Refresh token thất bại (401) — không thể cấp token mới.',
        });
      }
      if (force || config.fault === 'token_401_refresh_ok') {
        nextState.tokenRefreshCount += 1;
        nextState.currentAccessToken = `vbt_${mod}_refreshed_${nextState.tokenRefreshCount}`;
      }
      return finalize(true, 'ok', `${method}_result`, {
        success: true,
        module: mod,
        token: nextState.currentAccessToken,
        refreshed: force || config.fault === 'token_401_refresh_ok',
        refresh_count: nextState.tokenRefreshCount,
      });
    }

    case 'host_fetch': {
      const targetUrl = typeof payload.url === 'string' ? payload.url.trim() : '';
      if (!targetUrl || (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://') && !targetUrl.startsWith('/'))) {
        return finalize(false, 'error', 'host_fetch_result', {
          success: false,
          error_code: 'INVALID_FETCH_URL',
          message: 'URL proxy không hợp lệ',
        });
      }
      const reqHeaders =
        payload.headers && typeof payload.headers === 'object'
          ? { ...(payload.headers as Record<string, unknown>) }
          : {};
      const hadSpoofedAuth = 'Authorization' in reqHeaders || 'authorization' in reqHeaders;
      delete reqHeaders.Authorization;
      delete reqHeaders.authorization;

      if (config.fault === 'token_401_refresh_fail') {
        if (config.platform === 'android') {
          nextState.sessionLogoutTriggered = true;
        }
        return finalize(false, 'error', 'host_fetch_result', {
          success: false,
          status: 401,
          error_code: 'UNAUTHORIZED_LOGOUT',
          session_logout_triggered: nextState.sessionLogoutTriggered,
          stripped_js_authorization: hadSpoofedAuth,
        });
      }

      if (config.fault === 'token_401_refresh_ok') {
        nextState.tokenRefreshCount += 1;
        nextState.currentAccessToken = `vbt_proxy_refreshed_${nextState.tokenRefreshCount}`;
      }

      return finalize(
        true,
        hadSpoofedAuth ? 'warning' : 'ok',
        'host_fetch_result',
        {
          success: true,
          status: 200,
          url: targetUrl,
          stripped_js_authorization: hadSpoofedAuth,
          injected_native_bearer: true,
          note: hadSpoofedAuth
            ? 'Native đã gỡ bỏ header Authorization truyền từ JS và tự gắn Bearer token an toàn.'
            : 'Host Native proxy request thành công.',
          data: {
            items: [{ id: 'CUS-1042', name: 'Nguyễn Văn A', phone: '0901234567' }],
            refreshed_on_retry: config.fault === 'token_401_refresh_ok',
          },
        },
        hadSpoofedAuth ? 'Đã chặn & ghi đè Authorization spoofed từ JS' : undefined,
      );
    }

    case 'check_permissions': {
      const modRaw = typeof payload.module === 'string' ? payload.module.trim() : 'KHACH_HANG';
      const modCode = modRaw as PermissionModuleCode;
      const rawActions = Array.isArray(payload.actions)
        ? payload.actions.map((a) => String(a))
        : typeof payload.action === 'string'
          ? [payload.action]
          : ['XEM'];
      if (!modRaw || rawActions.length === 0) {
        return finalize(false, 'error', 'check_permissions_result', {
          success: false,
          error_code: 'INVALID_PERMISSION_QUERY',
          message: 'Cần truyền module và danh sách actions không rỗng.',
        });
      }

      const profile = MINI_APP_PERMISSION_PROFILES[config.appId];
      const grantedMap: Record<string, boolean> = {};
      const details: Array<{ action: string; granted: boolean; reason: string }> = [];

      for (const act of rawActions) {
        if (config.fault === 'rbac_denied') {
          grantedMap[act] = false;
          details.push({ action: act, granted: false, reason: 'Mô phỏng Fault rbac_denied' });
          continue;
        }
        if (profile) {
          const evalRes = evaluateActionGrant(profile, modCode, act, config.roleState);
          grantedMap[act] = evalRes.finalGranted;
          const reason = evalRes.finalGranted
            ? evalRes.wildcard
              ? 'Được cấp qua Wildcard manifest'
              : 'Cấp quyền đầy đủ (Manifest ∩ Role)'
            : !evalRes.manifestGranted
              ? 'Chưa khai báo trong manifest.json'
              : 'User Role chưa có quyền này';
          details.push({
            action: act,
            granted: evalRes.finalGranted,
            reason,
          });
        } else {
          const fallbackGranted = config.roleState.isAdmin || Boolean(config.roleState.modules[modCode]);
          grantedMap[act] = fallbackGranted;
          details.push({
            action: act,
            granted: fallbackGranted,
            reason: fallbackGranted ? 'Cấp quyền theo Role' : 'Thiếu quyền module',
          });
        }
      }

      return finalize(true, 'ok', 'check_permissions_result', {
        success: true,
        app_id: config.appId,
        module: modRaw,
        isAdmin: config.fault === 'rbac_denied' ? false : config.roleState.isAdmin,
        granted: grantedMap,
        details,
      });
    }

    case 'get_supported_actions': {
      return finalize(true, 'ok', 'host_action_result', {
        request_id: requestId,
        action: 'get_supported_actions',
        success: true,
        actions: Array.from(HOST_ACTION_METHODS),
      });
    }

    case 'get_session_info': {
      return finalize(true, 'ok', 'host_action_result', {
        request_id: requestId,
        action: 'get_session_info',
        success: true,
        user_id: config.userId,
        project_code: config.projectCode,
        is_admin: config.roleState.isAdmin,
        role_preset: config.rolePreset,
        platform: config.platform,
        active_call: nextState.activeCall,
        autodial: nextState.autodial,
      });
    }

    case 'make_call': {
      const phone = typeof payload.phone === 'string' ? payload.phone.trim() : '';
      const hotline = typeof payload.hotline === 'string' ? payload.hotline.trim() : '';
      const callerName = typeof payload.name === 'string' ? payload.name.trim() : undefined;

      if (!phone) {
        return finalize(false, 'error', 'host_action_result', {
          request_id: requestId,
          action: 'make_call',
          success: false,
          error_code: 'INVALID_PHONE',
          message: 'Thiếu số điện thoại (phone) khi gọi make_call.',
        });
      }

      if (config.fault === 'rbac_denied') {
        return finalize(false, 'error', 'host_action_result', {
          request_id: requestId,
          action: 'make_call',
          success: false,
          error_code: 'PERMISSION_DENIED',
          message: 'Vai trò hiện tại không được phép thực hiện cuộc gọi ra.',
        });
      }

      if (config.platform === 'android' && (!hotline || config.fault === 'android_hotline_picker')) {
        nextState.pendingHotlinePicker = {
          requestId,
          phone,
          name: callerName,
          availableHotlines: [config.defaultHotline, '02873009999', '1900636363'],
        };
        parityAlertNote =
          'Android mở ChooseHotlineCallBottomSheet khi thiếu hotline — nếu user đóng sheet sẽ trả về { success: false, reason: "USER_CANCELLED" }.';
        return finalize(
          true,
          'pending',
          'host_action_pending',
          {
            request_id: requestId,
            action: 'make_call',
            status: 'pending_picker',
            phone,
            message: 'Đang chờ người dùng chọn Hotline trên ChooseHotlineCallBottomSheet Android',
          },
          'Pending user selection on Android BottomSheet',
        );
      }

      const chosenHotline = hotline || config.defaultHotline;
      const callId = `call_${Date.now().toString(36)}`;
      nextState.activeCall = {
        callId,
        phone,
        hotline: chosenHotline,
        name: callerName,
        state: 'ringing',
      };
      return finalize(true, 'ok', 'host_action_result', {
        request_id: requestId,
        action: 'make_call',
        success: true,
        call_id: callId,
        phone,
        hotline: chosenHotline,
        state: 'ringing',
      });
    }

    case 'start_autodial': {
      const autoDialId = Number(payload.autoDialId ?? 0);
      const hotline = typeof payload.hotline === 'string' ? payload.hotline.trim() : '';
      const campaignName =
        typeof payload.campaignName === 'string' && payload.campaignName.trim()
          ? payload.campaignName.trim()
          : `Chiến dịch #${autoDialId || 'N/A'}`;

      if (!Number.isFinite(autoDialId) || autoDialId <= 0 || !hotline) {
        return finalize(false, 'error', 'host_action_result', {
          request_id: requestId,
          action: 'start_autodial',
          success: false,
          error_code: 'INVALID_PARAMS',
          message: 'autoDialId phải > 0 và hotline không được để trống.',
        });
      }

      if (config.fault === 'autodial_busy' || state.activeCall) {
        return finalize(false, 'error', 'host_action_result', {
          request_id: requestId,
          action: 'start_autodial',
          success: false,
          error_code: 'CALL_BUSY',
          message: 'Host đang bận cuộc gọi active — AutodialManager từ chối start_autodial.',
        });
      }

      nextState.autodial = {
        status: 'running',
        autoDialId,
        campaignName,
        hotline,
        currentPhone: '0901234567',
        dialedCount: 1,
        totalCount: 12,
      };
      nextState.activeCall = {
        callId: `call_ad_${autoDialId}`,
        phone: '0901234567',
        hotline,
        name: campaignName,
        state: 'connected',
      };
      return finalize(true, 'ok', 'host_action_result', {
        request_id: requestId,
        action: 'start_autodial',
        success: true,
        state: 'running',
        autoDialId,
        hotline,
        campaignName,
      });
    }

    case 'pause_autodial': {
      if (state.autodial.status !== 'running') {
        return finalize(false, 'error', 'host_action_result', {
          request_id: requestId,
          action: 'pause_autodial',
          success: false,
          error_code: 'INVALID_STATE',
          message: `Không thể pause khi Autodial đang ở trạng thái "${state.autodial.status}".`,
        });
      }
      nextState.autodial.status = 'paused';
      return finalize(true, 'ok', 'host_action_result', {
        request_id: requestId,
        action: 'pause_autodial',
        success: true,
        state: 'paused',
        autoDialId: nextState.autodial.autoDialId,
      });
    }

    case 'resume_autodial': {
      if (state.autodial.status !== 'paused') {
        return finalize(false, 'error', 'host_action_result', {
          request_id: requestId,
          action: 'resume_autodial',
          success: false,
          error_code: 'INVALID_STATE',
          message: `Không thể resume khi Autodial đang ở trạng thái "${state.autodial.status}".`,
        });
      }
      nextState.autodial.status = 'running';
      nextState.autodial.dialedCount += 1;
      return finalize(true, 'ok', 'host_action_result', {
        request_id: requestId,
        action: 'resume_autodial',
        success: true,
        state: 'running',
        autoDialId: nextState.autodial.autoDialId,
      });
    }

    case 'stop_autodial': {
      const prevId = state.autodial.autoDialId ?? 151;
      const dialed = state.autodial.dialedCount;
      nextState.autodial.status = 'stopped';
      if (nextState.activeCall?.callId.startsWith('call_ad_')) {
        nextState.activeCall = null;
      }
      emittedPushEvents.push({
        eventName: 'autodial_finished',
        payload: {
          autoDialId: prevId,
          reason: 'stopped_by_user',
          dialed_count: dialed,
        },
      });
      return finalize(true, 'ok', 'host_action_result', {
        request_id: requestId,
        action: 'stop_autodial',
        success: true,
        state: 'stopped',
        autoDialId: prevId,
      });
    }

    case 'get_autodial_state': {
      return finalize(true, 'ok', 'host_action_result', {
        request_id: requestId,
        action: 'get_autodial_state',
        success: true,
        ...nextState.autodial,
        state: nextState.autodial.status,
      });
    }

    case 'monitor_call': {
      const callId = typeof payload.call_id === 'string' ? payload.call_id.trim() : '';
      const mode = Number(payload.mode ?? 0);
      const modeLabels: Record<number, string> = {
        1: 'listen',
        2: 'capture',
        4: 'capture_bot',
        5: 'whisper',
      };
      const modeName = modeLabels[mode];
      if (!callId || !modeName) {
        return finalize(false, 'error', 'host_action_result', {
          request_id: requestId,
          action: 'monitor_call',
          success: false,
          error_code: 'INVALID_MONITOR_PARAMS',
          message: 'Cần truyền call_id hợp lệ và mode thuộc {1, 2, 4, 5}.',
        });
      }

      const canMonitor =
        config.fault !== 'rbac_denied' &&
        (config.roleState.isAdmin || Boolean(config.roleState.actions['CUOC_GOI-DANG_DIEN_RA']));
      if (!canMonitor) {
        return finalize(false, 'error', 'host_action_result', {
          request_id: requestId,
          action: 'monitor_call',
          success: false,
          error_code: 'PERMISSION_DENIED',
          message: 'Thiếu quyền CUOC_GOI-DANG_DIEN_RA để giám sát cuộc gọi.',
        });
      }

      nextState.monitor = {
        activeCallId: callId,
        mode,
        modeName,
        isCapturing: mode === 2 || mode === 4,
      };
      nextState.activeCall = {
        callId,
        phone: '0909888777',
        hotline: config.defaultHotline,
        name: `Giám sát (${modeName})`,
        state: 'monitoring',
        modeLabel: `${mode} · ${modeName}`,
      };

      if (config.platform === 'ios') {
        emittedPushEvents.push({
          eventName: 'monitor_call_state_changed',
          payload: {
            call_id: callId,
            mode,
            mode_name: modeName,
            state: 'monitoring',
          },
        });
      } else {
        parityAlertNote =
          'Lưu ý Parity: Android hiện KHÔNG phát event monitor_call_state_changed xuống JS — chỉ hiển thị PiP Overlay Native.';
      }

      return finalize(true, 'ok', 'host_action_result', {
        request_id: requestId,
        action: 'monitor_call',
        success: true,
        call_id: callId,
        mode,
        mode_name: modeName,
      });
    }

    case 'user_contact_get_local': {
      const limit = payload.limit !== undefined ? Number(payload.limit) : 20;
      if (!Number.isFinite(limit) || limit <= 0) {
        return finalize(false, 'error', 'host_action_result', {
          request_id: requestId,
          action: 'user_contact_get_local',
          success: false,
          error_code: 'INVALID_LIMIT',
          message: 'limit phải là số nguyên dương.',
        });
      }
      const perm =
        config.platform === 'ios' && config.fault === 'contacts_limited_ios'
          ? 'limited'
          : nextState.contacts.devicePermission;
      return finalize(true, 'ok', 'host_action_result', {
        request_id: requestId,
        action: 'user_contact_get_local',
        success: true,
        total: nextState.contacts.localCount,
        permission_status: perm,
        contacts:
          nextState.contacts.localCount === 0
            ? []
            : [
                { id: 'c_01', name: 'Trần Minh Tâm', phone: '0912345678' },
                { id: 'c_02', name: 'Lê Thu Hà', phone: '0987654321' },
              ],
      });
    }

    case 'user_contact_refresh_server': {
      nextState.contacts.localCount += 3;
      nextState.contacts.signatureHash = `sig_${Date.now().toString(36)}`;
      emittedPushEvents.push({
        eventName: 'user_contacts_updated',
        payload: {
          source: 'server_refresh',
          total: nextState.contacts.localCount,
        },
      });
      return finalize(true, 'ok', 'host_action_result', {
        request_id: requestId,
        action: 'user_contact_refresh_server',
        success: true,
        total: nextState.contacts.localCount,
        signature_hash: nextState.contacts.signatureHash,
      });
    }

    case 'user_contact_import_device': {
      if (config.platform === 'ios' && config.fault === 'contacts_limited_ios') {
        nextState.contacts.devicePermission = 'limited';
        nextState.contacts.localCount += 2;
        parityAlertNote =
          'iOS 18+ trả trạng thái CNAuthorizationStatus.limited: Mini App nên nhắc user mở Cài đặt nếu muốn cấp full danh bạ.';
        return finalize(true, 'warning', 'host_action_result', {
          request_id: requestId,
          action: 'user_contact_import_device',
          success: true,
          imported: 2,
          permission_status: 'limited',
        });
      }
      if (config.platform === 'android') {
        nextState.contacts.hasPromptedReadContacts = true;
      }
      nextState.contacts.devicePermission = 'granted';
      nextState.contacts.localCount += 5;
      emittedPushEvents.push({
        eventName: 'user_contacts_updated',
        payload: { source: 'device_import', total: nextState.contacts.localCount },
      });
      return finalize(true, 'ok', 'host_action_result', {
        request_id: requestId,
        action: 'user_contact_import_device',
        success: true,
        imported: 5,
        permission_status: 'granted',
        total: nextState.contacts.localCount,
      });
    }

    case 'user_contact_delete_local': {
      const deleteAll = Boolean(payload.delete_all);
      const contactId = typeof payload.contact_id === 'string' ? payload.contact_id.trim() : '';
      if (!deleteAll && !contactId) {
        return finalize(false, 'error', 'host_action_result', {
          request_id: requestId,
          action: 'user_contact_delete_local',
          success: false,
          error_code: 'MISSING_TARGET',
          message: 'Cần truyền contact_id hoặc delete_all: true.',
        });
      }
      nextState.contacts.localCount = deleteAll
        ? 0
        : Math.max(0, nextState.contacts.localCount - 1);
      emittedPushEvents.push({
        eventName: 'user_contacts_updated',
        payload: { source: 'local_delete', total: nextState.contacts.localCount },
      });
      return finalize(true, 'ok', 'host_action_result', {
        request_id: requestId,
        action: 'user_contact_delete_local',
        success: true,
        remaining: nextState.contacts.localCount,
      });
    }

    case 'user_contact_open_settings': {
      nextState.lastOpenedUrl =
        config.platform === 'ios' ? 'app-settings:' : 'package:com.vpmedia.vbot';
      return finalize(true, 'ok', 'host_action_result', {
        request_id: requestId,
        action: 'user_contact_open_settings',
        success: true,
        opened_os_settings: true,
      });
    }

    default: {
      return finalize(false, 'error', `${method}_result`, {
        request_id: requestId,
        success: false,
        error_code: 'UNSUPPORTED_ACTION',
        message: `Lệnh "${method}" không tồn tại hoặc chưa được hỗ trợ trong Sandbox.`,
      });
    }
  }
}

export function resolveHotlinePicker(
  _config: SandboxHostConfig,
  state: SandboxHostState,
  selectedHotline: string | null,
): SandboxCommandResult {
  const nextState = cloneState(state);
  const picker = nextState.pendingHotlinePicker;
  nextState.pendingHotlinePicker = null;
  const requestId = picker?.requestId ?? `req-${Date.now().toString(36)}`;
  const phone = picker?.phone ?? '0901234567';
  const traces = buildTraces('make_call');

  if (selectedHotline === null) {
    const errPayload = {
      request_id: requestId,
      action: 'make_call',
      success: false,
      reason: 'USER_CANCELLED',
      message: 'Người dùng huỷ chọn hotline trên ChooseHotlineCallBottomSheet Android.',
    };
    return {
      ok: false,
      status: 'error',
      method: 'make_call',
      requestId,
      responseEvent: 'host_action_result',
      responsePayload: errPayload,
      nextState,
      emittedPushEvents: [],
      parityAlertNote: 'Android trả { success: false, reason: "USER_CANCELLED" } khi đóng BottomSheet.',
      wireFrames: [
        {
          id: nextWireId('rx'),
          timestamp: nowTimeStr(),
          direction: 'host_to_miniapp',
          channel: 'VbMA.receive("host_action_result", payload)',
          methodOrEvent: 'host_action_result',
          status: 'error',
          payload: errPayload,
        },
      ],
      nativeIosTrace: traces.ios,
      nativeAndroidTrace: traces.android,
    };
  }

  const callId = `call_${Date.now().toString(36)}`;
  nextState.activeCall = {
    callId,
    phone,
    hotline: selectedHotline,
    name: picker?.name,
    state: 'ringing',
  };
  const okPayload = {
    request_id: requestId,
    action: 'make_call',
    success: true,
    call_id: callId,
    phone,
    hotline: selectedHotline,
    state: 'ringing',
  };
  return {
    ok: true,
    status: 'ok',
    method: 'make_call',
    requestId,
    responseEvent: 'host_action_result',
    responsePayload: okPayload,
    nextState,
    emittedPushEvents: [],
    wireFrames: [
      {
        id: nextWireId('rx'),
        timestamp: nowTimeStr(),
        direction: 'host_to_miniapp',
        channel: 'VbMA.receive("host_action_result", payload)',
        methodOrEvent: 'host_action_result',
        status: 'ok',
        payload: okPayload,
      },
    ],
    nativeIosTrace: traces.ios,
    nativeAndroidTrace: traces.android,
  };
}

export function buildHostPushEvent(
  eventName: string,
  customPayload: Record<string, unknown>,
  config: SandboxHostConfig,
  state: SandboxHostState,
): {
  nextState: SandboxHostState;
  eventName: string;
  payload: Record<string, unknown>;
  wireFrames: SandboxWireLogEntry[];
  parityAlertNote?: string;
} {
  const nextState = cloneState(state);
  let parityAlertNote: string | undefined;
  let payload: Record<string, unknown> = { ...customPayload };

  if (eventName === 'theme_changed') {
    const nextTheme =
      payload.theme === 'light' || payload.theme === 'dark'
        ? payload.theme
        : nextState.theme === 'dark'
          ? 'light'
          : 'dark';
    nextState.theme = nextTheme;
    payload = {
      theme: nextTheme,
      theme_params:
        nextTheme === 'dark'
          ? { bg_color: '#0f172a', text_color: '#f8fafc', button_color: '#06b6d4' }
          : { bg_color: '#ffffff', text_color: '#0f172a', button_color: '#0284c7' },
    };
    if (config.platform === 'android' && config.appId === 'vb-ma-user-history-call') {
      parityAlertNote = 'Lưu ý: Android CallHistoryFragment hiện không đẩy theme_changed tự động.';
    }
  } else if (eventName === 'autodial_finished') {
    nextState.autodial.status = 'stopped';
    if (nextState.activeCall?.callId.startsWith('call_ad_')) {
      nextState.activeCall = null;
    }
  } else if (eventName === 'monitor_call_state_changed' && config.platform === 'android') {
    parityAlertNote = 'Cảnh báo Parity: Event monitor_call_state_changed chỉ có trên Host iOS.';
  } else if (eventName === 'setup_2fa' && config.platform === 'android') {
    parityAlertNote = 'Android chưa có ActiveTracker theo appId nên sẽ phát tới WebView đang active.';
  }

  nextState.lastPushEvent = {
    eventName,
    payload,
    timestamp: Date.now(),
  };

  return {
    nextState,
    eventName,
    payload,
    parityAlertNote,
    wireFrames: [
      {
        id: nextWireId('push'),
        timestamp: nowTimeStr(),
        direction: 'host_to_miniapp',
        channel: `VbMA.receive("${eventName}", payload)`,
        methodOrEvent: eventName,
        status: parityAlertNote ? 'warning' : 'ok',
        payload,
        note: parityAlertNote ?? 'Host chủ động đẩy sự kiện xuống WebView',
      },
    ],
  };
}
