// tests/flowSnapshotDiff.test.ts
import { describe, expect, it } from 'vitest';
import {
  createDatasetSnapshot,
  diffDatasets,
  exportSnapshotDiffChangelogMarkdown,
  parseDatasetSnapshotJson,
} from '../src/core/flowSnapshotDiff';
import type { MergedFlowDataset } from '../src/data/schema';

const BASE_DS: MergedFlowDataset = {
  app: { name: 'VBot', tagline: 'Test', version: '2.0' },
  rootNode: {
    id: 'vbot-app',
    label: 'VBot App',
    kind: 'module',
    audience: 'all',
    summary: { overview: 'Root' },
  },
  branches: [
    {
      id: 'mod-a',
      label: 'Nhánh A',
      kind: 'module',
      audience: 'all',
      summary: { overview: 'A' },
    },
  ],
  branchEdges: [{ id: 'e0', source: 'vbot-app', target: 'mod-a' }],
  subtreesByParentId: {
    'mod-a': {
      title: 'A',
      layoutHint: 'flow',
      entryNodeIds: ['n1'],
      nodes: [
        { id: 'n1', label: 'Bước 1', kind: 'action', audience: 'all', summary: { overview: '1' } },
        { id: 'n2', label: 'Bước 2', kind: 'process', audience: 'tech', summary: { overview: '2' } },
      ],
      edges: [{ id: 'e12', source: 'n1', target: 'n2' }],
    },
  },
};

describe('flowSnapshotDiff', () => {
  it('serializes snapshots, diffs added/modified/removed items, and exports business+tech changelog', () => {
    const snap = createDatasetSnapshot(BASE_DS, 'Release 2.0');
    const parsed = parseDatasetSnapshotJson(JSON.stringify(snap));
    expect(parsed.ok).toBe(true);

    const nextDs: MergedFlowDataset = JSON.parse(JSON.stringify(BASE_DS)) as MergedFlowDataset;
    nextDs.subtreesByParentId['mod-a'].nodes = [
      {
        id: 'n1',
        label: 'Bước 1 (Cập nhật nghiệp vụ)',
        kind: 'action',
        audience: 'all',
        summary: { overview: '1' },
      },
      {
        id: 'n3',
        label: 'Bước 3 mới',
        kind: 'miniapp',
        audience: 'tech',
        summary: { overview: '3' },
      },
    ];
    nextDs.subtreesByParentId['mod-a'].edges = [{ id: 'e13', source: 'n1', target: 'n3' }];

    const report = diffDatasets(BASE_DS, nextDs, {
      baseLabel: 'v2.0',
      currentLabel: 'v2.1',
    });

    expect(report.summary.nodesAdded).toBe(1);
    expect(report.summary.nodesModified).toBe(1);
    expect(report.summary.nodesRemoved).toBe(1);
    expect(report.summary.edgesAdded).toBe(1);
    expect(report.summary.edgesRemoved).toBe(1);

    const md = exportSnapshotDiffChangelogMarkdown(report);
    expect(md).toContain('Thay đổi Nghiệp vụ');
    expect(md).toContain('Thay đổi Kỹ thuật & Parity');
    expect(md).toContain('Bước 1 (Cập nhật nghiệp vụ)');
    expect(md).toContain('Bước 3 mới');
  });
});
