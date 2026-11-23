// src/core/miniAppContractTestRunner.ts
import type { MiniAppContract } from './miniAppContractBuilder';
import {
  createDefaultHostConfig,
  createInitialHostState,
  executeHostCommand,
  resolveHotlinePicker,
  type SandboxHostConfig,
  type SandboxPlatform,
  type SandboxWireLogEntry,
} from './miniAppSandboxEngine';
import { createRoleStateFromPreset } from '../data/miniAppPermissionMatrix';

export type ContractTestStatus = 'pass' | 'warning' | 'fail';

export interface ContractTestResultItem {
  id: string;
  title: string;
  category: 'lifecycle' | 'auth' | 'rbac' | 'host_action' | 'security' | 'fault';
  platform: SandboxPlatform;
  method: string;
  status: ContractTestStatus;
  expectedSummary: string;
  actualSummary: string;
  parityNote?: string;
  errorCode?: string;
}

export interface ContractTestSuiteReport {
  appId: string;
  appName: string;
  executedAt: string;
  durationMs: number;
  total: number;
  passed: number;
  warnings: number;
  failed: number;
  results: ContractTestResultItem[];
}

export interface LiveComplianceCheck {
  id: string;
  title: string;
  status: ContractTestStatus;
  detail: string;
}

function makeConfig(
  appId: string,
  platform: SandboxPlatform,
  overrides?: Partial<SandboxHostConfig>,
): SandboxHostConfig {
  const base = createDefaultHostConfig(appId);
  const rolePreset = overrides?.rolePreset ?? base.rolePreset;
  return {
    ...base,
    platform,
    ...overrides,
    rolePreset,
    roleState: overrides?.roleState ?? createRoleStateFromPreset(rolePreset),
  };
}

