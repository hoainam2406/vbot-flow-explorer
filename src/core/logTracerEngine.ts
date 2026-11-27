// src/core/logTracerEngine.ts
import { findNodeById, getNodeDisplayLabel } from './graphEngine';
import type { DevWorkspaceSettings } from './workspaceSettings';
import type { FlowNodeData, MergedFlowDataset } from '../data/schema';

export type LogMatchReason = 'code_ref' | 'api_event' | 'bridge_method' | 'error_code';
export type LogSeverity = 'info' | 'warn' | 'error';

export interface LogTraceHit {
  stepOrder: number;
  lineNumber: number;
  rawLine: string;
  nodeId: string;
  nodeLabel: string;
  branchId: string;
  matchReason: LogMatchReason;
  matchedToken: string;
  severity: LogSeverity;
}

export interface LogTraceReport {
  totalLines: number;
  matchedLineCount: number;
  orderedNodeIds: string[];
  suspectedErrorNodeIds: string[];
  hits: LogTraceHit[];
  detectedErrorCodes: string[];
  detectedPlatform: 'ios' | 'android' | 'mixed' | 'unknown';
  filteredLogSnippet: string;
}

interface NodeTokenIndex {
  node: FlowNodeData;
  branchId: string;
  codeTokens: string[];
  apiTokens: string[];
  bridgeTokens: string[];
  errorCodes: string[];
}

const MAX_SCAN_LINES = 5000;
const ERROR_LINE_RE =
  /\b(?:error|exception|fatal|crash|failed|failure|timeout|timed out|unauthorized|forbidden|rejected|401|403|404|409|429|500|502|503|803)\b/i;
const WARN_LINE_RE = /\b(?:warn|warning|retry|reconnect|fallback|cancelled|canceled)\b/i;
const ERROR_CODE_EXTRACT_RE = /\b(401|403|404|409|429|500|502|503|803)\b/g;

function collectAllNodesWithBranch(dataset: MergedFlowDataset): Array<{
  node: FlowNodeData;
  branchId: string;
}> {
  const result: Array<{ node: FlowNodeData; branchId: string }> = [
    { node: dataset.rootNode, branchId: dataset.rootNode.id },
  ];
  const seen = new Set<string>([dataset.rootNode.id]);

  const walkSubtree = (parentId: string, branchId: string, visited = new Set<string>()) => {
    if (visited.has(parentId)) return;
    visited.add(parentId);
    const sub = dataset.subtreesByParentId[parentId];
    if (!sub) return;
    for (const n of sub.nodes) {
      if (!seen.has(n.id)) {
        seen.add(n.id);
        result.push({ node: n, branchId });
      }
      if (dataset.subtreesByParentId[n.id]) {
        walkSubtree(n.id, branchId, visited);
      }
    }
  };

  for (const branch of dataset.branches) {
    if (!seen.has(branch.id)) {
      seen.add(branch.id);
      result.push({ node: branch, branchId: branch.id });
    }
    walkSubtree(branch.id, branch.id);
  }

  for (const [parentId, sub] of Object.entries(dataset.subtreesByParentId)) {
    for (const n of sub.nodes) {
      if (!seen.has(n.id)) {
        seen.add(n.id);
        result.push({ node: n, branchId: parentId });
      }
    }
  }

  return result;
}

function extractCodeRefTokens(node: FlowNodeData): string[] {
  const rawRefs = [
    ...(node.techDetail?.codeRefs ?? []),
    ...(node.techDetail?.byPlatform?.ios?.codeRefs ?? []),
    ...(node.techDetail?.byPlatform?.android?.codeRefs ?? []),
  ];
  const tokens = new Set<string>();
  for (const ref of rawRefs) {
    const clean = ref.trim().replace(/\\/g, '/');
    if (!clean) continue;
    const base = clean.split('/').pop()?.split(':')[0]?.trim() ?? '';
    if (base.length >= 4) {
      tokens.add(base.toLowerCase());
      const stem = base.replace(/\.(swift|kt|kts|java|ts|tsx|js|vue)$/i, '');
      if (stem.length >= 4) {
        tokens.add(stem.toLowerCase());
      }
    }
  }
  return [...tokens];
}

function extractApiTokens(node: FlowNodeData): string[] {
  const rawApis = [
    ...(node.techDetail?.apisOrEvents ?? []),
    ...(node.techDetail?.byPlatform?.ios?.apisOrEvents ?? []),
    ...(node.techDetail?.byPlatform?.android?.apisOrEvents ?? []),
  ];
  const tokens = new Set<string>();
  for (const raw of rawApis) {
    const clean = raw.trim();
    if (!clean) continue;
    // Lấy URL path như /api/project/get-state hoặc event như UPDATE_STATE, vbot.state
    const pathMatches = clean.match(/(?:\/[a-z0-9._-]+){2,}/gi) ?? [];
    for (const p of pathMatches) {
      tokens.add(p.toLowerCase());
    }
    const wordMatches = clean.match(/\b[a-zA-Z_][a-zA-Z0-9_.-]{3,}\b/g) ?? [];
    for (const w of wordMatches) {
      const lower = w.toLowerCase();
      if (
        lower === 'https' ||
        lower === 'http' ||
        lower === 'post' ||
        lower === 'get' ||
        lower === 'delete' ||
        lower === 'push' ||
        lower === 'json'
      ) {
        continue;
      }
      if (
        w.includes('_') ||
        w.includes('.') ||
        /[a-z][A-Z]/.test(w) ||
        /^[A-Z0-9_]{4,}$/.test(w)
      ) {
        tokens.add(lower);
      }
    }
  }
  return [...tokens];
}

