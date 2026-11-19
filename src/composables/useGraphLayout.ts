// src/composables/useGraphLayout.ts
import dagre from '@dagrejs/dagre';
import {
  MarkerType,
  Position,
  getSmoothStepPath,
  type Edge,
  type Node,
} from '@vue-flow/core';
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

export interface EdgePoint {
  x: number;
  y: number;
}

export interface EdgeRoute {
  points: EdgePoint[];
  labelPos?: EdgePoint;
}

export interface DagreGraphLayout {
  nodes: PositionedFlowNode[];
  edgeRoutes: Record<string, EdgeRoute>;
}

export interface RoutedEdgePathParams {
  sourceX: number;
  sourceY: number;
  sourcePosition: Position;
  targetX: number;
  targetY: number;
  targetPosition: Position;
  route?: EdgeRoute;
  borderRadius?: number;
}

export interface RoutedEdgePathResult {
  path: string;
  labelX: number;
  labelY: number;
}

export function computeDagreGraphLayout(
  flowNodes: FlowNodeData[],
  flowEdges: FlowEdgeData[],
  options: LayoutOptions = {},
): DagreGraphLayout {
  const direction = options.direction ?? 'LR';
  const showMedia = options.showCanvasMedia ?? false;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    nodesep: showMedia ? 56 : 44,
    edgesep: 38,
    ranksep: 96,
    marginx: 32,
    marginy: 32,
  });

  const dims = new Map<string, { w: number; h: number }>();
  for (const node of flowNodes) {
    const hasMedia = (node.media?.length ?? 0) > 0;
    const w = node.kind === 'module' || node.kind === 'miniapp' ? 250 : 230;
    const h = showMedia && hasMedia ? 196 : 100;
    dims.set(node.id, { w, h });
    g.setNode(node.id, { width: w, height: h });
  }

  const routedEdges: FlowEdgeData[] = [];
  for (const edge of flowEdges) {
    if (dims.has(edge.source) && dims.has(edge.target)) {
      const label = edge.label ?? '';
      const width = label ? Math.min(180, Math.max(48, Math.ceil(label.length * 6.8 + 20))) : 0;
      const height = label ? 28 : 16;
      g.setEdge(edge.source, edge.target, { width, height, labelpos: 'c' });
      routedEdges.push(edge);
    }
  }

  dagre.layout(g);

  const nodes = flowNodes.map((node) => {
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

  const edgeRoutes: Record<string, EdgeRoute> = {};
  for (const edge of routedEdges) {
    const edgeLayout = g.edge(edge.source, edge.target) as
      | { points?: EdgePoint[]; x?: number; y?: number }
      | undefined;
    if (!edgeLayout?.points) continue;
    const hasLabelPos =
      typeof edgeLayout.x === 'number' &&
      Number.isFinite(edgeLayout.x) &&
      typeof edgeLayout.y === 'number' &&
      Number.isFinite(edgeLayout.y);
    edgeRoutes[edge.id] = {
      points: edgeLayout.points.map((p) => ({ x: p.x, y: p.y })),
      ...(hasLabelPos ? { labelPos: { x: edgeLayout.x!, y: edgeLayout.y! } } : {}),
    };
  }

  return { nodes, edgeRoutes };
}

export function computeDagreLayout(
  flowNodes: FlowNodeData[],
  flowEdges: FlowEdgeData[],
  options: LayoutOptions = {},
): PositionedFlowNode[] {
  return computeDagreGraphLayout(flowNodes, flowEdges, options).nodes;
}

function cleanOrthogonalVertices(raw: EdgePoint[]): EdgePoint[] {
  const deduped: EdgePoint[] = [];
  for (const pt of raw) {
    const prev = deduped[deduped.length - 1];
    if (!prev || Math.hypot(pt.x - prev.x, pt.y - prev.y) >= 0.5) {
      deduped.push(pt);
    }
  }

  let current = deduped;
  let changed = true;
  while (changed && current.length >= 3) {
    changed = false;
    const next: EdgePoint[] = [current[0]];
    for (let i = 1; i < current.length - 1; i += 1) {
      const a = next[next.length - 1];
      const b = current[i];
      const c = current[i + 1];
      const sameHorizontal =
        Math.abs(a.y - b.y) < 0.5 &&
        Math.abs(b.y - c.y) < 0.5 &&
        (b.x - a.x) * (c.x - b.x) >= 0;
      const sameVertical =
        Math.abs(a.x - b.x) < 0.5 &&
        Math.abs(b.x - c.x) < 0.5 &&
        (b.y - a.y) * (c.y - b.y) >= 0;
      if (sameHorizontal || sameVertical) {
        changed = true;
        continue;
      }
      next.push(b);
    }
    next.push(current[current.length - 1]);
    current = next;
  }
  return current;
}

function buildRoundedPolylinePath(points: EdgePoint[], radius = 12): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  const parts: string[] = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    const len1 = Math.hypot(dx1, dy1);
    const len2 = Math.hypot(dx2, dy2);
    if (len1 < 0.5 || len2 < 0.5) {
      parts.push(`L ${curr.x} ${curr.y}`);
      continue;
    }
    const r = Math.min(radius, len1 / 2, len2 / 2);
    const p1x = curr.x - (dx1 / len1) * r;
    const p1y = curr.y - (dy1 / len1) * r;
    const p2x = curr.x + (dx2 / len2) * r;
    const p2y = curr.y + (dy2 / len2) * r;
    parts.push(`L ${p1x} ${p1y} Q ${curr.x} ${curr.y} ${p2x} ${p2y}`);
  }
  const last = points[points.length - 1];
  parts.push(`L ${last.x} ${last.y}`);
  return parts.join(' ');
}

