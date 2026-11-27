// src/core/apiAtlasEngine.ts
import { getNodeDisplayLabel } from './graphEngine';
import type { FlowNodeData, MergedFlowDataset, Platform } from '../data/schema';

export type ApiAtlasKind = 'rest' | 'websocket' | 'sip_dtmf' | 'bridge' | 'error_code';

export interface ApiAtlasNodeRef {
  nodeId: string;
  nodeLabel: string;
  branchId: string;
  branchLabel: string;
  iosOnly: boolean;
  androidOnly: boolean;
  hasParityDiff: boolean;
  codeRefs: string[];
}

export interface ApiAtlasEntry {
  id: string;
  kind: ApiAtlasKind;
  token: string;
  normalizedKey: string;
  platforms: Platform[];
  hasPlatformMismatch: boolean;
  mismatchNote?: string;
  nodes: ApiAtlasNodeRef[];
}

export interface ApiAtlasReport {
  totalEntries: number;
  mismatchCount: number;
  byKind: Record<ApiAtlasKind, number>;
  entries: ApiAtlasEntry[];
}

function classifyApiOrEventToken(raw: string): ApiAtlasKind {
  const lower = raw.toLowerCase();
  if (
    /\b(?:ws|wss|socket|websocket|vbot\.state|update_state|pong|subscribe)\b/i.test(lower)
  ) {
    return 'websocket';
  }
  if (/\b(?:sip|pjsip|dtmf|callkit|pushkit|bgapi|freeswitch|codec|rtp)\b/i.test(lower)) {
    return 'sip_dtmf';
  }
  if (
    /^(?:401|403|404|409|429|500|502|503|803|-1)\b/.test(lower) ||
    /\b(?:error_code|err_|http\s*[45]\d\d|status\s*[45]\d\d)\b/i.test(lower)
  ) {
    return 'error_code';
  }
  return 'rest';
}

function collectBranchNodes(dataset: MergedFlowDataset): Array<{
  node: FlowNodeData;
  branchId: string;
  branchLabel: string;
}> {
  const list: Array<{ node: FlowNodeData; branchId: string; branchLabel: string }> = [
    {
      node: dataset.rootNode,
      branchId: dataset.rootNode.id,
      branchLabel: getNodeDisplayLabel(dataset.rootNode, 'tech'),
    },
  ];
  const seen = new Set<string>([dataset.rootNode.id]);

  const walk = (
    parentId: string,
    branchId: string,
    branchLabel: string,
    visited = new Set<string>(),
  ) => {
    if (visited.has(parentId)) return;
    visited.add(parentId);
    const sub = dataset.subtreesByParentId[parentId];
    if (!sub) return;
    for (const node of sub.nodes) {
      if (!seen.has(node.id)) {
        seen.add(node.id);
        list.push({ node, branchId, branchLabel });
      }
      if (dataset.subtreesByParentId[node.id]) {
        walk(node.id, branchId, branchLabel, visited);
      }
    }
  };

  for (const b of dataset.branches) {
    const bLabel = getNodeDisplayLabel(b, 'tech');
    if (!seen.has(b.id)) {
      seen.add(b.id);
      list.push({ node: b, branchId: b.id, branchLabel: bLabel });
    }
    walk(b.id, b.id, bLabel);
  }

  return list;
}

function collectNodeCodeRefs(node: FlowNodeData): string[] {
  const refs = new Set<string>(node.techDetail?.codeRefs ?? []);
  for (const r of node.techDetail?.byPlatform?.ios?.codeRefs ?? []) refs.add(r);
  for (const r of node.techDetail?.byPlatform?.android?.codeRefs ?? []) refs.add(r);
  return [...refs];
}

/**
 * Tổng hợp toàn bộ REST API, WebSocket, SIP/DTMF, Bridge Method và Error Code trên toàn dataset.
 */
