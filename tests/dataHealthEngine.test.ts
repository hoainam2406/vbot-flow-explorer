// tests/dataHealthEngine.test.ts
import { describe, expect, it } from 'vitest';
import { buildDataHealthReport } from '../src/core/dataHealthEngine';
import type { MergedFlowDataset } from '../src/data/schema';

describe('dataHealthEngine', () => {
  it('computes parity branch health, stale verification, and missing edge cases', () => {
    const dataset: MergedFlowDataset = {
      app: { name: 'VBot', tagline: 'Test' },
      rootNode: {
        id: 'vbot-app',
        label: 'VBot App',
        kind: 'module',
        audience: 'all',
        summary: { overview: 'Root' },
        media: [{ src: '/media/app/home.webp', caption: 'Home', audience: 'all' }],
      },
      branches: [
        {
          id: 'mod-a',
          label: 'Module A',
          kind: 'module',
          audience: 'all',
          summary: { overview: 'A' },
        },
      ],
      branchEdges: [{ id: 'e0', source: 'vbot-app', target: 'mod-a' }],
      existingMediaPaths: ['/media/app/home.webp'],
      subtreesByParentId: {
        'mod-a': {
          title: 'Sub A',
          layoutHint: 'flow',
          entryNodeIds: ['n-stale'],
          nodes: [
            {
              id: 'n-stale',
              label: 'Xử lý cũ',
              kind: 'process',
              audience: 'tech',
              summary: { overview: 'Stale' },
              meta: { lastVerifiedAt: '2026-01-01' },
              techDetail: {
                platformDiffNote: 'Khác nhẹ',
                byPlatform: { ios: { summary: 'iOS only note' } },
              },
            },
          ],
          edges: [],
        },
      },
    };

    const report = buildDataHealthReport(dataset, {
      referenceDate: '2026-11-23',
      staleThresholdDays: 60,
    });

    expect(report.mediaCoverage.present).toBe(1);
    expect(report.countsByKind.missing_edge_cases).toBe(1);
    expect(report.countsByKind.missing_by_platform).toBe(1);
    expect(report.countsByKind.stale_verified).toBe(1);
    expect(report.branchParityHealth).toHaveLength(1);
    expect(report.overallScore).toBeLessThan(100);
  });
});
