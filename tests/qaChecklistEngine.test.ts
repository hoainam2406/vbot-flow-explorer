// tests/qaChecklistEngine.test.ts
import { describe, expect, it } from 'vitest';
import {
  buildQaTestCasesForScenario,
  exportQaRunToCsv,
  exportQaRunToMarkdown,
  summarizeQaRun,
} from '../src/core/qaChecklistEngine';
import type { ScenarioTimelineModel } from '../src/core/scenarioFlowEngine';

const sampleTimeline: ScenarioTimelineModel = {
  scenarioId: 'sc-test',
  title: 'Test Autodial 2FA',
  mode: 'tech',
  stepEdgeIds: ['e1'],
  steps: [
    {
      index: 0,
      stepNumber: 1,
      node: {
        id: 'n1',
        label: 'Mở Autodial',
        kind: 'miniapp',
        audience: 'tech',
        summary: { overview: 'Mở chiến dịch' },
        techDetail: {
          platformDiffNote: 'iOS prewarm 600s, Android không prewarm.',
          edgeCases: ['Mất mạng khi tải danh sách'],
          byPlatform: {
            android: {
              edgeCases: ['Thiếu hotline mở BottomSheet'],
            },
          },
        },
      },
      displayLabel: 'Mở Autodial',
      summaryText: 'Mở chiến dịch',
      kind: 'miniapp',
      activityRole: 'app',
      alternativeBranches: [],
      hasPlatformDiff: true,
    },
  ],
};

describe('qaChecklistEngine', () => {
  it('generates step, edge_case, and parity test cases and respects single platform filtering', () => {
    const compareCases = buildQaTestCasesForScenario(sampleTimeline, 'compare');
    expect(compareCases.map((c) => c.category)).toEqual([
      'step',
      'edge_case',
      'edge_case',
      'parity',
    ]);

    const iosCases = buildQaTestCasesForScenario(sampleTimeline, 'ios');
    expect(iosCases.map((c) => c.category)).toEqual(['step', 'edge_case']);
    expect(iosCases.some((c) => c.title.includes('BottomSheet'))).toBe(false);
  });

  it('summarizes pass/fail/blocked counts and exports Markdown and CSV cleanly', () => {
    const cases = buildQaTestCasesForScenario(sampleTimeline, 'compare');
    const state = {
      [cases[0].id]: { ios: 'pass' as const, android: 'pass' as const, note: 'OK' },
      [cases[1].id]: { ios: 'pass' as const, android: 'fail' as const, note: 'Crash Android' },
      [cases[2].id]: { ios: 'untested' as const, android: 'blocked' as const, note: 'Chờ API' },
    };

    const summary = summarizeQaRun(cases, state, 'compare');
    expect(summary).toEqual({
      total: 4,
      pass: 1,
      fail: 1,
      blocked: 1,
      untested: 1,
    });

    const md = exportQaRunToMarkdown(sampleTimeline, cases, state, 'compare');
    expect(md).toContain('# Biên bản kiểm thử QA: Test Autodial 2FA');
    expect(md).toContain('Crash Android');

    const csv = exportQaRunToCsv(sampleTimeline, cases, state);
    expect(csv).toContain('Scenario,Case ID,Step,Category');
    expect(csv).toContain('Crash Android');
  });
});