export function runSimulationContractSuite(
  contract: MiniAppContract,
): ContractTestSuiteReport {
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const appId = contract.app.id;
  const results: ContractTestResultItem[] = [];
  const platforms: SandboxPlatform[] = ['ios', 'android'];
  const methods = new Set(contract.outgoingCommands.map((c) => c.method));

  const firstCap = contract.permissionProfile?.manifestCapabilities[0];
  const sampleModule = firstCap?.module ?? 'KHACH_HANG';
  const sampleActions =
    firstCap && firstCap.actions.length > 0 ? firstCap.actions.slice(0, 2) : ['XEM'];

  for (const platform of platforms) {
    // 1. Lifecycle ready()
    {
      const cfg = makeConfig(appId, platform);
      const res = executeHostCommand(
        'ready',
        { sdk_version: '1.4.2' },
        cfg,
        createInitialHostState(cfg),
      );
      const ok = res.ok && res.nextState.isReady;
      results.push({
        id: `${platform}-ready`,
        title: 'Khởi tạo WebView và gọi ready()',
        category: 'lifecycle',
        platform,
        method: 'ready',
        status: ok ? 'pass' : 'fail',
        expectedSummary: 'Host đánh dấu isReady = true và trả ready_ack',
        actualSummary: ok
          ? `isReady=${String(res.nextState.isReady)}, flushed=${String(res.responsePayload.flushed_queued_events ?? 0)}`
          : 'Không đánh dấu được isReady',
      });
    }

    // 2. MiniApp Token & Module Token + 401 Refresh OK / Fail
    {
      const cfg = makeConfig(appId, platform);
      const tokenRes = executeHostCommand(
        'request_mini_app_token',
        { force: false },
        cfg,
        createInitialHostState(cfg),
      );
      const hasToken =
        tokenRes.ok && typeof tokenRes.responsePayload.token === 'string';
      results.push({
        id: `${platform}-miniapp-token`,
        title: 'Lấy MiniApp Access Token',
        category: 'auth',
        platform,
        method: 'request_mini_app_token',
        status: hasToken ? 'pass' : 'fail',
        expectedSummary: 'Trả success=true kèm token hợp lệ',
        actualSummary: hasToken
          ? 'Cấp token thành công'
          : `Thất bại: ${String(tokenRes.responsePayload.error_code ?? 'UNKNOWN')}`,
      });

      const refreshOkCfg = makeConfig(appId, platform, { fault: 'token_401_refresh_ok' });
      const refreshOk = executeHostCommand(
        'request_module_token',
        { module: 'crm', force: true },
        refreshOkCfg,
        createInitialHostState(refreshOkCfg),
      );
      const okRefreshed =
        refreshOk.ok &&
        refreshOk.nextState.tokenRefreshCount === 1 &&
        refreshOk.responsePayload.refreshed === true;
      results.push({
        id: `${platform}-401-refresh-ok`,
        title: 'Tự phục hồi HTTP 401 → Refresh Token thành công',
        category: 'auth',
        platform,
        method: 'request_module_token',
        status: okRefreshed ? 'pass' : 'fail',
        expectedSummary: 'refresh_count = 1, refreshed = true',
        actualSummary: `refresh_count=${refreshOk.nextState.tokenRefreshCount}, refreshed=${String(refreshOk.responsePayload.refreshed)}`,
      });

      const refreshFailCfg = makeConfig(appId, platform, { fault: 'token_401_refresh_fail' });
      const refreshFail = executeHostCommand(
        'request_module_token',
        { module: 'crm', force: true },
        refreshFailCfg,
        createInitialHostState(refreshFailCfg),
      );
      const expectedLogout = platform === 'android';
      const logoutMatched =
        !refreshFail.ok && refreshFail.nextState.sessionLogoutTriggered === expectedLogout;
      results.push({
        id: `${platform}-401-refresh-fail`,
        title: 'Xử lý HTTP 401 khi Refresh Token thất bại',
        category: 'fault',
        platform,
        method: 'request_module_token',
        status: logoutMatched ? 'pass' : 'fail',
        expectedSummary: expectedLogout
          ? 'Lỗi REFRESH_TOKEN_FAILED & Android ép logout 1 lần'
          : 'Lỗi REFRESH_TOKEN_FAILED & đóng phiên module an toàn',
        actualSummary: `error_code=${String(refreshFail.responsePayload.error_code)}, logout=${String(refreshFail.nextState.sessionLogoutTriggered)}`,
        parityNote: refreshFail.parityAlertNote,
        errorCode: String(refreshFail.responsePayload.error_code ?? ''),
      });
    }

    // 3. RBAC 2-tier check_permissions
    {
      const adminCfg = makeConfig(appId, platform, { rolePreset: 'admin' });
      const adminRes = executeHostCommand(
        'check_permissions',
        { module: sampleModule, actions: sampleActions },
        adminCfg,
        createInitialHostState(adminCfg),
      );
      const deniedCfg = makeConfig(appId, platform, { fault: 'rbac_denied' });
      const deniedRes = executeHostCommand(
        'check_permissions',
        { module: sampleModule, actions: sampleActions },
        deniedCfg,
        createInitialHostState(deniedCfg),
      );
      const deniedGranted = (deniedRes.responsePayload.granted ?? {}) as Record<string, boolean>;
      const allDenied =
        deniedRes.ok && Object.values(deniedGranted).every((v) => v === false);
      const passRbac = adminRes.ok && allDenied;
      results.push({
        id: `${platform}-rbac`,
        title: `Kiểm tra phân quyền 2 tầng (${sampleModule}) khi Admin vs RBAC 403`,
        category: 'rbac',
        platform,
        method: 'check_permissions',
        status: passRbac ? 'pass' : 'fail',
        expectedSummary: 'Admin pass và fault rbac_denied trả false toàn bộ action',
        actualSummary: passRbac ? 'Khớp ma trận RBAC' : 'Sai lệch kết quả granted',
      });
    }

    // 4. Security & Boundary
    {
      const cfg = makeConfig(appId, platform);
      const spoofFetch = executeHostCommand(
        'host_fetch',
        {
          url: 'https://api-dev.vbot.vn/v1/customers',
          method: 'GET',
          headers: { Authorization: 'Bearer spoofed_js_token' },
        },
        cfg,
        createInitialHostState(cfg),
      );
      const stripped =
        spoofFetch.ok && spoofFetch.responsePayload.stripped_js_authorization === true;
      results.push({
        id: `${platform}-host-fetch-auth-strip`,
        title: 'Bảo mật host_fetch: loại bỏ header Authorization từ JS',
        category: 'security',
        platform,
        method: 'host_fetch',
        status: stripped ? 'pass' : 'fail',
        expectedSummary: 'stripped_js_authorization = true',
        actualSummary: `stripped_js_authorization=${String(spoofFetch.responsePayload.stripped_js_authorization)}`,
      });

      const xssLink = executeHostCommand(
        'open_link',
        { url: 'javascript:alert(1)' },
        cfg,
        createInitialHostState(cfg),
      );
      const rejectedXss =
        !xssLink.ok && xssLink.responsePayload.error_code === 'INVALID_URL';
      results.push({
        id: `${platform}-open-link-xss`,
        title: 'Chặn URL nguy hiểm (javascript:) trong open_link',
        category: 'security',
        platform,
        method: 'open_link',
        status: rejectedXss ? 'pass' : 'fail',
        expectedSummary: 'Từ chối với INVALID_URL',
        actualSummary: `error_code=${String(xssLink.responsePayload.error_code)}`,
      });

      const timeoutCfg = makeConfig(appId, platform, { fault: 'timeout_5000ms' });
      const timeoutRes = executeHostCommand(
        'request_module_token',
        { module: 'vbot' },
        timeoutCfg,
        createInitialHostState(timeoutCfg),
      );
      const timeoutOk =
        !timeoutRes.ok && timeoutRes.responsePayload.error_code === 'BRIDGE_TIMEOUT_5000MS';
      results.push({
        id: `${platform}-timeout-5000ms`,
        title: 'Timeout Bridge 5000ms trả lỗi chuẩn để JS fallback',
        category: 'fault',
        platform,
        method: 'request_module_token',
        status: timeoutOk ? 'pass' : 'fail',
        expectedSummary: 'Trả BRIDGE_TIMEOUT_5000MS',
        actualSummary: `error_code=${String(timeoutRes.responsePayload.error_code)}`,
      });

      const toastRes = executeHostCommand(
        'show_toast',
        { message: 'Test', type: 'success' },
        cfg,
        createInitialHostState(cfg),
      );
      const toastValid =
        platform === 'android'
          ? toastRes.ok
          : toastRes.responsePayload.error_code === 'UNSUPPORTED_ON_IOS';
      results.push({
        id: `${platform}-show-toast`,
        title: 'Kiểm tra show_toast & cảnh báo thiếu hỗ trợ trên iOS',
        category: 'host_action',
        platform,
        method: 'show_toast',
        status: !toastValid ? 'fail' : platform === 'ios' ? 'warning' : 'pass',
        expectedSummary:
          platform === 'ios'
            ? 'Cảnh báo UNSUPPORTED_ON_IOS — Mini App phải tự render Web Toast'
            : 'Android hiển thị Native Toast thành công',
        actualSummary:
          platform === 'ios'
            ? String(toastRes.responsePayload.error_code)
            : 'Native Toast OK',
        parityNote: toastRes.parityAlertNote,
      });
    }

    // 5. App-specific Host Actions
    if (methods.has('make_call')) {
      const cfg = makeConfig(appId, platform);
      const dialOk = executeHostCommand(
        'make_call',
        { phone: '0901234567', hotline: '02499998888', name: 'Test User' },
        cfg,
        createInitialHostState(cfg),
      );
      results.push({
        id: `${platform}-make-call`,
        title: 'Gọi ra make_call có sẵn hotline',
        category: 'host_action',
        platform,
        method: 'make_call',
        status: dialOk.ok && dialOk.nextState.activeCall ? 'pass' : 'fail',
        expectedSummary: 'Khởi tạo activeCall trạng thái ringing',
        actualSummary: dialOk.nextState.activeCall
          ? `callId=${dialOk.nextState.activeCall.callId}`
          : 'Không tạo được cuộc gọi',
      });

      if (platform === 'android') {
        const sheetCfg = makeConfig(appId, 'android', { fault: 'android_hotline_picker' });
        const pending = executeHostCommand(
          'make_call',
          { phone: '0901234567' },
          sheetCfg,
          createInitialHostState(sheetCfg),
        );
        const cancelled = resolveHotlinePicker(sheetCfg, pending.nextState, null);
        const pickerOk =
          pending.status === 'pending' &&
          !cancelled.ok &&
          cancelled.responsePayload.reason === 'USER_CANCELLED';
        results.push({
          id: 'android-make-call-picker-cancel',
          title: 'Android ChooseHotlineCallBottomSheet khi thiếu hotline & hủy chọn',
          category: 'fault',
          platform: 'android',
          method: 'make_call',
          status: pickerOk ? 'pass' : 'fail',
          expectedSummary: 'Pending chọn hotline → trả USER_CANCELLED nếu đóng sheet',
          actualSummary: `pending=${pending.status}, cancelReason=${String(cancelled.responsePayload.reason)}`,
          parityNote: pending.parityAlertNote,
        });
      }
    }

    if (methods.has('start_autodial')) {
      const cfg = makeConfig(appId, platform);
      const startOk = executeHostCommand(
        'start_autodial',
        { autoDialId: 151, hotline: '02499998888', campaignName: 'Test' },
        cfg,
        createInitialHostState(cfg),
      );
      const busyCfg = makeConfig(appId, platform, { fault: 'autodial_busy' });
      const startBusy = executeHostCommand(
        'start_autodial',
        { autoDialId: 151, hotline: '02499998888' },
        busyCfg,
        createInitialHostState(busyCfg),
      );
      const passAuto =
        startOk.ok &&
        startOk.nextState.autodial.status === 'running' &&
        !startBusy.ok &&
        startBusy.responsePayload.error_code === 'CALL_BUSY';
      results.push({
        id: `${platform}-autodial-lifecycle`,
        title: 'Khởi chạy start_autodial & từ chối CALL_BUSY khi đang bận cuộc gọi',
        category: 'host_action',
        platform,
        method: 'start_autodial',
        status: passAuto ? 'pass' : 'fail',
        expectedSummary: 'running khi rảnh và CALL_BUSY khi có activeCall',
        actualSummary: `start=${startOk.nextState.autodial.status}, busyCode=${String(startBusy.responsePayload.error_code)}`,
      });
    }

    if (methods.has('monitor_call')) {
      const cfg = makeConfig(appId, platform, { rolePreset: 'member_supervisor' });
      const monRes = executeHostCommand(
        'monitor_call',
        { call_id: 'call_live_77', mode: 1 },
        cfg,
        createInitialHostState(cfg),
      );
      const hasIosEvent = monRes.emittedPushEvents.some(
        (e) => e.eventName === 'monitor_call_state_changed',
      );
      const status: ContractTestStatus = !monRes.ok
        ? 'fail'
        : platform === 'android'
          ? 'warning'
          : 'pass';
      results.push({
        id: `${platform}-monitor-call`,
        title: 'Giám sát cuộc gọi monitor_call & khác biệt event iOS/Android',
        category: 'host_action',
        platform,
        method: 'monitor_call',
        status,
        expectedSummary:
          platform === 'ios'
            ? 'iOS phát monitor_call_state_changed về JS'
            : 'Android chỉ mở Native PiP (không phát state event về JS)',
        actualSummary: `ok=${String(monRes.ok)}, emittedStateEvent=${String(hasIosEvent)}`,
        parityNote: monRes.parityAlertNote,
      });
    }

    if (methods.has('user_contact_import_device')) {
      const cfg = makeConfig(appId, platform, {
        fault: platform === 'ios' ? 'contacts_limited_ios' : 'none',
      });
      const imp = executeHostCommand(
        'user_contact_import_device',
        {},
        cfg,
        createInitialHostState(cfg),
      );
      const okImp =
        platform === 'ios'
          ? imp.status === 'warning' && imp.responsePayload.permission_status === 'limited'
          : imp.ok;
      results.push({
        id: `${platform}-contacts-import`,
        title:
          platform === 'ios'
            ? 'Nhập danh bạ thiết bị xử lý quyền Limited (iOS 18+)'
            : 'Nhập danh bạ thiết bị Android (READ_CONTACTS)',
        category: 'host_action',
        platform,
        method: 'user_contact_import_device',
        status: !okImp ? 'fail' : platform === 'ios' ? 'warning' : 'pass',
        expectedSummary:
          platform === 'ios'
            ? 'Trả permission_status="limited" — JS hiện banner mời mở Settings'
            : 'Import thành công danh bạ thiết bị',
        actualSummary: `status=${imp.status}, perm=${String(imp.responsePayload.permission_status)}`,
        parityNote: imp.parityAlertNote,
      });
    }
  }

  const finishedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const passed = results.filter((r) => r.status === 'pass').length;
  const warnings = results.filter((r) => r.status === 'warning').length;
  const failed = results.filter((r) => r.status === 'fail').length;

  return {
    appId,
    appName: contract.app.nameVi,
    executedAt: new Date().toISOString(),
    durationMs: Math.max(1, Math.round(finishedAt - startedAt)),
    total: results.length,
    passed,
    warnings,
    failed,
    results,
  };
}

