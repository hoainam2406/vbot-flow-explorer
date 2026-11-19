// tests/useGraphLayout.test.ts
import { describe, expect, it } from 'vitest';
import { computeDagreLayout, computeNodesBounds } from '../src/composables/useGraphLayout';
import type { FlowEdgeData, FlowNodeData } from '../src/data/schema';

describe('computeDagreLayout', () => {
  it('places child nodes to the right of root in LR direction and expands height when media shown', () => {
    const nodes: FlowNodeData[] = [
      { id: 'root', label: 'Root', kind: 'module', audience: 'all', summary: { overview: 'R' } },
      {
        id: 'child',
        label: 'Child',
        kind: 'action',
        audience: 'all',
        summary: { overview: 'C' },
        media: [{ src: '/media/x.webp', caption: 'Screen' }],
      },
    ];
    const edges: FlowEdgeData[] = [{ id: 'e1', source: 'root', target: 'child' }];

    const compact = computeDagreLayout(nodes, edges, { showCanvasMedia: false, direction: 'LR' });
    const withMedia = computeDagreLayout(nodes, edges, { showCanvasMedia: true, direction: 'LR' });

    expect(compact[1].position.x).toBeGreaterThan(compact[0].position.x);
    expect(withMedia[1].data.estimatedHeight).toBeGreaterThan(compact[1].data.estimatedHeight);
  });

  it('computes bounding rect for a filtered subset of nodes or all nodes', () => {
    const nodes: FlowNodeData[] = [
      { id: 'root', label: 'Root', kind: 'module', audience: 'all', summary: { overview: 'R' } },
      { id: 'child', label: 'Child', kind: 'action', audience: 'all', summary: { overview: 'C' } },
    ];
    const edges: FlowEdgeData[] = [{ id: 'e1', source: 'root', target: 'child' }];
    const layoutNodes = computeDagreLayout(nodes, edges, { showCanvasMedia: false, direction: 'LR' });

    const childOnly = computeNodesBounds(layoutNodes, ['child']);
    expect(childOnly).toEqual({
      x: layoutNodes[1].position.x,
      y: layoutNodes[1].position.y,
      width: layoutNodes[1].data.estimatedWidth,
      height: layoutNodes[1].data.estimatedHeight,
    });

    const allBounds = computeNodesBounds(layoutNodes, null);
    expect(allBounds).toEqual({
      x: layoutNodes[0].position.x,
      y: Math.min(layoutNodes[0].position.y, layoutNodes[1].position.y),
      width:
        layoutNodes[1].position.x +
        layoutNodes[1].data.estimatedWidth -
        layoutNodes[0].position.x,
      height:
        Math.max(
          layoutNodes[0].position.y + layoutNodes[0].data.estimatedHeight,
          layoutNodes[1].position.y + layoutNodes[1].data.estimatedHeight,
        ) - Math.min(layoutNodes[0].position.y, layoutNodes[1].position.y),
    });
  });
});