function extractBridgeTokens(node: FlowNodeData): string[] {
  const bridge = node.techDetail?.miniAppBridge;
  if (!bridge) return [];
  const tokens = new Set<string>();
  if (bridge.miniAppId.startsWith('vb-ma-')) {
    tokens.add(bridge.miniAppId.toLowerCase());
  }
  for (const msg of bridge.messages) {
    if (msg.name.length >= 4) tokens.add(msg.name.toLowerCase());
    if (msg.miniAppFn) {
      const fnMatch = /[a-zA-Z_][a-zA-Z0-9_]{3,}/.exec(msg.miniAppFn);
      if (fnMatch) tokens.add(fnMatch[0].toLowerCase());
    }
  }
  return [...tokens];
}

function extractNodeErrorCodes(node: FlowNodeData): string[] {
  const texts = [
    node.summary.overview,
    node.summary.tech ?? '',
    ...(node.techDetail?.edgeCases ?? []),
    ...(node.techDetail?.byPlatform?.ios?.edgeCases ?? []),
    ...(node.techDetail?.byPlatform?.android?.edgeCases ?? []),
  ].join(' ');
  const codes = new Set<string>();
  for (const m of texts.matchAll(ERROR_CODE_EXTRACT_RE)) {
    if (m[1]) codes.add(m[1]);
  }
  return [...codes];
}

function detectLogLineSeverity(line: string): LogSeverity {
  if (ERROR_LINE_RE.test(line)) return 'error';
  if (WARN_LINE_RE.test(line)) return 'warn';
  return 'info';
}

/**
 * Phân tích log Xcode / Logcat / WebSocket / SIP / Bridge và ánh xạ thành chuỗi node thực thi trên đồ thị.
 */
export function traceLogAgainstDataset(
  rawLog: string,
  dataset: MergedFlowDataset,
  options?: { maxHits?: number },
): LogTraceReport {
  const maxHits = options?.maxHits ?? 150;
  const rawLines = rawLog.split(/\r?\n/);
  const lines = rawLines.slice(0, MAX_SCAN_LINES);

  const nodeEntries = collectAllNodesWithBranch(dataset).map<NodeTokenIndex>(
    ({ node, branchId }) => ({
      node,
      branchId,
      codeTokens: extractCodeRefTokens(node),
      apiTokens: extractApiTokens(node),
      bridgeTokens: extractBridgeTokens(node),
      errorCodes: extractNodeErrorCodes(node),
    }),
  );

  let iosSignals = 0;
  let androidSignals = 0;
  const detectedErrorCodeSet = new Set<string>();
  const hits: LogTraceHit[] = [];
  const orderedNodeIds: string[] = [];
  const orderedNodeSet = new Set<string>();
  const suspectedErrorNodeSet = new Set<string>();
  const matchedLineNumbers = new Set<number>();

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i] ?? '';
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    const lower = trimmed.toLowerCase();
    if (/\.swift\b|wkwebview|callkit|pushkit|vbot-ios|uiviewcontroller/i.test(trimmed)) {
      iosSignals += 1;
    }
    if (/\.kt\b|androidruntime|okhttp|callstyle|vbot-android|vbmabridge|logcat/i.test(trimmed)) {
      androidSignals += 1;
    }

    for (const m of trimmed.matchAll(ERROR_CODE_EXTRACT_RE)) {
      if (m[1]) detectedErrorCodeSet.add(m[1]);
    }

    const severity = detectLogLineSeverity(trimmed);
    let bestMatch: {
      entry: NodeTokenIndex;
      reason: LogMatchReason;
      token: string;
      score: number;
    } | null = null;

    for (const entry of nodeEntries) {
      let reason: LogMatchReason | null = null;
      let token = '';
      let score = 0;

      for (const ct of entry.codeTokens) {
        if (lower.includes(ct) && ct.length > token.length) {
          reason = 'code_ref';
          token = ct;
          score = 100 + ct.length;
        }
      }
      if (!reason) {
        for (const bt of entry.bridgeTokens) {
          if (lower.includes(bt) && bt.length > token.length) {
            reason = 'bridge_method';
            token = bt;
            score = 80 + bt.length;
          }
        }
      }
      if (!reason) {
        for (const at of entry.apiTokens) {
          if (lower.includes(at) && at.length > token.length) {
            reason = 'api_event';
            token = at;
            score = 60 + at.length;
          }
        }
      }
      if (!reason && severity === 'error') {
        for (const ec of entry.errorCodes) {
          if (new RegExp(`\\b${ec}\\b`).test(trimmed)) {
            reason = 'error_code';
            token = `HTTP/ERR ${ec}`;
            score = 30;
            break;
          }
        }
      }

      if (reason && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { entry, reason, token, score };
      }
    }

    if (!bestMatch) continue;

    const nodeId = bestMatch.entry.node.id;
    const prevHit = hits[hits.length - 1];
    matchedLineNumbers.add(i + 1);

    if (severity === 'error') {
      suspectedErrorNodeSet.add(nodeId);
    }

    if (
      prevHit &&
      prevHit.nodeId === nodeId &&
      prevHit.matchReason === bestMatch.reason &&
      prevHit.severity === severity
    ) {
      continue;
    }

    if (hits.length < maxHits) {
      hits.push({
        stepOrder: hits.length + 1,
        lineNumber: i + 1,
        rawLine: trimmed.length > 260 ? `${trimmed.slice(0, 260)}...` : trimmed,
        nodeId,
        nodeLabel: getNodeDisplayLabel(bestMatch.entry.node, 'tech'),
        branchId: bestMatch.entry.branchId,
        matchReason: bestMatch.reason,
        matchedToken: bestMatch.token,
        severity,
      });
    }

    if (!orderedNodeSet.has(nodeId)) {
      orderedNodeSet.add(nodeId);
      orderedNodeIds.push(nodeId);
    }
  }

  let detectedPlatform: LogTraceReport['detectedPlatform'] = 'unknown';
  if (iosSignals > 0 && androidSignals > 0) detectedPlatform = 'mixed';
  else if (iosSignals > 0) detectedPlatform = 'ios';
  else if (androidSignals > 0) detectedPlatform = 'android';

  const filteredLogSnippet = hits
    .slice(0, 30)
    .map((h) => `[L${h.lineNumber}] (${h.severity.toUpperCase()} · ${h.nodeId}) ${h.rawLine}`)
    .join('\n');

  return {
    totalLines: lines.length,
    matchedLineCount: matchedLineNumbers.size,
    orderedNodeIds,
    suspectedErrorNodeIds: [...suspectedErrorNodeSet],
    hits,
    detectedErrorCodes: [...detectedErrorCodeSet],
    detectedPlatform,
    filteredLogSnippet,
  };
}

