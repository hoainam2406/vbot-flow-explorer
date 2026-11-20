// tests/miniAppDevStudio.test.ts
import { describe, expect, it } from 'vitest';
import {
  buildCommandSdkSnippet,
  buildMiniAppContract,
  buildStarterSdkCode,
  exportAppIntegrationMarkdown,
  FEATURED_STUDIO_APP_IDS,
} from '../src/core/miniAppContractBuilder';
import {
  buildDevBridgeShimSnippet,
  buildHostPushEvent,
  buildLaunchHashString,
  buildLaunchParamsObject,
  createDefaultHostConfig,
  createInitialHostState,
  executeHostCommand,
  parseIncomingIframeMessage,
  resolveHotlinePicker,
  SANDBOX_FAULT_OPTIONS,
  validateIframeDevUrl,
} from '../src/core/miniAppSandboxEngine';
import { MINI_APP_CATALOG } from '../src/data/miniAppBridgeCatalog';
import { createRoleStateFromPreset } from '../src/data/miniAppPermissionMatrix';

describe('miniAppContractBuilder', () => {
  it('builds complete 2-way contracts and codegen for all 41 Mini Apps', () => {
    expect(MINI_APP_CATALOG).toHaveLength(41);
    expect(FEATURED_STUDIO_APP_IDS).toContain('vb-ma-autodial');

    for (const app of MINI_APP_CATALOG) {
      const contract = buildMiniAppContract(app.id);
      expect(contract.app.id).toBe(app.id);
      expect(contract.launchParams).toHaveLength(4);
      expect(contract.incomingEvents.length).toBeGreaterThanOrEqual(4);
      expect(contract.outgoingCommands.length).toBeGreaterThanOrEqual(14);
      expect(JSON.parse(contract.manifestPermissionsJson)).toBeTruthy();

      const starter = buildStarterSdkCode(contract);
      expect(starter).toContain(app.id);
      expect(starter).toContain('parseVBotLaunchHash');
      expect(starter).toContain('ready()');

      const md = exportAppIntegrationMarkdown(contract);
      expect(md).toContain(app.id);
      expect(md).toContain('Launch Params');
      expect(md).toContain('Mini App → Host');
    }
  });

  it('includes app-specific Host Actions and Host Push events accurately', () => {
    const autodial = buildMiniAppContract('vb-ma-autodial');
    expect(autodial.outgoingCommands.map((c) => c.method)).toEqual(
      expect.arrayContaining(['start_autodial', 'pause_autodial', 'stop_autodial', 'make_call']),
    );
    expect(autodial.incomingEvents.map((e) => e.eventName)).toEqual(
      expect.arrayContaining(['autodial_finished', 'autodial_error']),
    );

    const monitoring = buildMiniAppContract('vb-ma-monitoring');
    expect(monitoring.outgoingCommands.some((c) => c.method === 'monitor_call')).toBe(true);
    expect(monitoring.incomingEvents.some((e) => e.eventName === 'monitor_call_state_changed')).toBe(true);

    const contacts = buildMiniAppContract('vb-ma-user-contact');
    expect(contacts.outgoingCommands.map((c) => c.method)).toEqual(
      expect.arrayContaining(['user_contact_get_local', 'user_contact_import_device']),
    );
    expect(contacts.incomingEvents.some((e) => e.eventName === 'user_contacts_updated')).toBe(true);

    const sdkHostAction = buildCommandSdkSnippet('make_call', { phone: '0901234567' }, true);
    expect(sdkHostAction).toContain("postEvent('request_host_action'");
    expect(sdkHostAction).toContain('host_action_result');
  });
});

