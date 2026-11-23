// tests/miniAppContractTestRunner.test.ts
import { describe, expect, it } from 'vitest';
import { buildMiniAppContract } from '../src/core/miniAppContractBuilder';
import {
  evaluateLiveIframeWireLogs,
  exportContractReportMarkdown,
  runSimulationContractSuite,
} from '../src/core/miniAppContractTestRunner';
import type { SandboxWireLogEntry } from '../src/core/miniAppSandboxEngine';

describe('miniAppContractTestRunner', () => {
  it('runs full iOS & Android contract suite for Autodial, Monitoring, and User Contact with zero failures', () => {
    for (const appId of ['vb-ma-autodial', 'vb-ma-monitoring', 'vb-ma-user-contact']) {
      const contract = buildMiniAppContract(appId);
      const report = runSimulationContractSuite(contract);
      expect(report.appId).toBe(appId);
      expect(report.total).toBeGreaterThan(10);
      expect(report.failed).toBe(0);
      expect(report.warnings).toBeGreaterThan(0); // iOS show_toast parity + app-specific parity warnings

      const md = exportContractReportMarkdown(report);
      expect(md).toContain(appId);
      expect(md).toContain('Biên bản Kiểm thử Chuẩn Bridge');
    }
  });

  it('evaluates live iframe wire logs for ready timing, schema compliance, and unknown methods', () => {
    const contract = buildMiniAppContract('vb-ma-autodial');

    const failEarlyLogs: SandboxWireLogEntry[] = [
      {
        id: '1',
        timestamp: '09:00:00',
        direction: 'miniapp_to_host',
        channel: 'VbMABridge',
        methodOrEvent: 'unknown_legacy_cmd',
        status: 'ok',
        payload: {},
      },
      {
        id: '2',
        timestamp: '09:00:01',
        direction: 'miniapp_to_host',
        channel: 'VbMABridge',
        methodOrEvent: 'make_call',
        status: 'ok',
        payload: { request_id: 'r1', action: 'make_call', payload: { phone: '' } },
      },
    ];

    const failingChecks = evaluateLiveIframeWireLogs(contract, failEarlyLogs, {
      elapsedMs: 6200,
      readyTimeoutMs: 5000,
    });
    expect(failingChecks.find((c) => c.id === 'live-ready')?.status).toBe('fail');
    expect(failingChecks.find((c) => c.id === 'live-methods')?.status).toBe('fail');
    expect(failingChecks.find((c) => c.id === 'live-schema')?.status).toBe('fail');

    const passingLogs: SandboxWireLogEntry[] = [
      {
        id: '1',
        timestamp: '09:00:00',
        direction: 'miniapp_to_host',
        channel: 'VbMABridge',
        methodOrEvent: 'ready',
        status: 'ok',
        payload: { sdk_version: '1.4.2' },
      },
      {
        id: '2',
        timestamp: '09:00:01',
        direction: 'miniapp_to_host',
        channel: 'VbMABridge',
        methodOrEvent: 'make_call',
        status: 'ok',
        payload: { request_id: 'r1', action: 'make_call', payload: { phone: '0901234567' } },
      },
    ];

    const passingChecks = evaluateLiveIframeWireLogs(contract, passingLogs, {
      elapsedMs: 1200,
    });
    expect(passingChecks.every((c) => c.status === 'pass')).toBe(true);
  });
});