export function buildApiAtlas(dataset: MergedFlowDataset): ApiAtlasReport {
  const map = new Map<
    string,
    {
      kind: ApiAtlasKind;
      token: string;
      normalizedKey: string;
      platforms: Set<Platform>;
      hasPlatformMismatch: boolean;
      mismatchNotes: Set<string>;
      nodes: Map<string, ApiAtlasNodeRef>;
    }
  >();

  const register = (params: {
    kind: ApiAtlasKind;
    token: string;
    node: FlowNodeData;
    branchId: string;
    branchLabel: string;
    iosPresent: boolean;
    androidPresent: boolean;
    hasParityDiff: boolean;
    mismatchNote?: string;
  }) => {
    const cleanToken = params.token.trim();
    if (!cleanToken) return;
    const normalizedKey = cleanToken.toLowerCase();
    const mapKey = `${params.kind}::${normalizedKey}`;
    const existing =
      map.get(mapKey) ??
      {
        kind: params.kind,
        token: cleanToken,
        normalizedKey,
        platforms: new Set<Platform>(),
        hasPlatformMismatch: false,
        mismatchNotes: new Set<string>(),
        nodes: new Map<string, ApiAtlasNodeRef>(),
      };

    if (params.iosPresent) existing.platforms.add('ios');
    if (params.androidPresent) existing.platforms.add('android');

    const iosOnly = params.iosPresent && !params.androidPresent;
    const androidOnly = params.androidPresent && !params.iosPresent;
    if (iosOnly || androidOnly || params.hasParityDiff) {
      existing.hasPlatformMismatch = true;
    }
    if (params.mismatchNote) {
      existing.mismatchNotes.add(params.mismatchNote);
    }

    if (!existing.nodes.has(params.node.id)) {
      existing.nodes.set(params.node.id, {
        nodeId: params.node.id,
        nodeLabel: getNodeDisplayLabel(params.node, 'tech'),
        branchId: params.branchId,
        branchLabel: params.branchLabel,
        iosOnly,
        androidOnly,
        hasParityDiff: params.hasParityDiff,
        codeRefs: collectNodeCodeRefs(params.node),
      });
    }

    map.set(mapKey, existing);
  };

  for (const { node, branchId, branchLabel } of collectBranchNodes(dataset)) {
    const detail = node.techDetail;
    if (!detail) continue;

    const verdict = detail.parityAssessment?.verdict;
    const nodeHasParityDiff = Boolean(
      verdict === 'action_needed' ||
        verdict === 'logic_diff' ||
        detail.platformDiffNote,
    );
    const nodeAllowsIos = !node.platforms || node.platforms.includes('ios');
    const nodeAllowsAndroid = !node.platforms || node.platforms.includes('android');

    const iosOnlyApiSet = new Set(detail.byPlatform?.ios?.apisOrEvents ?? []);
    const androidOnlyApiSet = new Set(detail.byPlatform?.android?.apisOrEvents ?? []);

    for (const api of detail.apisOrEvents ?? []) {
      register({
        kind: classifyApiOrEventToken(api),
        token: api,
        node,
        branchId,
        branchLabel,
        iosPresent: nodeAllowsIos,
        androidPresent: nodeAllowsAndroid,
        hasParityDiff: nodeHasParityDiff,
        mismatchNote: detail.parityAssessment?.explanation ?? detail.platformDiffNote,
      });
    }

    for (const api of iosOnlyApiSet) {
      const inAndroid = androidOnlyApiSet.has(api);
      register({
        kind: classifyApiOrEventToken(api),
        token: api,
        node,
        branchId,
        branchLabel,
        iosPresent: true,
        androidPresent: inAndroid,
        hasParityDiff: nodeHasParityDiff || !inAndroid,
        mismatchNote: !inAndroid
          ? `Chỉ thấy ở byPlatform.ios trong node ${node.id}`
          : detail.parityAssessment?.explanation,
      });
    }

    for (const api of androidOnlyApiSet) {
      if (iosOnlyApiSet.has(api)) continue;
      register({
        kind: classifyApiOrEventToken(api),
        token: api,
        node,
        branchId,
        branchLabel,
        iosPresent: false,
        androidPresent: true,
        hasParityDiff: true,
        mismatchNote: `Chỉ thấy ở byPlatform.android trong node ${node.id}`,
      });
    }

    for (const msg of detail.miniAppBridge?.messages ?? []) {
      register({
        kind: 'bridge',
        token: `${msg.direction}: ${msg.name}`,
        node,
        branchId,
        branchLabel,
        iosPresent: nodeAllowsIos,
        androidPresent: nodeAllowsAndroid,
        hasParityDiff: Boolean(msg.parityNote),
        mismatchNote: msg.parityNote,
      });
    }

    const edgeCaseBlob = [
      ...(detail.edgeCases ?? []),
      ...(detail.byPlatform?.ios?.edgeCases ?? []),
      ...(detail.byPlatform?.android?.edgeCases ?? []),
    ].join('\n');
    const codeMatches = edgeCaseBlob.match(/\b(?:401|403|404|409|429|500|502|503|803)\b/g) ?? [];
    for (const code of new Set(codeMatches)) {
      register({
        kind: 'error_code',
        token: `Error ${code}`,
        node,
        branchId,
        branchLabel,
        iosPresent: nodeAllowsIos,
        androidPresent: nodeAllowsAndroid,
        hasParityDiff: nodeHasParityDiff,
        mismatchNote: detail.parityAssessment?.explanation,
      });
    }
  }

  const entries: ApiAtlasEntry[] = [...map.entries()]
    .map(([id, item]) => ({
      id,
      kind: item.kind,
      token: item.token,
      normalizedKey: item.normalizedKey,
      platforms: [...item.platforms],
      hasPlatformMismatch: item.hasPlatformMismatch,
      mismatchNote: [...item.mismatchNotes][0],
      nodes: [...item.nodes.values()],
    }))
    .sort((a, b) => {
      if (a.hasPlatformMismatch !== b.hasPlatformMismatch) {
        return a.hasPlatformMismatch ? -1 : 1;
      }
      if (b.nodes.length !== a.nodes.length) {
        return b.nodes.length - a.nodes.length;
      }
      return a.token.localeCompare(b.token);
    });

  const byKind: Record<ApiAtlasKind, number> = {
    rest: 0,
    websocket: 0,
    sip_dtmf: 0,
    bridge: 0,
    error_code: 0,
  };
  let mismatchCount = 0;
  for (const e of entries) {
    byKind[e.kind] += 1;
    if (e.hasPlatformMismatch) mismatchCount += 1;
  }

  return {
    totalEntries: entries.length,
    mismatchCount,
    byKind,
    entries,
  };
}

export function exportApiAtlasMarkdown(report: ApiAtlasReport): string {
  const lines = [
    '# VBot API, WebSocket, SIP & Bridge Atlas',
    '',
    `- **Tổng số mục:** ${report.totalEntries} (${report.mismatchCount} mục có cảnh báo lệch iOS ↔ Android)`,
    `- **REST:** ${report.byKind.rest} · **WebSocket:** ${report.byKind.websocket} · **SIP/DTMF:** ${report.byKind.sip_dtmf} · **Bridge:** ${report.byKind.bridge} · **Error Code:** ${report.byKind.error_code}`,
    '',
  ];

  for (const entry of report.entries) {
    lines.push(
      `## [${entry.kind.toUpperCase()}] \`${entry.token}\`${entry.hasPlatformMismatch ? ' ⚠️ Lệch iOS/Android' : ''}`,
    );
    if (entry.mismatchNote) {
      lines.push(`- **Ghi chú lệch:** ${entry.mismatchNote}`);
    }
    for (const n of entry.nodes) {
      lines.push(`- Node \`${n.nodeId}\` (${n.nodeLabel}) — nhánh ${n.branchLabel}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