export function evaluateLiveIframeWireLogs(
  contract: MiniAppContract,
  logs: readonly SandboxWireLogEntry[],
  options: { elapsedMs: number; readyTimeoutMs?: number },
): LiveComplianceCheck[] {
  const readyTimeoutMs = options.readyTimeoutMs ?? 5000;
  const checks: LiveComplianceCheck[] = [];
  const outgoingFrames = logs.filter((l) => l.direction === 'miniapp_to_host');

  // 1. ready() timing
  const hasReady = outgoingFrames.some((l) => l.methodOrEvent === 'ready');
  if (hasReady) {
    checks.push({
      id: 'live-ready',
      title: 'Mini App gọi ready() khi khởi tạo',
      status: 'pass',
      detail: 'Đã nhận được tín hiệu ready() từ Iframe để xả hàng đợi event.',
    });
  } else if (options.elapsedMs > readyTimeoutMs) {
    checks.push({
      id: 'live-ready',
      title: 'Mini App gọi ready() khi khởi tạo',
      status: 'fail',
      detail: `Đã quá ${readyTimeoutMs}ms nhưng chưa nhận được lệnh ready() từ Iframe.`,
    });
  } else {
    checks.push({
      id: 'live-ready',
      title: 'Mini App gọi ready() khi khởi tạo',
      status: 'warning',
      detail: 'Chưa thấy lệnh ready() trong wire log hiện tại (hãy nạp Iframe hoặc gọi sdk.ready()).',
    });
  }

  // 2. Contract method whitelist check
  const allSpecMap = new Map(contract.allAvailableCommands.map((c) => [c.method, c]));
  const appMethodSet = new Set(contract.outgoingCommands.map((c) => c.method));
  const unknownMethods: string[] = [];
  const undeclaredForApp: string[] = [];
  const schemaViolations: string[] = [];

  for (const frame of outgoingFrames) {
    const method = frame.methodOrEvent;
    const spec = allSpecMap.get(method);
    if (!spec) {
      unknownMethods.push(method);
      continue;
    }
    if (!appMethodSet.has(method)) {
      undeclaredForApp.push(method);
    }
    const rawPayload =
      spec.isHostAction && frame.payload.payload && typeof frame.payload.payload === 'object'
        ? (frame.payload.payload as Record<string, unknown>)
        : frame.payload;
    for (const field of spec.requestSchema) {
      if (!field.required) continue;
      const val = rawPayload[field.name];
      if (val === undefined || val === null || val === '') {
        schemaViolations.push(`${method}.${field.name}`);
      }
    }
  }

  checks.push({
    id: 'live-methods',
    title: 'Khớp danh sách hàm trong Hợp đồng @vbotma/sdk',
    status:
      unknownMethods.length > 0
        ? 'fail'
        : undeclaredForApp.length > 0
          ? 'warning'
          : 'pass',
    detail:
      unknownMethods.length > 0
        ? `Phát hiện lệnh không tồn tại trong SDK: ${[...new Set(unknownMethods)].join(', ')}`
        : undeclaredForApp.length > 0
          ? `Gọi lệnh ngoài danh mục chuẩn của ${contract.app.id}: ${[...new Set(undeclaredForApp)].join(', ')}`
          : `Đã đối chiếu ${outgoingFrames.length} lệnh gửi lên — đều hợp lệ.`,
  });

  // 3. Required payload fields check
  checks.push({
    id: 'live-schema',
    title: 'Đủ tham số bắt buộc (Required Fields)',
    status: schemaViolations.length > 0 ? 'fail' : 'pass',
    detail:
      schemaViolations.length > 0
        ? `Thiếu tham số bắt buộc: ${[...new Set(schemaViolations)].join(', ')}`
        : 'Tất cả gói tin gửi lên đều đủ trường bắt buộc theo Schema.',
  });

  // 4. Error / Timeout check
  const errorFrames = logs.filter((l) => l.status === 'error');
  checks.push({
    id: 'live-errors',
    title: 'Không phát sinh lỗi / Timeout chưa xử lý',
    status: errorFrames.length > 0 ? 'warning' : 'pass',
    detail:
      errorFrames.length > 0
        ? `Ghi nhận ${errorFrames.length} frame trạng thái error trong phiên — kiểm tra fallback UI trên Mini App.`
        : 'Chưa có frame lỗi nào trong wire log.',
  });

  return checks;
}

