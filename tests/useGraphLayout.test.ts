// tests/useGraphLayout.test.ts
import { describe, expect, it } from 'vitest';
import { Position } from '@vue-flow/core';
import { loadMergedDataset } from '../plugins/flowDataPlugin';
import { buildVisibleTreeFlow } from '../src/core/graphEngine';
import {
  buildRoutedEdgePath,
  computeDagreGraphLayout,
  computeDagreLayout,
  computeNodesBounds,
  toVueFlowEdges,
} from '../src/composables/useGraphLayout';
import type { FlowEdgeData, FlowNodeData, NodeKind } from '../src/data/schema';

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

  it('routes TB bypass edges around intermediate nodes instead of cutting through them', () => {
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
      direction: 'TB',
    });
    expect(edgeRoutes['e-ok'].points.length).toBeGreaterThan(3);

    const apiNode = layoutNodes.find((n) => n.id === 'api')!;
    const fallbackNode = layoutNodes.find((n) => n.id === 'fallback')!;
    const doneNode = layoutNodes.find((n) => n.id === 'done')!;

    const routed = buildRoutedEdgePath({
      sourceX: apiNode.position.x + apiNode.data.estimatedWidth / 2,
      sourceY: apiNode.position.y + apiNode.data.estimatedHeight,
      sourcePosition: Position.Bottom,
      targetX: doneNode.position.x + doneNode.data.estimatedWidth / 2,
      targetY: doneNode.position.y,
      targetPosition: Position.Top,
      route: edgeRoutes['e-ok'],
    });

    const fallbackLeft = fallbackNode.position.x;
    const fallbackRight = fallbackLeft + fallbackNode.data.estimatedWidth;
    expect(routed.labelX < fallbackLeft || routed.labelX > fallbackRight).toBe(true);
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

  it('preserves sibling definition order in pure tree layouts (LR and TB)', () => {
    const nodes: FlowNodeData[] = [
      { id: 'root', label: 'Root', kind: 'module', audience: 'all', summary: { overview: 'R' } },
      { id: 'c1', label: 'Child 1', kind: 'action', audience: 'all', summary: { overview: '1' } },
      { id: 'c2', label: 'Child 2', kind: 'action', audience: 'all', summary: { overview: '2' } },
      { id: 'c3', label: 'Child 3', kind: 'action', audience: 'all', summary: { overview: '3' } },
      { id: 'c4', label: 'Child 4', kind: 'action', audience: 'all', summary: { overview: '4' } },
    ];
    const edges: FlowEdgeData[] = [
      { id: 'e1', source: 'root', target: 'c1' },
      { id: 'e2', source: 'root', target: 'c2' },
      { id: 'e3', source: 'root', target: 'c3' },
      { id: 'e4', source: 'root', target: 'c4' },
    ];

    const lrLayout = computeDagreLayout(nodes, edges, { direction: 'LR' });
    const lrOrder = ['c1', 'c2', 'c3', 'c4'].map((id) => lrLayout.find((n) => n.id === id)!.position.y);
    expect(lrOrder[0]).toBeLessThan(lrOrder[1]);
    expect(lrOrder[1]).toBeLessThan(lrOrder[2]);
    expect(lrOrder[2]).toBeLessThan(lrOrder[3]);

    const tbLayout = computeDagreLayout(nodes, edges, { direction: 'TB' });
    const tbOrder = ['c1', 'c2', 'c3', 'c4'].map((id) => tbLayout.find((n) => n.id === id)!.position.x);
    expect(tbOrder[0]).toBeLessThan(tbOrder[1]);
    expect(tbOrder[1]).toBeLessThan(tbOrder[2]);
    expect(tbOrder[2]).toBeLessThan(tbOrder[3]);
  });

  it('keeps branch and Mini App ordering consistent before and after expanding ma-autodial', () => {
    const dataset = loadMergedDataset(process.cwd());
    const expectedBranches = dataset.branches.map((b) => b.id);
    const expectedCallKids = dataset.subtreesByParentId['hub-cat-call-mgmt'].nodes.map((n) => n.id);

    const states = [
      new Set<string>(),
      new Set(['mod-miniapp-hub', 'miniapp-list', 'hub-cat-call-mgmt']),
      new Set(['mod-miniapp-hub', 'miniapp-list', 'hub-cat-call-mgmt', 'ma-autodial']),
    ];

    for (const expanded of states) {
      const flow = buildVisibleTreeFlow(dataset, expanded, 'tech', null, 'compare');
      const layout = computeDagreLayout(flow.nodes, flow.edges, { direction: 'LR' });
      const posById = new Map(layout.map((n) => [n.id, n.position]));

      const actualBranches = [...expectedBranches].sort(
        (a, b) => posById.get(a)!.y - posById.get(b)!.y,
      );
      expect(actualBranches).toEqual(expectedBranches);

      if (expanded.has('hub-cat-call-mgmt')) {
        const actualCallKids = [...expectedCallKids].sort(
          (a, b) => posById.get(a)!.y - posById.get(b)!.y,
        );
        expect(actualCallKids).toEqual(expectedCallKids);
      }
    }
  });

  it('routes vertical TB edges when targetX < sourceX without horizontal back-edge wrap and styles dark/semantic/lineage edges', () => {
    const verticalForward = buildRoutedEdgePath({
      sourceX: 300,
      sourceY: 120,
      sourcePosition: Position.Bottom,
      targetX: 120,
      targetY: 280,
      targetPosition: Position.Top,
    });
    expect(verticalForward.path).toContain('M300');
    expect(verticalForward.labelY).toBe(200);

    const verticalBack = buildRoutedEdgePath({
      sourceX: 200,
      sourceY: 320,
      sourcePosition: Position.Bottom,
      targetX: 150,
      targetY: 100,
      targetPosition: Position.Top,
      route: {
        points: [
          { x: 200, y: 320 },
          { x: 340, y: 260 },
          { x: 340, y: 180 },
          { x: 150, y: 100 },
        ],
      },
    });
    expect(verticalBack.labelX).toBe(340);

    const edges: FlowEdgeData[] = [
      { id: 'e-norm', source: 'n1', target: 'n2' },
      { id: 'e-mini', source: 'n1', target: 'n3' },
      { id: 'e-err', source: 'n1', target: 'n4' },
    ];
    const kindMap = new Map<string, NodeKind>([
      ['n1', 'module'],
      ['n2', 'action'],
      ['n3', 'miniapp'],
      ['n4', 'error'],
    ]);

    const darkIdle = toVueFlowEdges(edges, undefined, false, undefined, null, undefined, {
      isDark: true,
      nodeKindById: kindMap,
    });
    expect((darkIdle[0].style as Record<string, unknown>).stroke).toBe('#475569');
    expect((darkIdle[1].style as Record<string, unknown>).stroke).toBe('#22d3ee');
    expect((darkIdle[2].style as Record<string, unknown>).stroke).toBe('#fb7185');
    expect((darkIdle[2].style as Record<string, unknown>).strokeDasharray).toBe('5 4');

    const lineageHighlighted = toVueFlowEdges(
      edges,
      undefined,
      false,
      undefined,
      null,
      undefined,
      {
        isDark: true,
        nodeKindById: kindMap,
        lineageEdgeIds: new Set(['e-mini']),
      },
    );
    expect((lineageHighlighted[1].data as { pulse?: boolean; glow?: boolean }).pulse).toBe(true);
    expect((lineageHighlighted[0].style as Record<string, unknown>).opacity).toBe(0.22);
  });
});
