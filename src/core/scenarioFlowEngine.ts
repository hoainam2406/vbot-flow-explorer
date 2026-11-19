// src/core/scenarioFlowEngine.ts
import type {
  FlowEdgeData,
  FlowNodeData,
  NodeKind,
  Platform,
  Scenario,
} from '../data/schema';
import {
  getEdgeDisplayLabel,
  getNodeDisplayLabel,
  type ViewMode,
  type VisibleFlowResult,
} from './graphEngine';
import {
  ACTIVITY_ROLE_META,
  escapeXml,
  NODE_KIND_STYLE_META,
  resolveActivityRole,
  SVG_FONT_FAMILY,
  wrapSvgText,
  type ScenarioActivityRole,
} from './svgHelpers';

const ALLOW_TECH_RUNTIME =
  typeof __ENABLE_TECH_MODE__ === 'boolean' ? __ENABLE_TECH_MODE__ : true;

export interface ScenarioAlternativeBranch {
  edgeId: string;
  guardLabel?: string;
  targetNodeId: string;
  targetLabel: string;
  targetKind: NodeKind;
  targetStepIndex?: number;
  targetScenarioId?: string;
  targetScenarioName?: string;
}

export interface ScenarioStep {
  index: number;
  stepNumber: number;
  node: FlowNodeData;
  displayLabel: string;
  summaryText: string;
  kind: NodeKind;
  activityRole: ScenarioActivityRole;
  incomingEdgeId?: string;
  incomingEdgeLabel?: string;
  outgoingEdgeId?: string;
  outgoingEdgeLabel?: string;
  alternativeBranches: ScenarioAlternativeBranch[];
  hasPlatformDiff: boolean;
  platformTag?: Platform;
}

export interface ScenarioTimelineModel {
  scenarioId: string;
  title: string;
  description?: string;
  mode: ViewMode;
  steps: ScenarioStep[];
  stepEdgeIds: string[];
}

function findConnectingEdge(
  edges: FlowEdgeData[],
  preferredEdgeIds: Set<string>,
  sourceId: string,
  targetId: string,
): FlowEdgeData | undefined {
  return (
    edges.find(
      (edge) =>
        preferredEdgeIds.has(edge.id) &&
        edge.source === sourceId &&
        edge.target === targetId,
    ) ??
    edges.find((edge) => edge.source === sourceId && edge.target === targetId)
  );
}

function hasNodePlatformDiff(node: FlowNodeData): boolean {
  if (!ALLOW_TECH_RUNTIME) return false;
  const detail = node.techDetail;
  if (!detail) return false;
  return Boolean(
    detail.platformDiffNote ||
      detail.byPlatform?.android ||
      detail.miniAppBridge?.messages.some(
        (msg) => msg.hostFnByPlatform?.android || msg.parityNote,
      ),
  );
}

function findAlternativeScenario(
  currentScenarioId: string,
  sourceNodeId: string,
  edge: FlowEdgeData,
  activeScenarios: Scenario[],
): Scenario | undefined {
  return (
    activeScenarios.find(
      (sc) => sc.id !== currentScenarioId && sc.edgeIds.includes(edge.id),
    ) ??
    activeScenarios.find(
      (sc) =>
        sc.id !== currentScenarioId &&
        sc.nodeIds.includes(sourceNodeId) &&
        sc.nodeIds.includes(edge.target),
    ) ??
    activeScenarios.find(
      (sc) => sc.id !== currentScenarioId && sc.nodeIds.includes(edge.target),
    )
  );
}

/**
 * Build an ordered step timeline for a scenario against the currently visible
 * (filtered and bridged) flow graph so Public overview seamlessly bridges over
 * hidden technical nodes while Tech mode preserves full step details.
 */