export function buildLogTraceAiDebugPrompt(
  report: LogTraceReport,
  dataset: MergedFlowDataset,
  settings?: DevWorkspaceSettings,
): string {
  const codeRefs = new Set<string>();
  const nodeLines: string[] = [];

  for (const nodeId of report.orderedNodeIds) {
    const node = findNodeById(dataset, nodeId);
    if (!node) continue;
    const isErr = report.suspectedErrorNodeIds.includes(nodeId);
    nodeLines.push(
      `- ${isErr ? '🔴 [NGHI LỖI] ' : ''}\`${node.id}\` — **${getNodeDisplayLabel(node, 'tech')}**`,
    );
    for (const ref of node.techDetail?.codeRefs ?? []) codeRefs.add(ref);
    for (const ref of node.techDetail?.byPlatform?.ios?.codeRefs ?? []) codeRefs.add(ref);
    for (const ref of node.techDetail?.byPlatform?.android?.codeRefs ?? []) codeRefs.add(ref);
  }

  const lines: string[] = [
    '# [DEBUG TRACE] Phân tích lỗi theo Log thực tế trên VBot',
    '',
    `- **Nền tảng phát hiện trong log:** \`${report.detectedPlatform}\``,
    `- **Nhánh đối soát:** \`${settings?.branchOverride?.trim() || dataset.app.techBranch || 'Nam-dev'}\``,
    `- **Số dòng khớp:** ${report.matchedLineCount}/${report.totalLines} · **Số bước node:** ${report.orderedNodeIds.length}`,
    ...(report.detectedErrorCodes.length > 0
      ? [`- **Mã lỗi phát hiện:** ${report.detectedErrorCodes.map((c) => `\`${c}\``).join(', ')}`]
      : []),
    '',
    '## 1. Chuỗi Node thực thi từ Log',
    ...(nodeLines.length > 0 ? nodeLines : ['- (Không tìm thấy node khớp trực tiếp)']),
  ];

  if (codeRefs.size > 0) {
    lines.push('', '## 2. File mã nguồn liên quan (`codeRefs`)');
    lines.push(...[...codeRefs].map((r) => `- \`${r}\``));
  }

  if (report.filteredLogSnippet) {
    lines.push(
      '',
      '## 3. Các dòng Log quan trọng đã lọc',
      '```text',
      report.filteredLogSnippet,
      '```',
    );
  }

  lines.push(
    '',
    '## Yêu cầu debug',
    '1. Xác định nguyên nhân gốc tại node nghi lỗi và các file `codeRefs` tương ứng.',
    '2. Đề xuất bản vá cụ thể (kèm kiểm tra xử lý retry / 401 / edge cases nếu liên quan).',
  );

  return lines.join('\n') + '\n';
}
