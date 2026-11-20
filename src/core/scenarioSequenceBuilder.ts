// src/core/scenarioSequenceBuilder.ts
import type {
  BridgeMessage,
  FlowNodeData,
  NodeKind,
  PlatformViewMode,
} from '../data/schema';
import type { ScenarioStep, ScenarioTimelineModel } from './scenarioFlowEngine';
import { escapeXml, SVG_FONT_FAMILY, wrapSvgText } from './svgHelpers';

export type SequenceActorId = 'user' | 'host' | 'miniapp' | 'server';

export interface SequenceActor {
  id: SequenceActorId;
  label: string;
  sublabel: string;
  accent: string;
  bg: string;
  border: string;
}

export interface SequenceMessage {
  id: string;
  stepIndex: number;
  stepNumber: number;
  nodeId: string;
  from: SequenceActorId;
  to: SequenceActorId;
  title: string;
  subtitle?: string;
  dashed: boolean;
  isSelfCall: boolean;
  kind: NodeKind;
  directionBadge?: string;
  examplePayload?: string;
  exampleResponse?: string;
  parityNote?: string;
}

export interface ScenarioSequenceModel {
  scenarioId: string;
  title: string;
  platformMode: PlatformViewMode;
  actors: SequenceActor[];
  messages: SequenceMessage[];
  preferSequenceByDefault: boolean;
}

export interface SequenceLayoutRow {
  message: SequenceMessage;
  y: number;
  fromX: number;
  toX: number;
  direction: 1 | -1 | 0;
  titleLine: string;
  subtitleLine: string;
  selfCall?: {
    loopPath: string;
    boxX: number;
    boxY: number;
    boxWidth: number;
    boxHeight: number;
    textX: number;
    titleY: number;
    subtitleY: number;
  };
  crossLabel?: {
    midX: number;
    boxX: number;
    boxWidth: number;
    titleBoxY: number;
    subtitleBoxY: number;
  };
}

export interface SequenceDiagramLayout {
  width: number;
  height: number;
  headerHeight: number;
  actorBoxY: number;
  actorBoxHeight: number;
  actorBoxWidth: number;
  footerY: number;
  lifelineStartY: number;
  lifelineEndY: number;
  rowHeight: number;
  actorCenters: Record<SequenceActorId, number>;
  rows: SequenceLayoutRow[];
}

const ACTOR_ORDER: SequenceActorId[] = ['user', 'host', 'miniapp', 'server'];

function createActorMeta(
  id: SequenceActorId,
  platformMode: PlatformViewMode,
): SequenceActor {
  switch (id) {
    case 'user':
      return {
        id: 'user',
        label: 'Người dùng',
        sublabel: 'Thao tác UI',
        accent: '#2563eb',
        bg: '#eff6ff',
        border: '#93c5fd',
      };
    case 'host':
      return {
        id: 'host',
        label:
          platformMode === 'ios'
            ? 'Host App (iOS)'
            : platformMode === 'android'
              ? 'Host App (Android)'
              : 'Host App (iOS / Android)',
        sublabel:
          platformMode === 'ios'
            ? 'Swift / UIKit'
            : platformMode === 'android'
              ? 'Kotlin / Activity'
              : 'Native Wrapper',
        accent: '#4f46e5',
        bg: '#eef2ff',
        border: '#a5b4fc',
      };
    case 'miniapp':
      return {
        id: 'miniapp',
        label: 'Mini App',
        sublabel: 'WebView (@vbotma/sdk)',
        accent: '#0891b2',
        bg: '#ecfeff',
        border: '#22d3ee',
      };
    case 'server':
      return {
        id: 'server',
        label: 'Server / Tổng đài / OS',
        sublabel: 'REST / WS / SIP / Push',
        accent: '#059669',
        bg: '#ecfdf5',
        border: '#6ee7b7',
      };
  }
}

function resolvePlatformApis(
  node: FlowNodeData,
  platformMode: PlatformViewMode,
): string[] {
  const androidApis = node.techDetail?.byPlatform?.android?.apisOrEvents ?? [];
  const iosApis = node.techDetail?.byPlatform?.ios?.apisOrEvents ?? [];
  const sharedApis = node.techDetail?.apisOrEvents ?? [];
  if (platformMode === 'android') {
    return androidApis.length > 0 ? androidApis : sharedApis;
  }
  if (platformMode === 'ios') {
    return iosApis.length > 0 ? iosApis : sharedApis;
  }
  return sharedApis.length > 0 ? sharedApis : androidApis.length > 0 ? androidApis : iosApis;
}