export function exportContractReportMarkdown(
  report: ContractTestSuiteReport,
  liveChecks?: readonly LiveComplianceCheck[],
): string {
  const lines: string[] = [
    `# Biên bản Kiểm thử Chuẩn Bridge: ${report.appName} (\`${report.appId}\`)`,
    '',
    `- **Thời gian chạy:** ${report.executedAt} (${report.durationMs} ms)`,
    `- **Kết quả Simulation iOS & Android:** Pass ${report.passed} · Cảnh báo Parity ${report.warnings} · Fail ${report.failed} (Tổng ${report.total})`,
    '',
    '| Nền tảng | Lệnh | Bài kiểm thử | Kết quả | Chi tiết |',
    '| :---: | :--- | :--- | :---: | :--- |',
  ];

  for (const r of report.results) {
    const icon = r.status === 'pass' ? 'PASS' : r.status === 'warning' ? 'WARN' : 'FAIL';
    const detail = r.parityNote ? `${r.actualSummary} (${r.parityNote})` : r.actualSummary;
    lines.push(
      `| ${r.platform.toUpperCase()} | \`${r.method}\` | ${r.title.replace(/\|/g, '/')} | ${icon} | ${detail.replace(/\|/g, '/')} |`,
    );
  }

  if (liveChecks && liveChecks.length > 0) {
    lines.push('', '## Kiểm tra Live Iframe Compliance', '');
    for (const c of liveChecks) {
      lines.push(`- **[${c.status.toUpperCase()}] ${c.title}:** ${c.detail}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}
