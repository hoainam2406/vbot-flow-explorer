// tests/parityAnalyzer.test.ts
import { describe, expect, it } from 'vitest';
import { loadMergedDataset } from '../plugins/flowDataPlugin';
import {
  exportParityReportToMarkdown,
  extractParityReport,
} from '../src/core/parityAnalyzer';
import type { MergedFlowDataset } from '../src/data/schema';

const syntheticDataset: MergedFlowDataset = {
  app: { name: 'VBot Test', tagline: 'Test', version: '1.0' },
  rootNode: {
    id: 'root',
    label: 'VBot App',
    kind: 'module',
    audience: 'all',
    summary: { overview: 'Root', tech: 'Root tech' },
    techDetail: {
      platformDiffNote: 'Khác kiến trúc nền tảng',
    },
  },
  branches: [
    {
      id: 'branch-same',
      label: 'Nhánh giống nhau',
      kind: 'module',
      audience: 'all',
      summary: { overview: 'Same' },
    },
    {
      id: 'branch-diff',
      label: 'Nhánh có khác biệt',
      kind: 'module',
      audience: 'all',
      summary: { overview: 'Diff' },
    },
  ],
  branchEdges: [
    { id: 'e-r-1', source: 'root', target: 'branch-same' },
    { id: 'e-r-2', source: 'root', target: 'branch-diff' },
  ],
  subtreesByParentId: {
    'branch-same': {
      title: 'Same',
      layoutHint: 'tree',
      entryNodeIds: ['same-1'],
      nodes: [
        {
          id: 'same-1',
          label: 'Bước giống hoàn toàn',
          kind: 'action',
          audience: 'all',
          summary: { overview: 'Giống' },
        },
      ],
      edges: [],
    },
    'branch-diff': {
      title: 'Diff',
      layoutHint: 'flow',
      entryNodeIds: ['ios-step'],
      nodes: [
        {
          id: 'ios-step',
          label: 'Bước iOS PushKit',
          kind: 'process',
          audience: 'tech',
          platforms: ['ios'],
          summary: { overview: 'iOS', tech: 'PushKit' },
          techDetail: {
            platformDiffNote: 'Chỉ chạy trên iOS PushKit',
          },
        },
        {
          id: 'and-step',
          label: 'Bước Android FSI',
          kind: 'process',
          audience: 'tech',
          platforms: ['android'],
          summary: { overview: 'Android', tech: 'FSI' },
        },
        {
          id: 'bridge-step',
          label: 'Bridge Mini App',
          kind: 'miniapp',
          audience: 'tech',
          summary: { overview: 'Bridge', tech: 'Bridge iOS' },
          techDetail: {
            byPlatform: {
              android: { summary: 'Bridge Android' },
            },
            miniAppBridge: {
              miniAppId: 'vb-ma-demo',
              embedMode: 'inline_tab',
              messages: [
                {
                  direction: 'miniapp_to_host',
                  name: 'make_call',
                  parityNote: 'Android callback trễ 200ms',
                },
              ],
            },
          },
        },
      ],
      edges: [
        { id: 'e-d-1', source: 'ios-step', target: 'bridge-step' },
        { id: 'e-d-2', source: 'and-step', target: 'bridge-step' },
      ],
    },
  },
};

describe('parityAnalyzer', () => {
  it('categorizes items, computes summary counts, and excludes empty branches', () => {
    const report = extractParityReport(syntheticDataset);

    expect(report.total).toBe(4);
    expect(report.iosOnly).toBe(1);
    expect(report.androidOnly).toBe(1);
    expect(report.behaviorDiff).toBe(2);
    expect(report.bridgeParity).toBe(1);

    expect(report.byBranch).toEqual([
      { branchId: 'root', branchLabel: 'VBot App', count: 1 },
      { branchId: 'branch-diff', branchLabel: 'Nhánh có khác biệt', count: 3 },
    ]);

    const iosItem = report.items.find((i) => i.nodeId === 'ios-step');
    expect(iosItem?.primaryCategory).toBe('ios_only');
    expect(iosItem?.categories).toContain('behavior_diff');
    expect(iosItem?.androidSummary).toBeUndefined();

    const andItem = report.items.find((i) => i.nodeId === 'and-step');
    expect(andItem?.primaryCategory).toBe('android_only');
    expect(andItem?.iosSummary).toBeUndefined();

    const bridgeItem = report.items.find((i) => i.nodeId === 'bridge-step');
    expect(bridgeItem?.primaryCategory).toBe('bridge_parity');
    expect(bridgeItem?.bridgeParityNotes).toEqual([
      { messageName: 'make_call', parityNote: 'Android callback trễ 200ms' },
    ]);
    expect(bridgeItem?.iosSummary).toBe('Bridge iOS');
    expect(bridgeItem?.androidSummary).toBe('Bridge Android');

    const md = exportParityReportToMarkdown(report, syntheticDataset.app);
    expect(md).toContain('# Báo cáo chênh lệch iOS ↔ Android — VBot Test (1.0)');
    expect(md).toContain('| Tổng số điểm ghi nhận | 4 |');
    expect(md).toContain('Android callback trễ 200ms');
  });

  it('extracts expected platform parity items from real VBot dataset', () => {
    const realDataset = loadMergedDataset(process.cwd());
    const report = extractParityReport(realDataset);

    expect(report.total).toBeGreaterThan(20);
    expect(report.iosOnly).toBeGreaterThan(0);
    expect(report.androidOnly).toBeGreaterThan(0);
    expect(report.behaviorDiff).toBeGreaterThan(0);
    expect(report.bridgeParity).toBeGreaterThan(0);

    const byId = new Map(report.items.map((item) => [item.nodeId, item]));

    expect(byId.get('call-in-android-fsi')?.primaryCategory).toBe('android_only');
    expect(byId.get('call-ctrl-sip-code')?.primaryCategory).toBe('android_only');
    expect(byId.get('call-in-raw-log')?.primaryCategory).toBe('ios_only');
    expect(byId.get('prj-call-type-ios')?.primaryCategory).toBe('ios_only');
    expect(byId.get('acc-delete-ios')?.primaryCategory).toBe('ios_only');

    const loopGuard = byId.get('mauc-loop-guard');
    expect(loopGuard).toBeDefined();
    expect(loopGuard?.categories).toContain('bridge_parity');
    expect(loopGuard?.categories).toContain('behavior_diff');

    const md = exportParityReportToMarkdown(report, realDataset.app);
    expect(md).toContain('call-in-android-fsi');
    expect(md).toContain('mauc-loop-guard');
  });
});