function resolveHostFnForPlatform(
  msg: BridgeMessage,
  platformMode: PlatformViewMode,
): string | undefined {
  if (platformMode === 'android') {
    return msg.hostFnByPlatform?.android ?? msg.hostFn;
  }
  if (platformMode === 'ios') {
    return msg.hostFnByPlatform?.ios ?? msg.hostFn;
  }
  return msg.hostFn ?? msg.hostFnByPlatform?.ios ?? msg.hostFnByPlatform?.android;
}

function selectRelevantBridgeMessages(step: ScenarioStep): BridgeMessage[] {
  const all = step.node.techDetail?.miniAppBridge?.messages ?? [];
  if (all.length === 0) return [];
  const searchText = [
    step.displayLabel,
    step.incomingEdgeLabel ?? '',
    step.outgoingEdgeLabel ?? '',
  ]
    .join(' ')
    .toLowerCase();

  // Tránh gán nhầm thông điệp lỗi phụ (vd: open_settings ở bước render danh bạ thành công)
  if (
    step.node.id === 'mauc-render-list' &&
    !searchText.includes('open_settings') &&
    !searchText.includes('cài đặt')
  ) {
    return [];
  }

  const matched = all.filter((m) =>
    searchText.includes(m.name.toLowerCase().split(' / ')[0]),
  );
  if (matched.length > 0) {
    return matched.slice(0, 2);
  }
  return all.slice(0, 2);
}

function mapBridgeMessageEndpoints(msg: BridgeMessage): {
  from: SequenceActorId;
  to: SequenceActorId;
  dashed: boolean;
  badge: string;
} {
  if (msg.name.endsWith('_result')) {
    return { from: 'host', to: 'miniapp', dashed: true, badge: 'Host → Mini App' };
  }
  if (msg.direction === 'host_init') {
    return { from: 'host', to: 'miniapp', dashed: false, badge: 'Host Init' };
  }
  if (msg.direction === 'host_to_miniapp') {
    return { from: 'host', to: 'miniapp', dashed: true, badge: 'Host → Mini App' };
  }
  return { from: 'miniapp', to: 'host', dashed: false, badge: 'Mini App → Host' };
}

function firstSentence(text: string): string {
  const clean = text.trim();
  const splitIdx = clean.search(/[.;]\s/);
  return splitIdx > 0 ? clean.slice(0, splitIdx) : clean;
}

function isInboundServerEvent(step: ScenarioStep): boolean {
  const label = step.displayLabel.toLowerCase();
  const id = step.node.id;
  return (
    label.startsWith('nhận ') ||
    label.includes('nhận mã khóa') ||
    label.includes('pushkit') ||
    label.includes('fcm') ||
    label.includes('websocket setup_2fa') ||
    id === 'call-in-pushkit' ||
    id === 'tfa-socket-event' ||
    id === 'ma2fa-socket' ||
    id === 'lock-error-429'
  );
}

function isServerSideProcessStep(step: ScenarioStep): boolean {
  const text = `${step.displayLabel} ${step.summaryText}`.toLowerCase();
  return (
    step.kind === 'process' &&
    (text.includes('dtmf') || text.includes('freeswitch')) &&
    !text.includes('hỏi người dùng')
  );
}

/**
 * Derive a structured Sequence Diagram model from an internal Tech ScenarioTimelineModel.
 * Pure helper; intended to be loaded only in internal/tech builds.
 */
