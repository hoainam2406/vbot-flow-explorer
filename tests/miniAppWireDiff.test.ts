// tests/miniAppWireDiff.test.ts
import { describe, expect, it } from 'vitest';
import { compareWireSessions, exportWireDiffMarkdown } from '../src/core/miniAppWireDiff';
import type { WireSessionFile } from '../src/core/miniAppWireSession';

function makeSession(
  platform: 'ios' | 'android',
  logs: WireSessionFile['wireLogs'],
): WireSessionFile {
  return {
    schemaVersion: 'vbot-bridge-session/v1',
    exportedAt: '2026-11-23T12:00:00Z',
    appId: 'vb-ma-autodial',
    hostConfig: {
      appId: 'vb-ma-autodial',
      platform,
      rolePreset: 'member_sales',
      theme: 'dark',
      fault: 'none',
      apiBaseUrl: 'https://api-dev.vbot.vn',
      projectCode: 'vbot-demo',
      userId: 'u_1',
      defaultHotline: '02499998888',
      extraData: {},
    },
    wireLogs: logs,
  };
}

describe('miniAppWireDiff', () => {
  it('ignores volatile fields by default and detects status, payload, added, removed diffs', () => {
    const sA = makeSession('ios', [
      {
        id: 'f1',
        timestamp: '10:00:00',
        direction: 'miniapp_to_host',
        channel: 'WKWebView',
        methodOrEvent: 'ready',
        status: 'ok',
        payload: { request_id: 'req-a1', sdk_version: '1.4.2' },
      },
      {
        id: 'f2',
        timestamp: '10:00:01',
        direction: 'host_to_miniapp',
        channel: 'VbMA.receive',
        methodOrEvent: 'host_action_result',
        status: 'ok',
        payload: { request_id: 'req-a2', success: true, reason: undefined },
      },
      {
        id: 'f3',
        timestamp: '10:00:02',
        direction: 'host_to_miniapp',
        channel: 'Push',
        methodOrEvent: 'monitor_call_state_changed',
        status: 'ok',
        payload: { state: 'monitoring' },
      },
    ]);

    const sB = makeSession('android', [
      {
        id: 'b1',
        timestamp: '10:05:00',
        direction: 'miniapp_to_host',
        channel: 'VbMABridge',
        methodOrEvent: 'ready',
        status: 'ok',
        payload: { request_id: 'req-b1', sdk_version: '1.4.2' },
      },
      {
        id: 'b2',
        timestamp: '10:05:01',
        direction: 'host_to_miniapp',
        channel: 'VbMA.receive',
        methodOrEvent: 'host_action_result',
        status: 'error',
        payload: { request_id: 'req-b2', success: false, reason: 'USER_CANCELLED' },
      },
      {
        id: 'b3',
        timestamp: '10:05:02',
        direction: 'host_to_miniapp',
        channel: 'Sheet',
        methodOrEvent: 'hotline_picker_opened',
        status: 'pending',
        payload: {},
      },
    ]);

    const diff = compareWireSessions(sA, sB, { ignoreVolatileFields: true });
    expect(diff.summary.same).toBe(1);
    expect(diff.summary.statusChanged).toBe(1);
    expect(diff.summary.removed).toBe(1);
    expect(diff.summary.added).toBe(1);

    const statusRow = diff.rows.find((r) => r.kind === 'status_changed');
    expect(statusRow?.fieldDiffs.some((d) => d.path === 'success')).toBe(true);

    const md = exportWireDiffMarkdown(diff);
    expect(md).toContain('host_action_result');
    expect(md).toContain('monitor_call_state_changed');
    expect(md).toContain('hotline_picker_opened');

    // When ignoreVolatileFields is false, request_id causes payload_diff on ready
    const strictDiff = compareWireSessions(sA, sB, { ignoreVolatileFields: false });
    expect(strictDiff.rows[0].kind).toBe('payload_diff');
  });
});
