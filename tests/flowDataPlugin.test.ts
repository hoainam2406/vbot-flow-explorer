// tests/flowDataPlugin.test.ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectTechOnlyMediaPaths, hasRealMediaFiles } from '../plugins/flowDataPlugin';
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

  it('detects whether any referenced media files actually exist under public/', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vbot-media-test-'));
    try {
      const publicMediaDir = path.join(tmpRoot, 'public', 'media', 'app');
      fs.mkdirSync(publicMediaDir, { recursive: true });

      const dataset: MergedFlowDataset = {
        app: { name: 'VBot', tagline: 'Test' },
        rootNode: {
          id: 'root',
          label: 'Root',
          kind: 'module',
          audience: 'all',
          summary: { overview: 'R' },
          media: [
            { src: '/media/app/vbot-home.webp', caption: 'Home', audience: 'all' },
            { src: '../../package.json', caption: 'Outside traversal' },
          ],
        },
        branches: [],
        branchEdges: [],
        subtreesByParentId: {},
      };

      expect(hasRealMediaFiles(tmpRoot, dataset)).toBe(false);

      fs.writeFileSync(path.join(publicMediaDir, 'vbot-home.webp'), 'stub-webp');
      expect(hasRealMediaFiles(tmpRoot, dataset)).toBe(true);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