export function buildScenarioSequence(
  timeline: ScenarioTimelineModel,
  platformMode: PlatformViewMode,
): ScenarioSequenceModel {
  const messages: SequenceMessage[] = [];
  const emittedCallRequestStep = timeline.steps.some(
    (s) => s.node.id === 'mauc-call-click',
  );

  for (const step of timeline.steps) {
    const apis = resolvePlatformApis(step.node, platformMode);
    const bridgeMsgs = selectRelevantBridgeMessages(step);

    if (step.node.id === 'mauc-call-native' && emittedCallRequestStep) {
      messages.push({
        id: `${step.node.id}-sip`,
        stepIndex: step.index,
        stepNumber: step.stepNumber,
        nodeId: step.node.id,
        from: 'host',
        to: 'server',
        title: `#${step.stepNumber} Mở cuộc gọi SIP & giữ tên`,
        subtitle:
          platformMode === 'android'
            ? 'MiniAppHelper.makeDirectCall → VBotPhone.startOutgoingCall'
            : 'VPMAppService.makeCall → CallKit / TelephoneSDK',
        dashed: false,
        isSelfCall: false,
        kind: step.kind,
        directionBadge: 'Host → Tổng đài',
        parityNote: bridgeMsgs[0]?.parityNote ?? step.node.techDetail?.platformDiffNote,
      });
      messages.push({
        id: `${step.node.id}-result`,
        stepIndex: step.index,
        stepNumber: step.stepNumber,
        nodeId: step.node.id,
        from: 'host',
        to: 'miniapp',
        title: `#${step.stepNumber} call_result`,
        subtitle:
          platformMode === 'android'
            ? 'MiniAppHelper.handleRequestCall → emit "call_result"'
            : 'VbMaViewController.sendEvent("call_result")',
        dashed: true,
        isSelfCall: false,
        kind: step.kind,
        directionBadge: 'Host → Mini App',
        exampleResponse: bridgeMsgs[0]?.exampleResponse,
      });
      continue;
    }

    if (bridgeMsgs.length > 0) {
      bridgeMsgs.forEach((msg, msgIdx) => {
        const endpoints = mapBridgeMessageEndpoints(msg);
        const hostFn = resolveHostFnForPlatform(msg, platformMode);
        messages.push({
          id: `${step.node.id}-msg-${msgIdx}`,
          stepIndex: step.index,
          stepNumber: step.stepNumber,
          nodeId: step.node.id,
          from: endpoints.from,
          to: endpoints.to,
          title: `#${step.stepNumber} ${msg.name}`,
          subtitle: hostFn ?? msg.miniAppFn ?? firstSentence(step.summaryText),
          dashed: endpoints.dashed,
          isSelfCall: false,
          kind: step.kind,
          directionBadge: endpoints.badge,
          ...(msg.examplePayload ? { examplePayload: msg.examplePayload } : {}),
          ...(msg.exampleResponse ? { exampleResponse: msg.exampleResponse } : {}),
          ...(msg.parityNote ? { parityNote: msg.parityNote } : {}),
        });
      });

      if (step.kind === 'external' && apis.length > 0) {
        const callerActor: SequenceActorId =
          step.node.id === 'mauc-crud-api' ? 'miniapp' : 'host';
        messages.push({
          id: `${step.node.id}-api`,
          stepIndex: step.index,
          stepNumber: step.stepNumber,
          nodeId: step.node.id,
          from: callerActor,
          to: 'server',
          title: `#${step.stepNumber} ${apis[0]}`,
          subtitle:
            callerActor === 'miniapp'
              ? 'Gọi REST API kèm Bearer MiniAppToken'
              : firstSentence(step.displayLabel),
          dashed: false,
          isSelfCall: false,
          kind: step.kind,
          directionBadge:
            callerActor === 'miniapp' ? 'Mini App → Server' : 'Host → Server',
        });
      }
      continue;
    }

    if (step.kind === 'miniapp') {
      const incoming = step.incomingEdgeLabel;
      messages.push({
        id: `${step.node.id}-miniapp`,
        stepIndex: step.index,
        stepNumber: step.stepNumber,
        nodeId: step.node.id,
        from: 'host',
        to: 'miniapp',
        title: `#${step.stepNumber} ${incoming ?? step.displayLabel}`,
        subtitle: firstSentence(step.summaryText),
        dashed: Boolean(incoming && incoming.toLowerCase().includes('trả')),
        isSelfCall: false,
        kind: step.kind,
        directionBadge: 'Host → Mini App',
      });
      continue;
    }

    if (step.kind === 'external') {
      const fromMiniAppRest =
        step.node.id === 'mauc-delete-server' ||
        step.displayLabel.toLowerCase().includes('mini app');
      if (fromMiniAppRest) {
        messages.push({
          id: `${step.node.id}-ext-ma`,
          stepIndex: step.index,
          stepNumber: step.stepNumber,
          nodeId: step.node.id,
          from: 'miniapp',
          to: 'server',
          title: `#${step.stepNumber} ${apis[0] ?? step.displayLabel}`,
          subtitle: firstSentence(step.summaryText),
          dashed: false,
          isSelfCall: false,
          kind: step.kind,
          directionBadge: 'Mini App → Server',
        });
      } else if (isInboundServerEvent(step)) {
        messages.push({
          id: `${step.node.id}-ext-in`,
          stepIndex: step.index,
          stepNumber: step.stepNumber,
          nodeId: step.node.id,
          from: 'server',
          to: 'host',
          title: `#${step.stepNumber} ${step.displayLabel}`,
          subtitle: apis[0] ?? firstSentence(step.summaryText),
          dashed: true,
          isSelfCall: false,
          kind: step.kind,
          directionBadge: 'Server / OS → Host',
        });
      } else {
        messages.push({
          id: `${step.node.id}-ext-out`,
          stepIndex: step.index,
          stepNumber: step.stepNumber,
          nodeId: step.node.id,
          from: 'host',
          to: 'server',
          title: `#${step.stepNumber} ${apis[0] ?? step.displayLabel}`,
          subtitle: firstSentence(step.summaryText),
          dashed: false,
          isSelfCall: false,
          kind: step.kind,
          directionBadge: 'Host → Server',
        });
      }
      continue;
    }

    if (step.kind === 'action') {
      const isInMiniApp =
        step.displayLabel.toLowerCase().includes('mini app') &&
        !step.node.id.startsWith('ct-');
      const target: SequenceActorId = isInMiniApp ? 'miniapp' : 'host';
      messages.push({
        id: `${step.node.id}-act`,
        stepIndex: step.index,
        stepNumber: step.stepNumber,
        nodeId: step.node.id,
        from: 'user',
        to: target,
        title: `#${step.stepNumber} ${step.displayLabel}`,
        subtitle: step.incomingEdgeLabel ?? firstSentence(step.summaryText),
        dashed: false,
        isSelfCall: false,
        kind: step.kind,
        directionBadge: target === 'miniapp' ? 'User → Mini App' : 'User → Host',
      });
      continue;
    }

    if (isServerSideProcessStep(step)) {
      messages.push({
        id: `${step.node.id}-dtmf`,
        stepIndex: step.index,
        stepNumber: step.stepNumber,
        nodeId: step.node.id,
        from: 'host',
        to: 'server',
        title: `#${step.stepNumber} ${apis[0] ?? step.displayLabel}`,
        subtitle: firstSentence(step.summaryText),
        dashed: false,
        isSelfCall: false,
        kind: step.kind,
        directionBadge: 'Host → Tổng đài',
      });
      continue;
    }

    messages.push({
      id: `${step.node.id}-self`,
      stepIndex: step.index,
      stepNumber: step.stepNumber,
      nodeId: step.node.id,
      from: 'host',
      to: 'host',
      title: `#${step.stepNumber} ${step.displayLabel}`,
      subtitle: step.incomingEdgeLabel ?? firstSentence(step.summaryText),
      dashed: false,
      isSelfCall: true,
      kind: step.kind,
      directionBadge: 'Host nội bộ',
    });
  }

  const usedIds = new Set<SequenceActorId>();
  for (const msg of messages) {
    usedIds.add(msg.from);
    usedIds.add(msg.to);
  }
  usedIds.add('host');
  if (usedIds.size < 2) {
    usedIds.add('user');
  }

  const actors = ACTOR_ORDER.filter((id) => usedIds.has(id)).map((id) =>
    createActorMeta(id, platformMode),
  );

  const preferSequenceByDefault =
    usedIds.has('miniapp') ||
    (actors.length >= 3 && messages.some((m) => !m.isSelfCall));

  return {
    scenarioId: timeline.scenarioId,
    title: timeline.title,
    platformMode,
    actors,
    messages,
    preferSequenceByDefault,
  };
}

