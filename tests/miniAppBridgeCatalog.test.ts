// tests/miniAppBridgeCatalog.test.ts
import { describe, expect, it } from 'vitest';
import { loadMergedDataset } from '../plugins/flowDataPlugin';
import { findNodeById } from '../src/core/graphEngine';
import {
  BRIDGE_PARITY_ALERTS,
  CORE_BRIDGE_SPECS,
  exportMiniAppBridgeMarkdown,
  MINI_APP_CATALOG,
  MINI_APP_SIMULATOR_FLOWS,
  resolveActionFlowTarget,
} from '../src/data/miniAppBridgeCatalog';

describe('miniAppBridgeCatalog', () => {
  const dataset = loadMergedDataset(process.cwd());

  it('provides at least 7 detailed interactive flows starting with flow-autodial', () => {
    expect(MINI_APP_SIMULATOR_FLOWS.length).toBeGreaterThanOrEqual(7);
    const first = MINI_APP_SIMULATOR_FLOWS[0];
    expect(first.id).toBe('flow-autodial');
    expect(first.miniAppId).toBe('vb-ma-autodial');
    expect(first.subFlows?.map((sf) => sf.id)).toEqual([
      'autodial-start',
      'autodial-make-call',
      'autodial-pause-resume',
      'autodial-stop-state',
      'autodial-init-session',
      'autodial-finish-error',
    ]);

    const serializedAutodial = JSON.stringify(first);
    expect(serializedAutodial).toContain('get_supported_actions');
    expect(serializedAutodial).toContain('get_session_info');
    expect(serializedAutodial).toContain('make_call');
    expect(serializedAutodial).toContain('call_result');
    expect(serializedAutodial).toContain('start_autodial');
    expect(serializedAutodial).toContain('vbot.auto.dial');
    expect(serializedAutodial).toContain('host_action_result');
    expect(serializedAutodial).toContain('autodial_finished');
    expect(serializedAutodial).toContain('autodial_error');

    for (const flow of MINI_APP_SIMULATOR_FLOWS) {
      expect(flow.steps.length).toBeGreaterThanOrEqual(3);
      flow.steps.forEach((step, idx) => {
        expect(step.stepNumber).toBe(idx + 1);
        expect(step.explanation.trim().length).toBeGreaterThan(10);
        expect(step.hostIos.fn.trim().length).toBeGreaterThan(3);
        expect(step.hostAndroid.fn.trim().length).toBeGreaterThan(3);
      });
      if (flow.relatedNodeId) {
        expect(findNodeById(dataset, flow.relatedNodeId)).toBeDefined();
      }
      for (const sf of flow.subFlows ?? []) {
        expect(sf.steps.length).toBeGreaterThanOrEqual(3);
        sf.steps.forEach((step, idx) => {
          expect(step.stepNumber).toBe(idx + 1);
          expect(step.explanation.trim().length).toBeGreaterThan(10);
          expect(step.hostIos.fn.trim().length).toBeGreaterThan(3);
          expect(step.hostAndroid.fn.trim().length).toBeGreaterThan(3);
        });
        if (sf.relatedNodeId) {
          expect(findNodeById(dataset, sf.relatedNodeId)).toBeDefined();
        }
      }
    }
  });

  it('catalogs all 41 unique Mini Apps (36 active + 5 unused/special) with valid simulator references and clickable action chips', () => {
    expect(MINI_APP_CATALOG).toHaveLength(41);
    const ids = new Set(MINI_APP_CATALOG.map((app) => app.id));
    expect(ids.size).toBe(41);

    const autodialApp = MINI_APP_CATALOG.find((app) => app.id === 'vb-ma-autodial');
    expect(autodialApp).toBeDefined();
    expect(autodialApp?.bridgeTier).toBe('custom_bridge');
    expect(autodialApp?.simulatorFlowId).toBe('flow-autodial');
    expect(autodialApp?.customActions).toEqual(
      expect.arrayContaining([
        'get_supported_actions',
        'get_session_info',
        'make_call',
        'start_autodial',
        'pause_autodial',
        'resume_autodial',
        'stop_autodial',
        'get_autodial_state',
        'autodial_finished',
        'autodial_error',
      ]),
    );

    const campaignApp = MINI_APP_CATALOG.find((app) => app.id === 'vb-ma-auto-call-campaign');
    expect(campaignApp).toBeDefined();
    expect(campaignApp?.bridgeTier).toBe('core_sdk');

    expect(resolveActionFlowTarget('make_call', 'vb-ma-autodial')).toEqual({
      flowId: 'flow-autodial',
      subFlowId: 'autodial-make-call',
    });
    expect(resolveActionFlowTarget('make_call', 'vb-ma-crm')).toEqual({
      flowId: 'flow-make-call',
    });

    const flowMap = new Map(MINI_APP_SIMULATOR_FLOWS.map((f) => [f.id, f]));
    for (const app of MINI_APP_CATALOG) {
      if (app.simulatorFlowId) {
        expect(flowMap.has(app.simulatorFlowId)).toBe(true);
      }
      if (app.relatedNodeId) {
        expect(findNodeById(dataset, app.relatedNodeId)).toBeDefined();
      }
      for (const act of app.customActions ?? []) {
        const target = resolveActionFlowTarget(act, app.id);
        expect(target).not.toBeNull();
        const targetFlow = flowMap.get(target!.flowId);
        expect(targetFlow).toBeDefined();
        if (target?.subFlowId) {
          expect(targetFlow?.subFlows?.some((sf) => sf.id === target.subFlowId)).toBe(true);
        }
      }
    }
  });

  it('covers core @vbotma/sdk commands, parity alerts, and exports clean 5-section Markdown spec', () => {
    const specText = CORE_BRIDGE_SPECS.map((s) => `${s.id} ${s.name}`).join(' ');
    for (const expected of [
      'request_mini_app_token',
      'request_module_token',
      'check_permissions',
      'make_call',
      'monitor_call',
      'open_mini_app',
      'get_supported_actions',
      'refresh_data',
    ]) {
      expect(specText).toContain(expected);
    }

    expect(BRIDGE_PARITY_ALERTS.length).toBeGreaterThanOrEqual(3);
    expect(BRIDGE_PARITY_ALERTS.some((a) => a.id === 'pa-autodial-err')).toBe(false);
    expect(BRIDGE_PARITY_ALERTS.some((a) => a.id === 'pa-make-call-200ms')).toBe(false);
    for (const alert of BRIDGE_PARITY_ALERTS) {
      if (alert.relatedNodeId) {
        expect(findNodeById(dataset, alert.relatedNodeId)).toBeDefined();
      }
    }

    const md = exportMiniAppBridgeMarkdown();
    expect(md).not.toContain('Handler.postDelayed');
    expect(md).not.toContain('timer 200ms đã trả');
    expect(md).toContain('## 1. Kiến trúc tổng quan');
    expect(md).toContain('## 2. Luồng chạy thử chi tiết');
    expect(md).toContain('Bắt đầu (start_autodial)');
    expect(md).toContain('Quay số lẻ (make_call)');
    expect(md).toContain('Tạm dừng & Tiếp tục');
    expect(md).toContain('Dừng & Lấy trạng thái');
    expect(md).toContain('Khởi tạo & Session');
    expect(md).toContain('Hoàn tất & Lỗi');
    expect(md).toContain('## 3. Bảng tra cứu Core Protocol');
    expect(md).toContain('## 4. Danh mục đầy đủ 41 Mini App');
    expect(md).toContain('## 5. Điểm lệch Parity');
  });

  it('structures 6 top-level branches, 6 Prod Hub categories (34 apps), 4 in-call apps, and 41/41 1-1 catalog node links', () => {
    expect(dataset.branches.map((b) => b.id)).toEqual([
      'mod-calling',
      'mod-auth',
      'mod-contacts',
      'mod-miniapp-hub',
      'mod-history-hotline',
      'mod-account-system',
    ]);
    expect(dataset.branches.some((b) => b.id === 'mod-autodial')).toBe(false);

    const callingNodes = dataset.subtreesByParentId['mod-calling']?.nodes ?? [];
    expect(callingNodes.some((n) => n.id === 'call-marketing-template')).toBe(true);
    expect(dataset.subtreesByParentId['call-incall-miniapps']?.nodes).toHaveLength(4);

    const hubCategoryNodes = dataset.subtreesByParentId['miniapp-list']?.nodes ?? [];
    expect(hubCategoryNodes).toHaveLength(6);
    expect(dataset.subtreesByParentId['hub-cat-call-mgmt']?.nodes).toHaveLength(11);
    const hubMiniAppCount = hubCategoryNodes.reduce(
      (sum, cat) => sum + (dataset.subtreesByParentId[cat.id]?.nodes.length ?? 0),
      0,
    );
    expect(hubMiniAppCount).toBe(34);

    const relatedIds = new Set<string>();
    for (const app of MINI_APP_CATALOG) {
      expect(app.relatedNodeId).toBeDefined();
      expect(relatedIds.has(app.relatedNodeId!)).toBe(false);
      relatedIds.add(app.relatedNodeId!);
      const targetNode = findNodeById(dataset, app.relatedNodeId!);
      expect(targetNode).toBeDefined();
      expect(targetNode?.kind).toBe('miniapp');
    }
    expect(relatedIds.size).toBe(41);
  });
});