describe('miniAppSandboxEngine', () => {
  it('builds launch params and faithfully omits vbma_theme on Android History Call', () => {
    const iosHistoryCfg = {
      ...createDefaultHostConfig('vb-ma-user-history-call'),
      platform: 'ios' as const,
    };
    expect(buildLaunchParamsObject(iosHistoryCfg).vbma_theme).toBeDefined();

    const androidHistoryCfg = {
      ...createDefaultHostConfig('vb-ma-user-history-call'),
      platform: 'android' as const,
    };
    const androidParams = buildLaunchParamsObject(androidHistoryCfg);
    expect(androidParams.vbma_data).toBeDefined();
    expect(androidParams.vbma_theme).toBeUndefined();

    const hash = buildLaunchHashString(iosHistoryCfg);
    expect(hash.startsWith('#')).toBe(true);
    expect(hash).toContain('vbma_data=');
    expect(hash).toContain('vbma_api_base_url=');
  });

  it('validates localhost & HTTPS URLs while rejecting insecure or dangerous schemes', () => {
    expect(validateIframeDevUrl('http://localhost:5173').valid).toBe(true);
    expect(validateIframeDevUrl('http://127.0.0.1:3000').valid).toBe(true);
    expect(validateIframeDevUrl('http://miniapp.local:8080').valid).toBe(true);
    expect(validateIframeDevUrl('https://dev-miniapp.vbot.vn').valid).toBe(true);

    expect(validateIframeDevUrl('').valid).toBe(false);
    expect(validateIframeDevUrl('http://evil-remote.com').valid).toBe(false);
    expect(validateIframeDevUrl('javascript:alert(1)').valid).toBe(false);
    expect(validateIframeDevUrl('file:///etc/passwd').valid).toBe(false);
  });

  it('parses iframe postMessage payloads safely and builds a valid Dev Shim', () => {
    expect(buildDevBridgeShimSnippet()).toContain('window.VbMABridge');
    expect(buildDevBridgeShimSnippet()).toContain('vbot-miniapp-shim');

    const parsedHostAction = parseIncomingIframeMessage({
      source: 'vbot-miniapp-shim',
      method: 'request_host_action',
      payload: {
        request_id: 'req-99',
        action: 'make_call',
        payload: { phone: '0901234567' },
      },
    });
    expect(parsedHostAction).toEqual({
      method: 'make_call',
      payload: { phone: '0901234567' },
      requestId: 'req-99',
      isHostAction: true,
    });

    const parsedCore = parseIncomingIframeMessage({
      source: 'vbot-miniapp-shim',
      method: 'ready',
      payload: { sdk_version: '1.4.2' },
    });
    expect(parsedCore?.method).toBe('ready');
    expect(parsedCore?.isHostAction).toBe(false);

    expect(parseIncomingIframeMessage(null)).toBeNull();
    expect(parseIncomingIframeMessage('string')).toBeNull();
    expect(parseIncomingIframeMessage({ source: 'unknown', method: 'ready' })).toBeNull();
  });

  it('simulates Autodial state machine and busy rejection accurately', () => {
    const config = createDefaultHostConfig('vb-ma-autodial');
    let state = createInitialHostState(config);

    const invalidStart = executeHostCommand('start_autodial', { autoDialId: 0, hotline: '' }, config, state);
    expect(invalidStart.ok).toBe(false);
    expect(invalidStart.responsePayload.error_code).toBe('INVALID_PARAMS');

    const started = executeHostCommand(
      'start_autodial',
      { autoDialId: 151, hotline: '02499998888', campaignName: 'CSKH' },
      config,
      state,
    );
    expect(started.ok).toBe(true);
    state = started.nextState;
    expect(state.autodial.status).toBe('running');

    const busyReject = executeHostCommand(
      'start_autodial',
      { autoDialId: 152, hotline: '02499998888' },
      config,
      state,
    );
    expect(busyReject.ok).toBe(false);
    expect(busyReject.responsePayload.error_code).toBe('CALL_BUSY');

    const paused = executeHostCommand('pause_autodial', {}, config, state);
    expect(paused.ok).toBe(true);
    state = paused.nextState;
    expect(state.autodial.status).toBe('paused');

    const resumed = executeHostCommand('resume_autodial', {}, config, state);
    expect(resumed.ok).toBe(true);
    state = resumed.nextState;
    expect(state.autodial.status).toBe('running');

    const stopped = executeHostCommand('stop_autodial', {}, config, state);
    expect(stopped.ok).toBe(true);
    expect(stopped.nextState.autodial.status).toBe('stopped');
    expect(stopped.emittedPushEvents.some((e) => e.eventName === 'autodial_finished')).toBe(true);
  });

  it('simulates Android ChooseHotlineCallBottomSheet pending & USER_CANCELLED', () => {
    const androidCfg = { ...createDefaultHostConfig('vb-ma-crm'), platform: 'android' as const };
    const initial = createInitialHostState(androidCfg);

    const pending = executeHostCommand('make_call', { phone: '0901234567' }, androidCfg, initial);
    expect(pending.status).toBe('pending');
    expect(pending.nextState.pendingHotlinePicker?.phone).toBe('0901234567');

    const cancelled = resolveHotlinePicker(androidCfg, pending.nextState, null);
    expect(cancelled.ok).toBe(false);
    expect(cancelled.responsePayload.reason).toBe('USER_CANCELLED');
    expect(cancelled.nextState.pendingHotlinePicker).toBeNull();

    const confirmed = resolveHotlinePicker(androidCfg, pending.nextState, '02499998888');
    expect(confirmed.ok).toBe(true);
    expect(confirmed.nextState.activeCall?.hotline).toBe('02499998888');
  });

  it('evaluates RBAC 2-tier permissions, 401 refresh/logout, iOS show_toast parity, host_fetch auth strip, monitor_call, contacts, closingConfirmation & timeout', () => {
    expect(SANDBOX_FAULT_OPTIONS.length).toBeGreaterThanOrEqual(8);

    // 1. RBAC 2-tier evaluation
    const crmSalesCfg = createDefaultHostConfig('vb-ma-crm');
    const rbacSales = executeHostCommand(
      'check_permissions',
      { module: 'KHACH_HANG', actions: ['XEM', 'HIEN_SO_DIEN_THOAI'] },
      crmSalesCfg,
      createInitialHostState(crmSalesCfg),
    );
    const grantedSales = rbacSales.responsePayload.granted as Record<string, boolean>;
    expect(grantedSales.XEM).toBe(true);
    expect(grantedSales.HIEN_SO_DIEN_THOAI).toBe(false);

    const crmAdminCfg = {
      ...crmSalesCfg,
      rolePreset: 'admin' as const,
      roleState: createRoleStateFromPreset('admin'),
    };
    const rbacAdmin = executeHostCommand(
      'check_permissions',
      { module: 'KHACH_HANG', actions: ['XEM', 'HIEN_SO_DIEN_THOAI'] },
      crmAdminCfg,
      createInitialHostState(crmAdminCfg),
    );
    expect((rbacAdmin.responsePayload.granted as Record<string, boolean>).HIEN_SO_DIEN_THOAI).toBe(true);

    // 2. 401 token refresh OK vs Fail
    const refreshOkCfg = { ...crmSalesCfg, fault: 'token_401_refresh_ok' as const };
    const refreshed = executeHostCommand(
      'request_module_token',
      { module: 'crm', force: true },
      refreshOkCfg,
      createInitialHostState(refreshOkCfg),
    );
    expect(refreshed.ok).toBe(true);
    expect(refreshed.nextState.tokenRefreshCount).toBe(1);

    const androidLogoutCfg = {
      ...crmSalesCfg,
      platform: 'android' as const,
      fault: 'token_401_refresh_fail' as const,
    };
    const refreshFail = executeHostCommand(
      'request_module_token',
      { module: 'crm', force: true },
      androidLogoutCfg,
      createInitialHostState(androidLogoutCfg),
    );
    expect(refreshFail.ok).toBe(false);
    expect(refreshFail.nextState.sessionLogoutTriggered).toBe(true);

    // 3. show_toast iOS parity
    const toastIos = executeHostCommand(
      'show_toast',
      { message: 'Xin chào' },
      crmSalesCfg,
      createInitialHostState(crmSalesCfg),
    );
    expect(toastIos.ok).toBe(false);
    expect(toastIos.status).toBe('warning');
    expect(toastIos.responsePayload.error_code).toBe('UNSUPPORTED_ON_IOS');

    const androidCfg = { ...crmSalesCfg, platform: 'android' as const };
    const toastAndroid = executeHostCommand(
      'show_toast',
      { message: 'Xin chào', type: 'success' },
      androidCfg,
      createInitialHostState(androidCfg),
    );
    expect(toastAndroid.ok).toBe(true);
    expect(toastAndroid.nextState.activeToast?.message).toBe('Xin chào');

    // 4. host_fetch strips spoofed JS Authorization header
    const fetchSpoof = executeHostCommand(
      'host_fetch',
      { url: 'https://api-dev.vbot.vn/v1/customers', headers: { Authorization: 'Bearer fake' } },
      crmSalesCfg,
      createInitialHostState(crmSalesCfg),
    );
    expect(fetchSpoof.ok).toBe(true);
    expect(fetchSpoof.status).toBe('warning');
    expect(fetchSpoof.responsePayload.stripped_js_authorization).toBe(true);

    // 5. monitor_call iOS vs Android parity
    const monIosCfg = {
      ...createDefaultHostConfig('vb-ma-monitoring'),
      rolePreset: 'member_supervisor' as const,
      roleState: createRoleStateFromPreset('member_supervisor'),
    };
    const monIos = executeHostCommand(
      'monitor_call',
      { call_id: 'call_live_77', mode: 1 },
      monIosCfg,
      createInitialHostState(monIosCfg),
    );
    expect(monIos.ok).toBe(true);
    expect(monIos.emittedPushEvents.some((e) => e.eventName === 'monitor_call_state_changed')).toBe(true);

    const monAndroid = executeHostCommand(
      'monitor_call',
      { call_id: 'call_live_77', mode: 1 },
      { ...monIosCfg, platform: 'android' },
      createInitialHostState(monIosCfg),
    );
    expect(monAndroid.ok).toBe(true);
    expect(monAndroid.emittedPushEvents).toHaveLength(0);
    expect(monAndroid.parityAlertNote).toBeDefined();

    // 6. Contacts iOS limited
    const contactIosCfg = {
      ...createDefaultHostConfig('vb-ma-user-contact'),
      fault: 'contacts_limited_ios' as const,
    };
    const imported = executeHostCommand(
      'user_contact_import_device',
      {},
      contactIosCfg,
      createInitialHostState(contactIosCfg),
    );
    expect(imported.status).toBe('warning');
    expect(imported.responsePayload.permission_status).toBe('limited');

    // 7. closingConfirmation + timeout + push event
    let lifeState = createInitialHostState(crmSalesCfg);
    lifeState = executeHostCommand('setup_closing_behavior', { need_confirm: true }, crmSalesCfg, lifeState).nextState;
    const pendingClose = executeHostCommand('close', {}, crmSalesCfg, lifeState);
    expect(pendingClose.status).toBe('pending');
    expect(pendingClose.nextState.closingModalOpen).toBe(true);

    const forcedClose = executeHostCommand('close', { force: true }, crmSalesCfg, pendingClose.nextState);
    expect(forcedClose.ok).toBe(true);
    expect(forcedClose.nextState.closingModalOpen).toBe(false);

    const timeoutCfg = { ...crmSalesCfg, fault: 'timeout_5000ms' as const };
    const timeoutRes = executeHostCommand(
      'request_module_token',
      { module: 'vbot' },
      timeoutCfg,
      createInitialHostState(timeoutCfg),
    );
    expect(timeoutRes.ok).toBe(false);
    expect(timeoutRes.responsePayload.error_code).toBe('BRIDGE_TIMEOUT_5000MS');

    const pushed = buildHostPushEvent(
      'theme_changed',
      { theme: 'light' },
      androidCfg,
      createInitialHostState(androidCfg),
    );
    expect(pushed.nextState.theme).toBe('light');
    expect(pushed.nextState.lastPushEvent?.eventName).toBe('theme_changed');
  });
});