/**
 * Compute shared geometric coordinates for both interactive SVG rendering
 * (`ScenarioSequenceDiagram.vue`) and static SVG/PNG export (`renderScenarioSequenceSvg`).
 */
export function computeSequenceDiagramLayout(
  model: ScenarioSequenceModel,
): SequenceDiagramLayout {
  const actorCount = Math.max(2, model.actors.length);
  const actorBoxWidth = actorCount === 4 ? 172 : 182;
  const colSpacing = actorCount === 2 ? 360 : actorCount === 3 ? 286 : 238;
  const sideMargin = actorCount === 2 ? 160 : actorCount === 3 ? 124 : 114;
  const width = sideMargin * 2 + (actorCount - 1) * colSpacing;
  const headerHeight = 62;
  const actorBoxY = headerHeight + 14;
  const actorBoxHeight = 44;
  const rowHeight = 58;
  const firstRowOffset = 40;
  const lifelineStartY = actorBoxY + actorBoxHeight;
  const rowCount = Math.max(1, model.messages.length);
  const footerY = lifelineStartY + firstRowOffset + (rowCount - 1) * rowHeight + 42;
  const height = footerY + actorBoxHeight + 16;

  const actorCenters = {} as Record<SequenceActorId, number>;
  model.actors.forEach((actor, idx) => {
    actorCenters[actor.id] = sideMargin + idx * colSpacing;
  });

  const rows: SequenceLayoutRow[] = model.messages.map((message, idx) => {
    const fromX = actorCenters[message.from] ?? sideMargin;
    const toX = actorCenters[message.to] ?? sideMargin;
    const y = lifelineStartY + firstRowOffset + idx * rowHeight;
    const direction: 1 | -1 | 0 =
      toX > fromX ? 1 : toX < fromX ? -1 : 0;

    if (message.isSelfCall) {
      const loopW = 38;
      const rightSpace = width - (fromX + loopW + 8) - 22;
      const leftSpace = (fromX - loopW - 8) - 22;
      const goLeft = rightSpace < 200 && leftSpace > rightSpace;
      const maxBoxWidth = Math.min(330, Math.max(170, goLeft ? leftSpace : rightSpace));
      const titleMaxChars = Math.max(24, Math.floor((maxBoxWidth - 20) / 6.3));
      const subMaxChars = Math.max(28, Math.floor((maxBoxWidth - 20) / 5.5));
      const titleLine = wrapSvgText(message.title, titleMaxChars, 1)[0] ?? '';
      const subtitleLine = message.subtitle
        ? wrapSvgText(message.subtitle, subMaxChars, 1)[0] ?? ''
        : '';
      const estimatedW =
        Math.ceil(Math.max(titleLine.length * 6.5, subtitleLine.length * 5.6)) + 22;
      const boxWidth = Math.min(maxBoxWidth, Math.max(150, estimatedW));
      const loopPath = goLeft
        ? `M ${fromX} ${y - 10} L ${fromX - loopW} ${y - 10} L ${fromX - loopW} ${y + 12} L ${fromX - 4} ${y + 12}`
        : `M ${fromX} ${y - 10} L ${fromX + loopW} ${y - 10} L ${fromX + loopW} ${y + 12} L ${fromX + 4} ${y + 12}`;
      const boxX = goLeft ? fromX - loopW - 8 - boxWidth : fromX + loopW + 8;
      const boxHeight = subtitleLine ? 38 : 24;
      const boxY = subtitleLine ? y - 19 : y - 12;
      const textX = boxX + 10;
      const titleY = subtitleLine ? y - 4 : y + 4;
      const subtitleY = y + 11;

      return {
        message,
        y,
        fromX,
        toX,
        direction,
        titleLine,
        subtitleLine,
        selfCall: {
          loopPath,
          boxX,
          boxY,
          boxWidth,
          boxHeight,
          textX,
          titleY,
          subtitleY,
        },
      };
    }

    const span = Math.abs(toX - fromX);
    const midX = (fromX + toX) / 2;
    const titleMaxChars = Math.max(28, Math.floor((span - 24) / 6.2));
    const subMaxChars = Math.max(32, Math.floor((span - 24) / 5.4));
    const titleLine = wrapSvgText(message.title, titleMaxChars, 1)[0] ?? '';
    const subtitleLine = message.subtitle
      ? wrapSvgText(message.subtitle, subMaxChars, 1)[0] ?? ''
      : '';
    const boxWidth = Math.min(
      span - 16,
      Math.max(
        110,
        Math.ceil(Math.max(titleLine.length * 6.4, subtitleLine.length * 5.5)) + 16,
      ),
    );
    const boxX = midX - boxWidth / 2;

    return {
      message,
      y,
      fromX,
      toX,
      direction,
      titleLine,
      subtitleLine,
      crossLabel: {
        midX,
        boxX,
        boxWidth,
        titleBoxY: y - 21,
        subtitleBoxY: y + 4,
      },
    };
  });

  return {
    width,
    height,
    headerHeight,
    actorBoxY,
    actorBoxHeight,
    actorBoxWidth,
    footerY,
    lifelineStartY,
    lifelineEndY: footerY,
    rowHeight,
    actorCenters,
    rows,
  };
}