export function buildScenarioTimeline(
  scenario: Scenario,
  visibleFlow: VisibleFlowResult,
  mode: ViewMode,
): ScenarioTimelineModel {
  const effectiveMode: ViewMode = ALLOW_TECH_RUNTIME ? mode : 'overview';
  const nodeMap = new Map(visibleFlow.nodes.map((node) => [node.id, node]));
  const preferredEdgeIds = new Set(scenario.edgeIds);

  const visibleNodes: FlowNodeData[] = [];
  for (const id of scenario.nodeIds) {
    const found = nodeMap.get(id);
    if (found) {
      visibleNodes.push(found);
    }
  }

  const stepIndexByNodeId = new Map(visibleNodes.map((n, i) => [n.id, i]));
  const connectingEdges: Array<FlowEdgeData | undefined> = [];
  const stepEdgeIds: string[] = [];

  for (let i = 1; i < visibleNodes.length; i += 1) {
    const edge = findConnectingEdge(
      visibleFlow.edges,
      preferredEdgeIds,
      visibleNodes[i - 1].id,
      visibleNodes[i].id,
    );
    connectingEdges.push(edge);
    if (edge) {
      stepEdgeIds.push(edge.id);
    }
  }

  const isTechMode = ALLOW_TECH_RUNTIME && effectiveMode === 'tech';

  const steps: ScenarioStep[] = visibleNodes.map((node, index) => {
    const inEdge = index > 0 ? connectingEdges[index - 1] : undefined;
    const outEdge = index < connectingEdges.length ? connectingEdges[index] : undefined;
    const incomingEdgeLabel = inEdge
      ? getEdgeDisplayLabel(inEdge, effectiveMode)
      : undefined;
    const outgoingEdgeLabel = outEdge
      ? getEdgeDisplayLabel(outEdge, effectiveMode)
      : undefined;

    const summaryText =
      isTechMode && node.summary.tech ? node.summary.tech : node.summary.overview;
    const platformTag =
      isTechMode && node.platforms?.length === 1 ? node.platforms[0] : undefined;

    const alternativeBranches: ScenarioAlternativeBranch[] = [];
    if (index < visibleNodes.length - 1 || node.kind === 'decision') {
      const nextNodeId =
        index < visibleNodes.length - 1 ? visibleNodes[index + 1].id : undefined;
      const seenTargets = new Set<string>();
      for (const edge of visibleFlow.edges) {
        if (
          edge.source !== node.id ||
          edge.target === nextNodeId ||
          edge.target === node.id ||
          seenTargets.has(edge.target)
        ) {
          continue;
        }
        const targetNode = nodeMap.get(edge.target);
        if (!targetNode) continue;
        seenTargets.add(edge.target);

        const targetLabel = getNodeDisplayLabel(targetNode, effectiveMode);
        const guardLabel = getEdgeDisplayLabel(edge, effectiveMode);
        const targetStepIndex = stepIndexByNodeId.get(edge.target);
        const altScenario =
          targetStepIndex === undefined
            ? findAlternativeScenario(
                scenario.id,
                node.id,
                edge,
                visibleFlow.activeScenarios,
              )
            : undefined;

        alternativeBranches.push({
          edgeId: edge.id,
          ...(guardLabel ? { guardLabel } : {}),
          targetNodeId: edge.target,
          targetLabel,
          targetKind: targetNode.kind,
          ...(targetStepIndex !== undefined ? { targetStepIndex } : {}),
          ...(altScenario
            ? {
                targetScenarioId: altScenario.id,
                targetScenarioName: altScenario.name,
              }
            : {}),
        });
      }
    }

    return {
      index,
      stepNumber: index + 1,
      node,
      displayLabel: getNodeDisplayLabel(node, effectiveMode),
      summaryText,
      kind: node.kind,
      activityRole: resolveActivityRole(node.kind),
      ...(inEdge ? { incomingEdgeId: inEdge.id } : {}),
      ...(incomingEdgeLabel ? { incomingEdgeLabel } : {}),
      ...(outEdge ? { outgoingEdgeId: outEdge.id } : {}),
      ...(outgoingEdgeLabel ? { outgoingEdgeLabel } : {}),
      alternativeBranches,
      hasPlatformDiff: isTechMode ? hasNodePlatformDiff(node) : false,
      ...(platformTag ? { platformTag } : {}),
    };
  });

  return {
    scenarioId: scenario.id,
    title: scenario.name,
    ...(scenario.description ? { description: scenario.description } : {}),
    mode: effectiveMode,
    steps,
    stepEdgeIds,
  };
}

function formatDecisionLabel(label: string, isDecision: boolean): string {
  const clean = label.trim();
  if (!isDecision || !clean || clean.startsWith('[')) return clean;
  return `[${clean}]`;
}

function appendStepConnectorSvg(
  parts: string[],
  step: ScenarioStep,
  cardX: number,
  cardW: number,
  centerX: number,
  lineY1: number,
  lineY2: number,
  connectorH: number,
): void {
  parts.push(
    `<line x1="${centerX}" y1="${lineY1}" x2="${centerX}" y2="${lineY2}" stroke="#2563eb" stroke-width="2" marker-end="url(#flow-arrow)" />`,
  );

  const alts = step.alternativeBranches;
  if (alts.length === 0) {
    if (step.outgoingEdgeLabel) {
      const formatted = formatDecisionLabel(
        step.outgoingEdgeLabel,
        step.kind === 'decision',
      );
      const pillText = wrapSvgText(formatted, 46, 1)[0] ?? '';
      const pillW = Math.min(340, Math.max(92, Math.ceil(pillText.length * 6.5 + 24)));
      const pillX = centerX - pillW / 2;
      const pillY = lineY1 + Math.round((connectorH - 22) / 2);
      parts.push(
        `<rect x="${pillX}" y="${pillY}" width="${pillW}" height="22" rx="11" fill="#ffffff" stroke="#93c5fd" stroke-width="1.2" />`,
        `<text x="${centerX}" y="${pillY + 14.5}" font-family="${SVG_FONT_FAMILY}" font-size="10.5" font-weight="600" fill="#1e40af" text-anchor="middle">${escapeXml(pillText)}</text>`,
      );
    }
    return;
  }

  if (step.outgoingEdgeLabel) {
    const formatted = formatDecisionLabel(
      step.outgoingEdgeLabel,
      step.kind === 'decision',
    );
    const pillText = wrapSvgText(formatted, 42, 1)[0] ?? '';
    const maxLeftW = centerX - 14 - cardX;
    const pillW = Math.min(maxLeftW, Math.max(92, Math.ceil(pillText.length * 6.5 + 24)));
    const pillX = centerX - 14 - pillW;
    const pillY = lineY1 + Math.round((connectorH - 22) / 2);
    parts.push(
      `<rect x="${pillX}" y="${pillY}" width="${pillW}" height="22" rx="11" fill="#ffffff" stroke="#93c5fd" stroke-width="1.2" />`,
      `<text x="${pillX + pillW / 2}" y="${pillY + 14.5}" font-family="${SVG_FONT_FAMILY}" font-size="10.5" font-weight="600" fill="#1e40af" text-anchor="middle">${escapeXml(pillText)}</text>`,
    );
  }

  const boxX = centerX + 32;
  const boxW = cardX + cardW - boxX;
  alts.forEach((alt, altIdx) => {
    const boxY = lineY1 + 16 + altIdx * 42;
    const forkY = boxY + 17;
    const dotFill = NODE_KIND_STYLE_META[alt.targetKind].badgeBg;
    const altTextRaw = alt.guardLabel
      ? `[${alt.guardLabel}] → ${alt.targetLabel}`
      : `→ ${alt.targetLabel}`;
    const altText = wrapSvgText(altTextRaw, 44, 1)[0] ?? '';

    parts.push(
      `<line x1="${centerX}" y1="${forkY}" x2="${centerX + 28}" y2="${forkY}" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4 3" marker-end="url(#flow-alt-arrow)" />`,
      `<rect x="${boxX}" y="${boxY}" width="${boxW}" height="34" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.2" stroke-dasharray="4 3" />`,
      `<circle cx="${boxX + 12}" cy="${forkY}" r="3.5" fill="${dotFill}" />`,
      `<text x="${boxX + 22}" y="${forkY + 4}" font-family="${SVG_FONT_FAMILY}" font-size="10.5" font-weight="600" fill="#475569">${escapeXml(altText)}</text>`,
    );
  });
}

