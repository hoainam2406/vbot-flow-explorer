// tests/useGraphLayout.test.ts
import { describe, expect, it } from 'vitest';
import { Position } from '@vue-flow/core';
import {
  buildRoutedEdgePath,
  computeDagreGraphLayout,
  computeDagreLayout,
  computeNodesBounds,
} from '../src/composables/useGraphLayout';
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

  it('routes bypass edges around intermediate nodes instead of cutting through them', () => {
    const nodes: FlowNodeData[] = [
      { id: 'api', label: 'Gửi lệnh chuyển ngay', kind: 'external', audience: 'tech', summary: { overview: 'API' } },
      { id: 'fallback', label: 'Fallback DTMF #1', kind: 'error', audience: 'tech', summary: { overview: 'Fallback' } },
      { id: 'done', label: 'Nhân viên cúp máy', kind: 'action', audience: 'all', summary: { overview: 'Done' } },
    ];
    const edges: FlowEdgeData[] = [
      { id: 'e-ok', source: 'api', target: 'done', label: '+OK' },
      { id: 'e-err', source: 'api', target: 'fallback', label: 'Lỗi / Timeout 5s' },
      { id: 'e-fb', source: 'fallback', target: 'done' },
    ];

    const { nodes: layoutNodes, edgeRoutes } = computeDagreGraphLayout(nodes, edges, {
      direction: 'LR',
    });
    expect(edgeRoutes['e-ok'].points.length).toBeGreaterThan(3);

    const apiNode = layoutNodes.find((n) => n.id === 'api')!;
    const fallbackNode = layoutNodes.find((n) => n.id === 'fallback')!;
    const doneNode = layoutNodes.find((n) => n.id === 'done')!;

    const routed = buildRoutedEdgePath({
      sourceX: apiNode.position.x + apiNode.data.estimatedWidth,
      sourceY: apiNode.position.y + apiNode.data.estimatedHeight / 2,
      sourcePosition: Position.Right,
      targetX: doneNode.position.x,
      targetY: doneNode.position.y + doneNode.data.estimatedHeight / 2,
      targetPosition: Position.Left,
      route: edgeRoutes['e-ok'],
    });

    const fallbackTop = fallbackNode.position.y;
    const fallbackBottom = fallbackTop + fallbackNode.data.estimatedHeight;
    expect(routed.labelY < fallbackTop || routed.labelY > fallbackBottom).toBe(true);
  });

  it('allocates enough horizontal gap for long Vietnamese decision branch labels', () => {
    const nodes: FlowNodeData[] = [
      { id: 'decision', label: 'Người nhận đồng ý tiếp nhận?', kind: 'decision', audience: 'all', summary: { overview: 'D' } },
      { id: 'confirm', label: 'Xác nhận bàn giao', kind: 'action', audience: 'all', summary: { overview: 'Y' } },
      { id: 'cancel', label: 'Hủy chuyển', kind: 'error', audience: 'all', summary: { overview: 'N' } },
    ];
    const edges: FlowEdgeData[] = [
      { id: 'e-yes', source: 'decision', target: 'confirm', label: 'Đồng ý nhận' },
      { id: 'e-no', source: 'decision', target: 'cancel', label: 'Hủy / Bận / Không nghe' },
    ];

    const { nodes: layoutNodes } = computeDagreGraphLayout(nodes, edges, { direction: 'LR' });
    const decisionNode = layoutNodes.find((n) => n.id === 'decision')!;
    const cancelNode = layoutNodes.find((n) => n.id === 'cancel')!;

    const gap = cancelNode.position.x - (decisionNode.position.x + decisionNode.data.estimatedWidth);
    expect(gap).toBeGreaterThanOrEqual(200);
  });

  it('allocates wider 250px width for miniapp representative nodes', () => {
    const nodes: FlowNodeData[] = [
      {
        id: 'ma-node',
        label: 'Mini App: Danh bạ cá nhân (vb-ma-user-contact)',
        kind: 'miniapp' as FlowNodeData['kind'],
        audience: 'tech',
        summary: { overview: 'Mini App' },
      },
    ];
    const layoutNodes = computeDagreLayout(nodes, [], { direction: 'LR' });
    expect(layoutNodes[0].data.estimatedWidth).toBe(250);
  });
});