/**
 * Render a standalone Sequence Diagram SVG string for export and unit testing.
 */
export function renderScenarioSequenceSvg(
  model: ScenarioSequenceModel,
  activeStepIndex?: number | null,
): string {
  const layout = computeSequenceDiagramLayout(model);
  const platformTag =
    model.platformMode === 'ios'
      ? 'iOS'
      : model.platformMode === 'android'
        ? 'Android'
        : 'iOS / Android';

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">`,
    `<defs>`,
    `<marker id="seq-arrow-solid" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">`,
    `<path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#334155" />`,
    `</marker>`,
    `<marker id="seq-arrow-active" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto">`,
    `<path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#2563eb" />`,
    `</marker>`,
    `<marker id="seq-arrow-dashed" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">`,
    `<path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#0891b2" />`,
    `</marker>`,
    `</defs>`,
    `<rect width="${layout.width}" height="${layout.height}" fill="#f8fafc" />`,
    `<rect x="0" y="0" width="${layout.width}" height="${layout.headerHeight}" fill="#ffffff" />`,
    `<line x1="0" y1="${layout.headerHeight}" x2="${layout.width}" y2="${layout.headerHeight}" stroke="#e2e8f0" stroke-width="1" />`,
    `<rect x="18" y="15" width="32" height="32" rx="8" fill="#4f46e5" />`,
    `<text x="34" y="36" font-family="${SVG_FONT_FAMILY}" font-size="14" font-weight="800" fill="#ffffff" text-anchor="middle">V</text>`,
    `<text x="60" y="30" font-family="${SVG_FONT_FAMILY}" font-size="13.5" font-weight="700" fill="#0f172a">${escapeXml(model.title)}</text>`,
    `<text x="60" y="47" font-family="${SVG_FONT_FAMILY}" font-size="11" font-weight="500" fill="#64748b">${escapeXml(`Sequence Diagram • ${platformTag} • ${model.messages.length} tương tác`)}</text>`,
  ];

  // Lifelines + Actor headers & footers
  for (const actor of model.actors) {
    const cx = layout.actorCenters[actor.id];
    const bx = cx - layout.actorBoxWidth / 2;
    parts.push(
      `<line x1="${cx}" y1="${layout.lifelineStartY}" x2="${cx}" y2="${layout.lifelineEndY}" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="6 5" />`,
      `<rect x="${bx}" y="${layout.actorBoxY}" width="${layout.actorBoxWidth}" height="${layout.actorBoxHeight}" rx="10" fill="${actor.bg}" stroke="${actor.border}" stroke-width="1.4" />`,
      `<text x="${cx}" y="${layout.actorBoxY + 19}" font-family="${SVG_FONT_FAMILY}" font-size="12" font-weight="700" fill="#0f172a" text-anchor="middle">${escapeXml(actor.label)}</text>`,
      `<text x="${cx}" y="${layout.actorBoxY + 34}" font-family="${SVG_FONT_FAMILY}" font-size="10" font-weight="500" fill="#475569" text-anchor="middle">${escapeXml(actor.sublabel)}</text>`,
      `<rect x="${bx}" y="${layout.footerY}" width="${layout.actorBoxWidth}" height="${layout.actorBoxHeight}" rx="10" fill="${actor.bg}" stroke="${actor.border}" stroke-width="1.4" />`,
      `<text x="${cx}" y="${layout.footerY + 19}" font-family="${SVG_FONT_FAMILY}" font-size="12" font-weight="700" fill="#0f172a" text-anchor="middle">${escapeXml(actor.label)}</text>`,
      `<text x="${cx}" y="${layout.footerY + 34}" font-family="${SVG_FONT_FAMILY}" font-size="10" font-weight="500" fill="#475569" text-anchor="middle">${escapeXml(actor.sublabel)}</text>`,
    );
  }

  for (const row of layout.rows) {
    const { message, y, fromX, toX, direction, titleLine, subtitleLine } = row;
    const isActive =
      activeStepIndex !== undefined &&
      activeStepIndex !== null &&
      message.stepIndex === activeStepIndex;

    const strokeColor = isActive
      ? '#2563eb'
      : message.dashed
        ? '#0891b2'
        : '#334155';
    const markerUrl = isActive
      ? 'url(#seq-arrow-active)'
      : message.dashed
        ? 'url(#seq-arrow-dashed)'
        : 'url(#seq-arrow-solid)';
    const dashAttr = message.dashed ? 'stroke-dasharray="6 4"' : '';

    if (isActive) {
      parts.push(
        `<rect x="16" y="${y - 27}" width="${layout.width - 32}" height="50" rx="10" fill="#dbeafe" fill-opacity="0.45" />`,
      );
    }

    if (row.selfCall) {
      const sc = row.selfCall;
      parts.push(
        `<path d="${sc.loopPath}" fill="none" stroke="${strokeColor}" stroke-width="${isActive ? 2.4 : 1.7}" marker-end="${markerUrl}" />`,
        `<rect x="${sc.boxX}" y="${sc.boxY}" width="${sc.boxWidth}" height="${sc.boxHeight}" rx="7" fill="${isActive ? '#eff6ff' : '#ffffff'}" fill-opacity="0.96" stroke="${isActive ? '#93c5fd' : '#e2e8f0'}" stroke-width="1" />`,
        `<text x="${sc.textX}" y="${sc.titleY}" font-family="${SVG_FONT_FAMILY}" font-size="11.5" font-weight="700" fill="${isActive ? '#1d4ed8' : '#0f172a'}">${escapeXml(titleLine)}</text>`,
      );
      if (subtitleLine) {
        parts.push(
          `<text x="${sc.textX}" y="${sc.subtitleY}" font-family="${SVG_FONT_FAMILY}" font-size="10" font-weight="500" fill="#475569">${escapeXml(subtitleLine)}</text>`,
        );
      }
    } else if (row.crossLabel) {
      const cl = row.crossLabel;
      const targetX = toX - direction * 4;
      const pillFill = isActive ? '#e6f0fe' : '#f8fafc';
      parts.push(
        `<line x1="${fromX}" y1="${y}" x2="${targetX}" y2="${y}" stroke="${strokeColor}" stroke-width="${isActive ? 2.5 : 1.8}" ${dashAttr} marker-end="${markerUrl}" />`,
        `<circle cx="${fromX}" cy="${y}" r="3.5" fill="${strokeColor}" />`,
        `<rect x="${cl.boxX}" y="${cl.titleBoxY}" width="${cl.boxWidth}" height="17" rx="4" fill="${pillFill}" fill-opacity="0.92" />`,
        `<text x="${cl.midX}" y="${y - 9}" font-family="${SVG_FONT_FAMILY}" font-size="11.5" font-weight="700" fill="${isActive ? '#1d4ed8' : '#0f172a'}" text-anchor="middle">${escapeXml(titleLine)}</text>`,
      );
      if (subtitleLine) {
        parts.push(
          `<rect x="${cl.boxX}" y="${cl.subtitleBoxY}" width="${cl.boxWidth}" height="15" rx="4" fill="${pillFill}" fill-opacity="0.92" />`,
          `<text x="${cl.midX}" y="${y + 14}" font-family="${SVG_FONT_FAMILY}" font-size="10" font-weight="500" fill="#475569" text-anchor="middle">${escapeXml(subtitleLine)}</text>`,
        );
      }
    }
  }

  parts.push(`</svg>`);
  return parts.join('\n');
}