/**
 * Render a standalone vertical UML Activity Diagram SVG for a scenario
 * without DOM dependencies so it works uniformly for export and Vitest.
 */
export function renderScenarioFlowchartSvg(model: ScenarioTimelineModel): string {
  const width = 820;
  const headerH = 68;
  const cardX = 48;
  const cardW = 724;
  const centerX = 410;
  const cardH = 108;
  const startBlockH = 52;

  const stepCount = model.steps.length;
  const startTop = headerH + 20;
  const connectorHeights: number[] = [];
  for (let i = 0; i < stepCount - 1; i += 1) {
    const alts = model.steps[i].alternativeBranches;
    connectorHeights.push(alts.length > 0 ? Math.max(66, 24 + alts.length * 42) : 44);
  }

  const lastStep = stepCount > 0 ? model.steps[stepCount - 1] : undefined;
  const endConnectorH =
    lastStep && lastStep.kind === 'decision' && lastStep.alternativeBranches.length > 0
      ? Math.max(66, 24 + lastStep.alternativeBranches.length * 42)
      : 38;

  const stepYs: number[] = [];
  let cursorY = startTop + startBlockH;
  for (let i = 0; i < stepCount; i += 1) {
    stepYs.push(cursorY);
    if (i < stepCount - 1) {
      cursorY += cardH + connectorHeights[i];
    }
  }

  const endNodeY =
    stepCount > 0
      ? stepYs[stepCount - 1] + cardH + endConnectorH
      : startTop + startBlockH + 40;
  const height = endNodeY + 34;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<defs>`,
    `<marker id="flow-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">`,
    `<path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#2563eb" />`,
    `</marker>`,
    `<marker id="flow-alt-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto">`,
    `<path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#94a3b8" />`,
    `</marker>`,
    `</defs>`,
    `<rect width="${width}" height="${height}" fill="#f8fafc" />`,
    `<rect x="0" y="0" width="${width}" height="${headerH}" fill="#ffffff" />`,
    `<line x1="0" y1="${headerH}" x2="${width}" y2="${headerH}" stroke="#e2e8f0" stroke-width="1" />`,
    `<rect x="20" y="18" width="32" height="32" rx="9" fill="#4f46e5" />`,
    `<text x="36" y="39" font-family="${SVG_FONT_FAMILY}" font-size="15" font-weight="800" fill="#ffffff" text-anchor="middle">V</text>`,
    `<text x="64" y="33" font-family="${SVG_FONT_FAMILY}" font-size="14" font-weight="700" fill="#0f172a">${escapeXml(wrapSvgText(model.title, 62, 1)[0] ?? '')}</text>`,
  ];

  if (model.description) {
    const descLine = wrapSvgText(model.description, 68, 1)[0] ?? '';
    parts.push(
      `<text x="64" y="51" font-family="${SVG_FONT_FAMILY}" font-size="11" font-weight="500" fill="#64748b">${escapeXml(descLine)}</text>`,
    );
  }

  const countLabel = `Biểu đồ hoạt động • ${stepCount} bước`;
  const badgeW = Math.max(176, Math.ceil(countLabel.length * 6.3 + 22));
  const badgeX = width - badgeW - 20;
  parts.push(
    `<rect x="${badgeX}" y="22" width="${badgeW}" height="24" rx="12" fill="#eff6ff" stroke="#bfdbfe" stroke-width="1" />`,
    `<text x="${badgeX + badgeW / 2}" y="38" font-family="${SVG_FONT_FAMILY}" font-size="11" font-weight="700" fill="#1d4ed8" text-anchor="middle">${escapeXml(countLabel)}</text>`,
  );

  // UML Initial Node (Bắt đầu)
  const startNodeY = startTop + 14;
  const firstTargetY = (stepCount > 0 ? stepYs[0] : endNodeY - 15) - 4;
  parts.push(
    `<circle cx="${centerX}" cy="${startNodeY}" r="13" fill="#e2e8f0" />`,
    `<circle cx="${centerX}" cy="${startNodeY}" r="9" fill="#0f172a" />`,
    `<text x="${centerX + 20}" y="${startNodeY + 4}" font-family="${SVG_FONT_FAMILY}" font-size="11.5" font-weight="700" fill="#334155">Bắt đầu</text>`,
    `<line x1="${centerX}" y1="${startNodeY + 13}" x2="${centerX}" y2="${firstTargetY}" stroke="#2563eb" stroke-width="2" marker-end="url(#flow-arrow)" />`,
  );

  model.steps.forEach((step, idx) => {
    const y = stepYs[idx];
    const kindMeta = NODE_KIND_STYLE_META[step.kind];
    const roleMeta = ACTIVITY_ROLE_META[step.activityRole];
    const isDecision = step.kind === 'decision';

    const roleW = Math.max(84, Math.ceil(roleMeta.label.length * 6.2 + 20));
    const roleX = cardX + cardW - roleW - 14;
    const titleStartX = cardX + 124;
    const maxTitleChars = Math.max(36, Math.floor((roleX - titleStartX - 12) / 7.3));
    const titleLines = wrapSvgText(step.displayLabel, maxTitleChars, 1);
    const summaryLines = wrapSvgText(step.summaryText, 86, 2);

    if (isDecision) {
      const cx = cardX + 26;
      const cy = y + 25;
      parts.push(
        `<rect x="${cardX}" y="${y}" width="${cardW}" height="${cardH}" rx="16" fill="#fffbeb" stroke="#f59e0b" stroke-width="1.8" stroke-dasharray="6 4" />`,
        `<polygon points="${cx},${cy - 14} ${cx + 14},${cy} ${cx},${cy + 14} ${cx - 14},${cy}" fill="#f59e0b" />`,
        `<text x="${cx}" y="${cy + 4}" font-family="${SVG_FONT_FAMILY}" font-size="10.5" font-weight="700" fill="#ffffff" text-anchor="middle">${step.stepNumber}</text>`,
      );
    } else {
      parts.push(
        `<rect x="${cardX}" y="${y}" width="${cardW}" height="${cardH}" rx="16" fill="${kindMeta.fill}" stroke="${kindMeta.stroke}" stroke-width="1.6" />`,
        `<circle cx="${cardX + 26}" cy="${y + 25}" r="12" fill="#2563eb" />`,
        `<text x="${cardX + 26}" y="${y + 29}" font-family="${SVG_FONT_FAMILY}" font-size="11" font-weight="700" fill="#ffffff" text-anchor="middle">${step.stepNumber}</text>`,
      );
    }

    parts.push(
      `<rect x="${cardX + 48}" y="${y + 15}" width="68" height="20" rx="6" fill="${kindMeta.badgeBg}" />`,
      `<text x="${cardX + 82}" y="${y + 29}" font-family="${SVG_FONT_FAMILY}" font-size="10" font-weight="700" fill="#ffffff" text-anchor="middle">${escapeXml(kindMeta.label)}</text>`,
      `<text x="${titleStartX}" y="${y + 30}" font-family="${SVG_FONT_FAMILY}" font-size="13.5" font-weight="700" fill="#0f172a">${escapeXml(titleLines[0] ?? '')}</text>`,
      `<rect x="${roleX}" y="${y + 15}" width="${roleW}" height="20" rx="10" fill="#ffffff" stroke="${roleMeta.stroke}" stroke-width="1.1" />`,
      `<text x="${roleX + roleW / 2}" y="${y + 28.5}" font-family="${SVG_FONT_FAMILY}" font-size="10" font-weight="600" fill="${roleMeta.textFill}" text-anchor="middle">${escapeXml(roleMeta.label)}</text>`,
    );

    summaryLines.forEach((line, lineIdx) => {
      parts.push(
        `<text x="${cardX + 20}" y="${y + 60 + lineIdx * 17}" font-family="${SVG_FONT_FAMILY}" font-size="11.5" font-weight="500" fill="#475569">${escapeXml(line)}</text>`,
      );
    });

    if (idx < stepCount - 1) {
      const lineY1 = y + cardH;
      const lineY2 = lineY1 + connectorHeights[idx] - 4;
      appendStepConnectorSvg(
        parts,
        step,
        cardX,
        cardW,
        centerX,
        lineY1,
        lineY2,
        connectorHeights[idx],
      );
    } else if (step.kind === 'decision' && step.alternativeBranches.length > 0) {
      appendStepConnectorSvg(
        parts,
        step,
        cardX,
        cardW,
        centerX,
        y + cardH,
        endNodeY - 15,
        endConnectorH,
      );
    } else {
      parts.push(
        `<line x1="${centerX}" y1="${y + cardH}" x2="${centerX}" y2="${endNodeY - 15}" stroke="#2563eb" stroke-width="2" marker-end="url(#flow-arrow)" />`,
      );
    }
  });

  // UML Final Node (Kết thúc)
  const isErrorEnd = lastStep?.kind === 'error';
  const endColor = isErrorEnd ? '#e11d48' : '#0f172a';
  const endLabel = isErrorEnd ? 'Kết thúc (Lỗi / Dừng)' : 'Kết thúc';
  parts.push(
    `<circle cx="${centerX}" cy="${endNodeY}" r="11" fill="#ffffff" stroke="${endColor}" stroke-width="2.2" />`,
    `<circle cx="${centerX}" cy="${endNodeY}" r="6" fill="${endColor}" />`,
    `<text x="${centerX + 18}" y="${endNodeY + 4}" font-family="${SVG_FONT_FAMILY}" font-size="11.5" font-weight="700" fill="${endColor}">${escapeXml(endLabel)}</text>`,
  );

  parts.push(`</svg>`);
  return parts.join('\n');
}

