// src/composables/useGraphLayout.ts
import dagre from '@dagrejs/dagre';
import { MarkerType, Position, type Edge, type Node } from '@vue-flow/core';
import type { FlowEdgeData, FlowNodeData } from '../data/schema';

export interface LayoutOptions {
  direction?: 'LR' | 'TB';
  showCanvasMedia?: boolean;
}

export interface BoundingRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PositionedFlowNodeData = FlowNodeData & {
  estimatedWidth: number;
  estimatedHeight: number;
};

export interface PositionedFlowNode extends Node<PositionedFlowNodeData> {
  data: PositionedFlowNodeData;
}

export function computeDagreLayout(
  flowNodes: FlowNodeData[],
  flowEdges: FlowEdgeData[],
  options: LayoutOptions = {},
): PositionedFlowNode[] {
  const direction = options.direction ?? 'LR';
  const showMedia = options.showCanvasMedia ?? false;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    nodesep: showMedia ? 48 : 34,
    ranksep: 90,
    marginx: 32,
    marginy: 32,
  });

  const dims = new Map<string, { w: number; h: number }>();
  for (const node of flowNodes) {
    const hasMedia = (node.media?.length ?? 0) > 0;
    const w = node.kind === 'module' ? 250 : 230;
    const h = showMedia && hasMedia ? 186 : 86;
    dims.set(node.id, { w, h });
    g.setNode(node.id, { width: w, height: h });
  }

  for (const edge of flowEdges) {
    if (dims.has(edge.source) && dims.has(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  }

  dagre.layout(g);

  return flowNodes.map((node) => {
    const pos = g.node(node.id);
    const { w, h } = dims.get(node.id)!;
    return {
      id: node.id,
      type: 'appFlow',
      position: { x: pos.x - w / 2, y: pos.y - h / 2 },
      sourcePosition: direction === 'LR' ? Position.Right : Position.Bottom,
      targetPosition: direction === 'LR' ? Position.Left : Position.Top,
      data: {
        ...node,
        estimatedWidth: w,
        estimatedHeight: h,
      },
    };
  });
}

export function toVueFlowEdges(
  flowEdges: FlowEdgeData[],
  highlightedEdgeIds?: Set<string>,
  dimOthers = false,
): Edge[] {
  return flowEdges.map((edge) => {
    const isHighlighted = highlightedEdgeIds?.has(edge.id) ?? false;
    const strokeColor = dimOthers
      ? isHighlighted
        ? '#2563eb'
        : '#cbd5e1'
      : '#94a3b8';

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      type: 'smoothstep',
      animated: isHighlighted,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: strokeColor,
      },
      labelShowBg: true,
      labelBgPadding: [6, 3],
      labelBgBorderRadius: 4,
      labelBgStyle: {
        fill: '#ffffff',
        fillOpacity: 0.92,
      },
      labelStyle: {
        fontSize: '11px',
        fill: '#334155',
        fontWeight: 500,
      },
      style: dimOthers
        ? {
            stroke: strokeColor,
            strokeWidth: isHighlighted ? 2.6 : 1.3,
            opacity: isHighlighted ? 1 : 0.28,
          }
        : { stroke: strokeColor, strokeWidth: 1.7 },
    };
  });
}

export function computeNodesBounds(
  nodes: PositionedFlowNode[],
  targetIds?: ReadonlyArray<string> | ReadonlySet<string> | null,
): BoundingRect | null {
  const idSet: ReadonlySet<string> | null = targetIds
    ? Array.isArray(targetIds)
      ? new Set(targetIds)
      : (targetIds as ReadonlySet<string>)
    : null;
  const candidates =
    idSet && idSet.size > 0 ? nodes.filter((node) => idSet.has(node.id)) : nodes;
  if (candidates.length === 0) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const node of candidates) {
    const x1 = node.position.x;
    const y1 = node.position.y;
    const x2 = x1 + node.data.estimatedWidth;
    const y2 = y1 + node.data.estimatedHeight;
    if (x1 < minX) minX = x1;
    if (y1 < minY) minY = y1;
    if (x2 > maxX) maxX = x2;
    if (y2 > maxY) maxY = y2;
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}