export function buildRoutedEdgePath(params: RoutedEdgePathParams): RoutedEdgePathResult {
  const waypoints = params.route?.points ?? [];
  const needsWaypointRouting = waypoints.length > 3 || params.targetX <= params.sourceX;

  if (!needsWaypointRouting) {
    const [path, labelX, labelY] = getSmoothStepPath({
      sourceX: params.sourceX,
      sourceY: params.sourceY,
      sourcePosition: params.sourcePosition,
      targetX: params.targetX,
      targetY: params.targetY,
      targetPosition: params.targetPosition,
      borderRadius: params.borderRadius ?? 10,
    });
    return { path, labelX, labelY };
  }

  const inner =
    waypoints.length >= 3
      ? waypoints.slice(1, -1)
      : [
          {
            x: (params.sourceX + params.targetX) / 2,
            y: Math.min(params.sourceY, params.targetY) - 68,
          },
        ];

  const stub =
    params.targetX > params.sourceX
      ? Math.min(24, Math.max(8, (params.targetX - params.sourceX) / 6))
      : 24;

  const rawVertices: EdgePoint[] = [
    { x: params.sourceX, y: params.sourceY },
    { x: params.sourceX + stub, y: params.sourceY },
    { x: params.sourceX + stub, y: inner[0].y },
  ];

  for (const pt of inner.slice(1)) {
    const last = rawVertices[rawVertices.length - 1];
    if (Math.abs(pt.y - last.y) > 1) {
      const midX = (last.x + pt.x) / 2;
      rawVertices.push({ x: midX, y: last.y }, { x: midX, y: pt.y });
    }
    rawVertices.push({ x: pt.x, y: pt.y });
  }

  const endAnchor = rawVertices[rawVertices.length - 1];
  rawVertices.push(
    { x: params.targetX - stub, y: endAnchor.y },
    { x: params.targetX - stub, y: params.targetY },
    { x: params.targetX, y: params.targetY },
  );

  const vertices = cleanOrthogonalVertices(rawVertices);
  const path = buildRoundedPolylinePath(vertices, params.borderRadius ?? 12);

  let bestSeg: { start: EdgePoint; end: EdgePoint; len: number } | null = null;
  for (let i = 0; i < vertices.length - 1; i += 1) {
    const a = vertices[i];
    const b = vertices[i + 1];
    if (Math.abs(a.y - b.y) < 1) {
      const len = Math.abs(b.x - a.x);
      if (!bestSeg || len > bestSeg.len) {
        bestSeg = { start: a, end: b, len };
      }
    }
  }

  let labelX = (params.sourceX + params.targetX) / 2;
  let labelY = inner[0].y;

  if (bestSeg) {
    labelY = bestSeg.start.y;
    labelX = (bestSeg.start.x + bestSeg.end.x) / 2;
    const lp = params.route?.labelPos;
    const minX = Math.min(bestSeg.start.x, bestSeg.end.x);
    const maxX = Math.max(bestSeg.start.x, bestSeg.end.x);
    if (lp && Math.abs(lp.y - labelY) <= 4 && lp.x >= minX + 32 && lp.x <= maxX - 32) {
      labelX = lp.x;
    }
  }

  return { path, labelX, labelY };
}

export function toVueFlowEdges(
  flowEdges: FlowEdgeData[],
  highlightedEdgeIds?: Set<string>,
  dimOthers = false,
  edgeRoutes?: Record<string, EdgeRoute>,
  currentStepEdgeId?: string | null,
  upcomingEdgeIds?: Set<string>,
): Edge[] {
  const hasStepMode =
    Boolean(currentStepEdgeId) || Boolean(upcomingEdgeIds && upcomingEdgeIds.size > 0);

  return flowEdges.map((edge) => {
    const isCurrentEdge = Boolean(currentStepEdgeId && edge.id === currentStepEdgeId);
    const isHighlighted = highlightedEdgeIds?.has(edge.id) ?? false;
    const isUpcoming = Boolean(!isCurrentEdge && !isHighlighted && upcomingEdgeIds?.has(edge.id));

    const strokeColor = !dimOthers
      ? '#94a3b8'
      : isCurrentEdge || isHighlighted
        ? '#2563eb'
        : isUpcoming
          ? '#93c5fd'
          : '#cbd5e1';

    const style = !dimOthers
      ? { stroke: strokeColor, strokeWidth: 1.7 }
      : hasStepMode
        ? isCurrentEdge
          ? { stroke: strokeColor, strokeWidth: 3.2, opacity: 1 }
          : isHighlighted
            ? { stroke: strokeColor, strokeWidth: 2.4, opacity: 1 }
            : isUpcoming
              ? { stroke: strokeColor, strokeWidth: 2, opacity: 0.78 }
              : { stroke: strokeColor, strokeWidth: 1.2, opacity: 0.22 }
        : {
            stroke: strokeColor,
            strokeWidth: isHighlighted ? 2.6 : 1.3,
            opacity: isHighlighted ? 1 : 0.28,
          };

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      type: 'routed',
      animated: hasStepMode ? isCurrentEdge : isHighlighted,
      data: {
        route: edgeRoutes?.[edge.id],
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: strokeColor,
      },
      style,
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