const ACTIVITY_LANE_ORDER: ScenarioActivityRole[] = [
  'user',
  'app',
  'miniapp',
  'system',
];

export interface ActivitySwimlane {
  role: ScenarioActivityRole;
  label: string;
  x: number;
  width: number;
  centerX: number;
  fill: string;
  stroke: string;
  textFill: string;
}

export interface ActivityAltLayoutItem {
  branch: ScenarioAlternativeBranch;
  boxX: number;
  boxY: number;
  boxWidth: number;
  boxHeight: number;
  centerY: number;
  path: string;
  guardText: string;
  targetText: string;
  actionText: string;
}

export interface ActivityNodeLayout {
  step: ScenarioStep;
  laneIndex: number;
  cx: number;
  cy: number;
  x: number;
  y: number;
  width: number;
  height: number;
  isDecision: boolean;
  diamondPoints?: string;
  titleLines: string[];
  altItems: ActivityAltLayoutItem[];
}

export interface ActivityConnectorLayout {
  id: string;
  fromStepIndex: number;
  toStepIndex: number;
  path: string;
  labelText?: string;
  labelX?: number;
  labelY?: number;
  labelPillW?: number;
}

export interface ActivityDiagramLayout {
  width: number;
  height: number;
  headerHeight: number;
  swimlaneTopY: number;
  swimlaneHeaderH: number;
  swimlaneBottomY: number;
  swimlanesX: number;
  swimlanesWidth: number;
  hasAltRail: boolean;
  altRailX: number;
  altRailWidth: number;
  lanes: ActivitySwimlane[];
  startNode: { cx: number; cy: number; arrowEndY: number } | null;
  endNode: {
    cx: number;
    cy: number;
    arrowStartY: number;
    isError: boolean;
    label: string;
  } | null;
  nodes: ActivityNodeLayout[];
  connectors: ActivityConnectorLayout[];
}

