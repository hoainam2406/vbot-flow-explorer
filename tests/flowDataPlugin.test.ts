// tests/flowDataPlugin.test.ts
import { describe, expect, it } from 'vitest';
import { collectTechOnlyMediaPaths } from '../plugins/flowDataPlugin';
import type { MergedFlowDataset } from '../src/data/schema';

describe('collectTechOnlyMediaPaths', () => {
  it('excludes media paths also referenced by audience=all items', () => {
    const dataset: MergedFlowDataset = {
      app: { name: 'VBot', tagline: 'Test' },
      rootNode: {
        id: 'root',
        label: 'Root',
        kind: 'module',
        audience: 'all',
        summary: { overview: 'R' },
        media: [
          { src: '/media/shared.webp', caption: 'Shared', audience: 'all' },
          { src: '/media/tech-only.webp', caption: 'Tech', audience: 'tech' },
        ],
      },
      branches: [
        {
          id: 'b-tech',
          label: 'Tech Branch',
          kind: 'process',
          audience: 'tech',
          summary: { overview: 'T' },
          media: [{ src: '/media/shared.webp', caption: 'Also shared' }],
        },
      ],
      branchEdges: [],
      subtreesByParentId: {},
    };

    const paths = collectTechOnlyMediaPaths(dataset);
    expect(paths).toEqual(['/media/tech-only.webp']);
  });

  it('collects media inside nested tech node subtrees as tech-only', () => {
    const dataset: MergedFlowDataset = {
      app: { name: 'VBot', tagline: 'Test' },
      rootNode: {
        id: 'root',
        label: 'Root',
        kind: 'module',
        audience: 'all',
        summary: { overview: 'R' },
      },
      branches: [
        {
          id: 'b-all',
          label: 'Public Branch',
          kind: 'module',
          audience: 'all',
          summary: { overview: 'P' },
        },
      ],
      branchEdges: [],
      subtreesByParentId: {
        'b-all': {
          title: 'Sub',
          layoutHint: 'flow',
          entryNodeIds: ['n-tech'],
          nodes: [
            {
              id: 'n-tech',
              label: 'Tech Parent',
              kind: 'process',
              audience: 'tech',
              summary: { overview: 'T' },
            },
          ],
          edges: [],
        },
        'n-tech': {
          title: 'Nested under tech',
          layoutHint: 'flow',
          entryNodeIds: ['n-deep'],
          nodes: [
            {
              id: 'n-deep',
              label: 'Deep Child',
              kind: 'action',
              audience: 'all',
              summary: { overview: 'D' },
              media: [{ src: '/media/nested-tech.webp', caption: 'Hidden by parent' }],
            },
          ],
          edges: [],
        },
      },
    };

    expect(collectTechOnlyMediaPaths(dataset)).toEqual(['/media/nested-tech.webp']);
  });
});
