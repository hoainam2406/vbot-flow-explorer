// tests/prImpactEngine.test.ts
import { describe, expect, it } from 'vitest';
import { buildImpactIndex } from '../src/core/impactAnalyzer';
import {
  analyzePrImpact,
  evaluateCodeDrift,
  exportPrRegressionMarkdown,
  parseChangedFileList,
} from '../src/core/prImpactEngine';
import type { MergedFlowDataset } from '../src/data/schema';

const MOCK_DATASET: MergedFlowDataset = {
  app: { name: 'VBot', tagline: 'Test' },
  rootNode: {
    id: 'vbot-app',
    label: 'VBot App',
    kind: 'module',
    audience: 'all',
    summary: { overview: 'Root' },
  },
  branches: [
    {
      id: 'mod-calling',
      label: 'Gọi thoại',
      kind: 'module',
      audience: 'all',
      summary: { overview: 'Call' },
    },
  ],
  branchEdges: [{ id: 'e-root', source: 'vbot-app', target: 'mod-calling' }],
  subtreesByParentId: {
    'mod-calling': {
      title: 'Gọi thoại',
      layoutHint: 'flow',
      entryNodeIds: ['call-start'],
      nodes: [
        {
          id: 'call-start',
          label: 'Bắt đầu gọi',
          kind: 'action',
          audience: 'all',
          summary: { overview: 'Dial' },
          meta: { lastVerifiedAt: '2026-11-10' },
          techDetail: {
            codeRefs: ['VBot/Service/VPMAppService.swift'],
            byPlatform: {
              android: {
                codeRefs: [
                  'VBot-Android/app/src/main/java/com/vpmedia/vbot/ui/call/NewCallActivity.kt',
                ],
              },
            },
          },
        },
        {
          id: 'call-end',
          label: 'Kết thúc gọi',
          kind: 'process',
          audience: 'tech',
          summary: { overview: 'Hangup' },
          meta: { lastVerifiedAt: '2026-11-20' },
          techDetail: {
            codeRefs: ['VBot/Service/CallEndService.swift'],
          },
        },
      ],
      edges: [{ id: 'e-c1-c2', source: 'call-start', target: 'call-end' }],
      scenarios: [
        {
          id: 'sc-call',
          name: 'Luồng gọi đi chuẩn',
          nodeIds: ['call-start', 'call-end'],
          edgeIds: ['e-c1-c2'],
        },
      ],
    },
  },
};

describe('prImpactEngine', () => {
  it('parses git diff, porcelain status, and plain paths cleanly', () => {
    const raw = [
      ' M VBot/Service/VPMAppService.swift',
      'R  old/File.kt -> app/src/main/java/com/vpmedia/vbot/ui/call/NewCallActivity.kt',
      'a/VBot/Service/VPMAppService.swift',
      'UnmappedNewFile.swift',
    ].join('\n');

    expect(parseChangedFileList(raw)).toEqual([
      'VBot/Service/VPMAppService.swift',
      'app/src/main/java/com/vpmedia/vbot/ui/call/NewCallActivity.kt',
      'UnmappedNewFile.swift',
    ]);
  });

  it('maps changed PR files to affected nodes, scenarios, and unmatched files', () => {
    const index = buildImpactIndex(MOCK_DATASET, [], [], {});
    const changed = parseChangedFileList(
      'app/src/main/java/com/vpmedia/vbot/ui/call/NewCallActivity.kt\nREADME_NEW.md',
    );
    const report = analyzePrImpact(index, changed, MOCK_DATASET);

    expect(report.matchedFiles).toEqual([
      'app/src/main/java/com/vpmedia/vbot/ui/call/NewCallActivity.kt',
    ]);
    expect(report.unmatchedFiles).toEqual(['README_NEW.md']);
    expect(report.affectedNodes.map((n) => n.node.id)).toEqual(['call-start']);
    expect(report.affectedScenarios.map((s) => s.scenario.id)).toEqual(['sc-call']);
    expect(report.affectedScenarios[0].estimatedQaCaseCount).toBe(2);

    const md = exportPrRegressionMarkdown(report);
    expect(md).toContain('Luồng gọi đi chuẩn');
    expect(md).toContain('README_NEW.md');
  });

  it('evaluates code drift statuses (missing_file, stale, fresh)', () => {
    const report = evaluateCodeDrift(MOCK_DATASET, {
      'VBot/Service/VPMAppService.swift': { exists: true, lastCommitDate: '2026-11-22' },
      'VBot/Service/CallEndService.swift': { exists: false, lastCommitDate: '2026-11-18' },
    });

    expect(report.totalCheckedNodes).toBe(2);
    expect(report.missingFileCount).toBe(1);
    expect(report.staleCount).toBe(1);
    expect(report.items[0].nodeId).toBe('call-end');
    expect(report.items[0].status).toBe('missing_file');
    expect(report.items[1].nodeId).toBe('call-start');
    expect(report.items[1].status).toBe('stale');
  });
});