function getAltActionText(alt: ScenarioAlternativeBranch): string {
  if (alt.targetScenarioId) return 'Mở kịch bản ↗';
  if (alt.targetStepIndex !== undefined) return `Tới bước ${alt.targetStepIndex + 1}`;
  return 'Xem sơ đồ ↗';
}

/**
 * Compute shared geometric coordinates for UML Swimlane Activity Diagram
 * used by both interactive UI (`ScenarioActivityDiagram.vue`) and SVG/PNG export.
 */
export function computeActivityDiagramLayout(
  model: ScenarioTimelineModel,
): ActivityDiagramLayout {
  const headerHeight = 62;
  const swimlaneTopY = headerHeight + 12;
  const swimlaneHeaderH = 36;
  const outerPad = 14;

  if (model.steps.length === 0) {
    return {
      width: 680,
      height: 200,
      headerHeight,
      swimlaneTopY,
      swimlaneHeaderH,
      swimlaneBottomY: 186,
      swimlanesX: outerPad,
      swimlanesWidth: 652,
      hasAltRail: false,
      altRailX: outerPad + 652,
      altRailWidth: 0,
      lanes: [],
      startNode: null,
      endNode: null,
      nodes: [],
      connectors: [],
    };
  }

  const usedRoles = new Set(model.steps.map((s) => s.activityRole));
  const roles = ACTIVITY_LANE_ORDER.filter((r) => usedRoles.has(r));
  const hasAltRail = model.steps.some((s) => s.alternativeBranches.length > 0);
  const laneCount = roles.length;
  const laneWidth =
    laneCount === 1
      ? 340
      : laneCount === 2
        ? hasAltRail
          ? 242
          : 290
        : laneCount === 3
          ? hasAltRail
            ? 216
            : 248
          : hasAltRail
            ? 196
            : 216;
  const altRailGap = hasAltRail ? 16 : 0;
  const altRailWidth = hasAltRail ? (laneCount >= 4 ? 210 : 226) : 0;

  const swimlanesX = outerPad;
  const swimlanesWidth = laneCount * laneWidth;
  const altRailX = swimlanesX + swimlanesWidth + altRailGap;
  const width = swimlanesX + swimlanesWidth + altRailGap + altRailWidth + outerPad;

  const laneIndexByRole = new Map<ScenarioActivityRole, number>();
  const lanes: ActivitySwimlane[] = roles.map((role, idx) => {
    laneIndexByRole.set(role, idx);
    const meta = ACTIVITY_ROLE_META[role];
    const x = swimlanesX + idx * laneWidth;
    return {
      role,
      label: meta.label,
      x,
      width: laneWidth,
      centerX: x + laneWidth / 2,
      fill: meta.fill,
      stroke: meta.stroke,
      textFill: meta.textFill,
    };
  });

  const startCy = swimlaneTopY + swimlaneHeaderH + 22;
  let cursorY = startCy + 34;

  const nodes: ActivityNodeLayout[] = model.steps.map((step, idx) => {
    const laneIndex = laneIndexByRole.get(step.activityRole) ?? 0;
    const lane = lanes[laneIndex];
    const cx = lane.centerX;
    const isDecision = step.kind === 'decision';
    const nodeH = isDecision ? 74 : 58;
    const nodeW = isDecision ? Math.min(laneWidth - 18, 196) : laneWidth - 22;

    const alts = step.alternativeBranches;
    const altBoxH = 44;
    const altGap = 8;
    const altStackH =
      alts.length > 0 ? alts.length * altBoxH + (alts.length - 1) * altGap : 0;
    const bandH = Math.max(nodeH, altStackH);

    const cy = cursorY + bandH / 2;
    const x = cx - nodeW / 2;
    const y = cy - nodeH / 2;
    const diamondPoints = isDecision
      ? `${cx},${y} ${x + nodeW},${cy} ${cx},${y + nodeH} ${x},${cy}`
      : undefined;

    const maxTitleChars = isDecision
      ? Math.max(16, Math.floor((nodeW * 0.6) / 5.7))
      : Math.max(20, Math.floor((nodeW - 42) / 6.0));
    const titleLines = wrapSvgText(step.displayLabel, maxTitleChars, 2);

    const altItems: ActivityAltLayoutItem[] = [];
    if (alts.length > 0) {
      const stackTop = cy - altStackH / 2;
      const boxX = altRailX + 10;
      const boxWidth = altRailWidth - 20;
      const maxAltChars = Math.max(20, Math.floor((boxWidth - 18) / 5.6));
      const startX = x + nodeW;
      const elbowX = altRailX - 4;

      alts.forEach((branch, altIdx) => {
        const boxY = stackTop + altIdx * (altBoxH + altGap);
        const centerY = boxY + altBoxH / 2;
        const path =
          alts.length === 1
            ? `M ${startX} ${cy} L ${boxX - 4} ${centerY}`
            : `M ${startX} ${cy} L ${elbowX} ${cy} L ${elbowX} ${centerY} L ${boxX - 4} ${centerY}`;
        const rawGuard = branch.guardLabel ? `[${branch.guardLabel}]` : 'Nhánh khác';
        altItems.push({
          branch,
          boxX,
          boxY,
          boxWidth,
          boxHeight: altBoxH,
          centerY,
          path,
          guardText: wrapSvgText(rawGuard, maxAltChars, 1)[0] ?? rawGuard,
          targetText:
            wrapSvgText(branch.targetLabel, maxAltChars, 1)[0] ?? branch.targetLabel,
          actionText: getAltActionText(branch),
        });
      });
    }

    const gapToNext =
      idx < model.steps.length - 1 ? (step.outgoingEdgeLabel ? 44 : 32) : 0;
    cursorY += bandH + gapToNext;

    return {
      step,
      laneIndex,
      cx,
      cy,
      x,
      y,
      width: nodeW,
      height: nodeH,
      isDecision,
      ...(diamondPoints ? { diamondPoints } : {}),
      titleLines,
      altItems,
    };
  });

  const connectors: ActivityConnectorLayout[] = [];
  for (let i = 0; i < nodes.length - 1; i += 1) {
    const from = nodes[i];
    const to = nodes[i + 1];
    const fromBottom = from.y + from.height;
    const toTop = to.y;
    const gutterY = (fromBottom + toTop) / 2;
    const sameLane = Math.abs(from.cx - to.cx) < 1;
    const path = sameLane
      ? `M ${from.cx} ${fromBottom} L ${to.cx} ${toTop - 4}`
      : `M ${from.cx} ${fromBottom} L ${from.cx} ${gutterY} L ${to.cx} ${gutterY} L ${to.cx} ${toTop - 4}`;

    let labelText: string | undefined;
    let labelX: number | undefined;
    let labelY: number | undefined;
    let labelPillW: number | undefined;

    if (from.step.outgoingEdgeLabel) {
      const formatted = formatDecisionLabel(
        from.step.outgoingEdgeLabel,
        from.isDecision,
      );
      labelText = wrapSvgText(formatted, 34, 1)[0] ?? '';
      labelPillW = Math.max(76, Math.ceil(labelText.length * 6.0 + 20));
      const rawMidX = (from.cx + to.cx) / 2;
      const minX = swimlanesX + 8 + labelPillW / 2;
      const maxX = swimlanesX + swimlanesWidth - 8 - labelPillW / 2;
      labelX = Math.max(minX, Math.min(maxX, rawMidX));
      labelY = gutterY;
    }

    connectors.push({
      id: `act-conn-${from.step.node.id}-${to.step.node.id}`,
      fromStepIndex: from.step.index,
      toStepIndex: to.step.index,
      path,
      ...(labelText ? { labelText, labelX, labelY, labelPillW } : {}),
    });
  }

  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  const startNode = {
    cx: first.cx,
    cy: startCy,
    arrowEndY: first.y - 4,
  };

  const lastNodeBottom = last.y + last.height;
  const lastAltBottom =
    last.altItems.length > 0
      ? last.altItems[last.altItems.length - 1].boxY +
        last.altItems[last.altItems.length - 1].boxHeight
      : 0;
  const lastClearBottom = Math.max(lastNodeBottom, lastAltBottom);
  const endCy = lastClearBottom + 34;
  const isError = last.step.kind === 'error';
  const endNode = {
    cx: last.cx,
    cy: endCy,
    arrowStartY: lastNodeBottom,
    isError,
    label: isError ? 'Kết thúc (Lỗi / Dừng)' : 'Kết thúc',
  };

  const swimlaneBottomY = endCy + 26;
  const height = swimlaneBottomY + 14;

  return {
    width,
    height,
    headerHeight,
    swimlaneTopY,
    swimlaneHeaderH,
    swimlaneBottomY,
    swimlanesX,
    swimlanesWidth,
    hasAltRail,
    altRailX,
    altRailWidth,
    lanes,
    startNode,
    endNode,
    nodes,
    connectors,
  };
}

/**
 * Render a standalone UML Swimlane Activity Diagram SVG string for export & testing.
 */
export function renderScenarioActivitySvg(
  model: ScenarioTimelineModel,
  activeStepIndex?: number | null,
): string {
  const layout = computeActivityDiagramLayout(model);
  const stepCount = model.steps.length;
  const isTechMode = ALLOW_TECH_RUNTIME && model.mode === 'tech';

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">`,
    `<defs>`,
    `<marker id="act-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">`,
    `<path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#2563eb" />`,
    `</marker>`,
    `<marker id="act-alt-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto">`,
    `<path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#94a3b8" />`,
    `</marker>`,
    `</defs>`,
    `<rect width="${layout.width}" height="${layout.height}" fill="#f8fafc" />`,
    `<rect x="0" y="0" width="${layout.width}" height="${layout.headerHeight}" fill="#ffffff" />`,
    `<line x1="0" y1="${layout.headerHeight}" x2="${layout.width}" y2="${layout.headerHeight}" stroke="#e2e8f0" stroke-width="1" />`,
    `<rect x="18" y="15" width="32" height="32" rx="8" fill="#4f46e5" />`,
    `<text x="34" y="36" font-family="${SVG_FONT_FAMILY}" font-size="14" font-weight="800" fill="#ffffff" text-anchor="middle">V</text>`,
    `<text x="60" y="30" font-family="${SVG_FONT_FAMILY}" font-size="13.5" font-weight="700" fill="#0f172a">${escapeXml(wrapSvgText(model.title, 54, 1)[0] ?? '')}</text>`,
  ];

  if (model.description) {
    parts.push(
      `<text x="60" y="47" font-family="${SVG_FONT_FAMILY}" font-size="11" font-weight="500" fill="#64748b">${escapeXml(wrapSvgText(model.description, 60, 1)[0] ?? '')}</text>`,
    );
  }

  const badgeLabel = `Biểu đồ hoạt động • ${stepCount} bước`;
  const badgeW = Math.max(176, Math.ceil(badgeLabel.length * 6.3 + 22));
  const badgeX = layout.width - badgeW - 18;
  parts.push(
    `<rect x="${badgeX}" y="19" width="${badgeW}" height="24" rx="12" fill="#eff6ff" stroke="#bfdbfe" stroke-width="1" />`,
    `<text x="${badgeX + badgeW / 2}" y="35" font-family="${SVG_FONT_FAMILY}" font-size="11" font-weight="700" fill="#1d4ed8" text-anchor="middle">${escapeXml(badgeLabel)}</text>`,
  );

  const laneTotalH = layout.swimlaneBottomY - layout.swimlaneTopY;
  parts.push(
    `<rect x="${layout.swimlanesX}" y="${layout.swimlaneTopY}" width="${layout.swimlanesWidth}" height="${laneTotalH}" rx="12" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.2" />`,
  );

  layout.lanes.forEach((lane, idx) => {
    parts.push(
      `<rect x="${lane.x}" y="${layout.swimlaneTopY}" width="${lane.width}" height="${layout.swimlaneHeaderH}" fill="${lane.fill}" />`,
      `<rect x="${lane.x}" y="${layout.swimlaneTopY + layout.swimlaneHeaderH}" width="${lane.width}" height="${laneTotalH - layout.swimlaneHeaderH}" fill="${idx % 2 === 1 ? '#f8fafc' : '#ffffff'}" fill-opacity="0.7" />`,
      `<text x="${lane.centerX}" y="${layout.swimlaneTopY + 22}" font-family="${SVG_FONT_FAMILY}" font-size="11.5" font-weight="700" fill="${lane.textFill}" text-anchor="middle">${escapeXml(lane.label)}</text>`,
    );
    if (idx > 0) {
      parts.push(
        `<line x1="${lane.x}" y1="${layout.swimlaneTopY}" x2="${lane.x}" y2="${layout.swimlaneBottomY}" stroke="#e2e8f0" stroke-width="1.2" stroke-dasharray="4 4" />`,
      );
    }
  });
  parts.push(
    `<line x1="${layout.swimlanesX}" y1="${layout.swimlaneTopY + layout.swimlaneHeaderH}" x2="${layout.swimlanesX + layout.swimlanesWidth}" y2="${layout.swimlaneTopY + layout.swimlaneHeaderH}" stroke="#cbd5e1" stroke-width="1" />`,
  );

  if (layout.hasAltRail) {
    parts.push(
      `<rect x="${layout.altRailX}" y="${layout.swimlaneTopY}" width="${layout.altRailWidth}" height="${laneTotalH}" rx="12" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.2" stroke-dasharray="5 4" />`,
      `<text x="${layout.altRailX + layout.altRailWidth / 2}" y="${layout.swimlaneTopY + 22}" font-family="${SVG_FONT_FAMILY}" font-size="11" font-weight="700" fill="#475569" text-anchor="middle">Nhánh rẽ khác</text>`,
      `<line x1="${layout.altRailX}" y1="${layout.swimlaneTopY + layout.swimlaneHeaderH}" x2="${layout.altRailX + layout.altRailWidth}" y2="${layout.swimlaneTopY + layout.swimlaneHeaderH}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="4 4" />`,
    );
  }

  // Initial & Final UML Nodes
  if (layout.startNode) {
    const sn = layout.startNode;
    parts.push(
      `<circle cx="${sn.cx}" cy="${sn.cy}" r="11" fill="#e2e8f0" />`,
      `<circle cx="${sn.cx}" cy="${sn.cy}" r="7.5" fill="#0f172a" />`,
      `<text x="${sn.cx + 16}" y="${sn.cy + 4}" font-family="${SVG_FONT_FAMILY}" font-size="10.5" font-weight="700" fill="#334155">Bắt đầu</text>`,
      `<line x1="${sn.cx}" y1="${sn.cy + 11}" x2="${sn.cx}" y2="${sn.arrowEndY}" stroke="#2563eb" stroke-width="2" marker-end="url(#act-arrow)" />`,
    );
  }

  if (layout.endNode) {
    const en = layout.endNode;
    const endColor = en.isError ? '#e11d48' : '#0f172a';
    parts.push(
      `<line x1="${en.cx}" y1="${en.arrowStartY}" x2="${en.cx}" y2="${en.cy - 14}" stroke="#2563eb" stroke-width="2" marker-end="url(#act-arrow)" />`,
      `<circle cx="${en.cx}" cy="${en.cy}" r="10" fill="#ffffff" stroke="${endColor}" stroke-width="2" />`,
      `<circle cx="${en.cx}" cy="${en.cy}" r="5.5" fill="${endColor}" />`,
      `<text x="${en.cx + 15}" y="${en.cy + 4}" font-family="${SVG_FONT_FAMILY}" font-size="10.5" font-weight="700" fill="${endColor}">${escapeXml(en.label)}</text>`,
    );
  }

  // Connectors between steps
  for (const conn of layout.connectors) {
    parts.push(
      `<path d="${conn.path}" fill="none" stroke="#2563eb" stroke-width="2" stroke-linejoin="round" marker-end="url(#act-arrow)" />`,
    );
    if (conn.labelText && conn.labelX !== undefined && conn.labelY !== undefined && conn.labelPillW !== undefined) {
      const px = conn.labelX - conn.labelPillW / 2;
      const py = conn.labelY - 10;
      parts.push(
        `<rect x="${px}" y="${py}" width="${conn.labelPillW}" height="20" rx="10" fill="#ffffff" stroke="#93c5fd" stroke-width="1.1" />`,
        `<text x="${conn.labelX}" y="${conn.labelY + 3.5}" font-family="${SVG_FONT_FAMILY}" font-size="10" font-weight="600" fill="#1e40af" text-anchor="middle">${escapeXml(conn.labelText)}</text>`,
      );
    }
  }

  // Activity Nodes + Alternative Branches
  for (const item of layout.nodes) {
    const { step, cx, cy, x, y, width: w, height: h, isDecision, diamondPoints, titleLines } = item;
    const isActive =
      activeStepIndex !== undefined &&
      activeStepIndex !== null &&
      step.index === activeStepIndex;
    const kindMeta = NODE_KIND_STYLE_META[step.kind];

    if (isDecision && diamondPoints) {
      parts.push(
        `<polygon points="${diamondPoints}" fill="${isActive ? '#fef3c7' : '#fffbeb'}" stroke="${isActive ? '#2563eb' : '#f59e0b'}" stroke-width="${isActive ? 2.4 : 1.7}" stroke-dasharray="${isActive ? 'none' : '5 3'}" />`,
        `<circle cx="${cx}" cy="${y + 15}" r="9" fill="${isActive ? '#2563eb' : '#f59e0b'}" />`,
        `<text x="${cx}" y="${y + 18.5}" font-family="${SVG_FONT_FAMILY}" font-size="9.5" font-weight="700" fill="#ffffff" text-anchor="middle">${step.stepNumber}</text>`,
      );
      if (titleLines.length === 1) {
        parts.push(
          `<text x="${cx}" y="${cy + 6}" font-family="${SVG_FONT_FAMILY}" font-size="10.5" font-weight="700" fill="#0f172a" text-anchor="middle">${escapeXml(titleLines[0] ?? '')}</text>`,
        );
      } else {
        titleLines.forEach((line, lIdx) => {
          parts.push(
            `<text x="${cx}" y="${cy + 1 + lIdx * 13}" font-family="${SVG_FONT_FAMILY}" font-size="10" font-weight="700" fill="#0f172a" text-anchor="middle">${escapeXml(line)}</text>`,
          );
        });
      }
    } else {
      parts.push(
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${kindMeta.fill}" stroke="${isActive ? '#2563eb' : kindMeta.stroke}" stroke-width="${isActive ? 2.4 : 1.5}" />`,
        `<circle cx="${x + 18}" cy="${cy}" r="10" fill="${isActive ? '#2563eb' : '#1e293b'}" />`,
        `<text x="${x + 18}" y="${cy + 3.5}" font-family="${SVG_FONT_FAMILY}" font-size="10" font-weight="700" fill="#ffffff" text-anchor="middle">${step.stepNumber}</text>`,
      );
      if (titleLines.length === 1) {
        parts.push(
          `<text x="${x + 34}" y="${cy + 4}" font-family="${SVG_FONT_FAMILY}" font-size="11" font-weight="700" fill="#0f172a">${escapeXml(titleLines[0] ?? '')}</text>`,
        );
      } else {
        titleLines.forEach((line, lIdx) => {
          parts.push(
            `<text x="${x + 34}" y="${cy - 3 + lIdx * 14}" font-family="${SVG_FONT_FAMILY}" font-size="10.5" font-weight="700" fill="#0f172a">${escapeXml(line)}</text>`,
          );
        });
      }
    }

    if (isTechMode && (step.platformTag || step.hasPlatformDiff)) {
      const pTag =
        step.platformTag === 'ios'
          ? 'iOS'
          : step.platformTag === 'android'
            ? 'AND'
            : '≠';
      const pillW = pTag.length > 1 ? 28 : 16;
      parts.push(
        `<rect x="${x + w - pillW - 4}" y="${y - 7}" width="${pillW}" height="14" rx="7" fill="#fef3c7" stroke="#f59e0b" stroke-width="1" />`,
        `<text x="${x + w - pillW / 2 - 4}" y="${y + 3}" font-family="${SVG_FONT_FAMILY}" font-size="8.5" font-weight="700" fill="#92400e" text-anchor="middle">${pTag}</text>`,
      );
    }

    for (const alt of item.altItems) {
      const dotFill = NODE_KIND_STYLE_META[alt.branch.targetKind].badgeBg;
      parts.push(
        `<path d="${alt.path}" fill="none" stroke="#94a3b8" stroke-width="1.4" stroke-dasharray="4 3" marker-end="url(#act-alt-arrow)" />`,
        `<rect x="${alt.boxX}" y="${alt.boxY}" width="${alt.boxWidth}" height="${alt.boxHeight}" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.1" stroke-dasharray="4 3" />`,
        `<circle cx="${alt.boxX + 10}" cy="${alt.boxY + 15}" r="3" fill="${dotFill}" />`,
        `<text x="${alt.boxX + 18}" y="${alt.boxY + 18}" font-family="${SVG_FONT_FAMILY}" font-size="9.5" font-weight="700" fill="#b45309">${escapeXml(alt.guardText)}</text>`,
        `<text x="${alt.boxX + 10}" y="${alt.boxY + 34}" font-family="${SVG_FONT_FAMILY}" font-size="10" font-weight="600" fill="#334155">${escapeXml(alt.targetText)}</text>`,
      );
    }
  }

  parts.push(`</svg>`);
  return parts.join('\n');
}
