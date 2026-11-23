// src/core/prImpactEngine.ts
import { getNodeDisplayLabel, type VisibleFlowResult } from './graphEngine';
import type { ImpactIndex } from './impactAnalyzer';
import { buildQaTestCasesForScenario } from './qaChecklistEngine';
import { buildScenarioTimeline } from './scenarioFlowEngine';
import type { BridgeParityAlert, MiniAppCatalogEntry } from '../data/miniAppBridgeCatalog';
import type { FlowEdgeData, FlowNodeData, MergedFlowDataset, ParityVerdict, Scenario } from '../data/schema';

export interface PrAffectedNode {
  node: FlowNodeData;
  nodeLabel: string;
  branchId: string;
  branchLabel: string;
  matchedFiles: string[];
  parityVerdict?: ParityVerdict;
}

export interface PrAffectedScenario {
  scenario: Scenario;
  parentId: string;
  matchedNodeIds: string[];
  estimatedQaCaseCount: number;
}

export interface PrImpactReport {
  changedFiles: string[];
  matchedFiles: string[];
  unmatchedFiles: string[];
  affectedNodes: PrAffectedNode[];
  affectedScenarios: PrAffectedScenario[];
  affectedMiniApps: MiniAppCatalogEntry[];
  parityAlerts: BridgeParityAlert[];
}

export type CodeDriftStatus = 'missing_file' | 'stale' | 'unverified_date' | 'fresh';

export interface CodeDriftFileDetail {
  ref: string;
  exists: boolean;
  lastCommitDate?: string;
}

export interface CodeDriftNodeItem {
  nodeId: string;
  nodeLabel: string;
  status: CodeDriftStatus;
  lastVerifiedAt?: string;
  newestCommitDate?: string;
  files: CodeDriftFileDetail[];
}

export interface CodeDriftReport {
  totalCheckedNodes: number;
  missingFileCount: number;
  staleCount: number;
  unverifiedDateCount: number;
  freshCount: number;
  items: CodeDriftNodeItem[];
}

function normalizePathToken(raw: string): string {
  let clean = raw.trim().replace(/^["']|["']$/g, '').replace(/\\/g, '/');
  clean = clean.replace(/^(a|b)\//, '').replace(/^\.\//, '').replace(/^\/+/, '');
  return clean;
}

export function parseChangedFileList(raw: string): string[] {
  if (!raw.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];

  for (const rawLine of raw.split(/[\r\n,]+/)) {
    let line = rawLine.trim();
    if (!line) continue;

    // Handle git status --porcelain lines: " M path/to/file" or "R  old -> new"
    const porcelainMatch = /^[ MADRCU?!]{1,2}\s+(.+)$/.exec(line);
    if (porcelainMatch && (rawLine.startsWith(' ') || /^[MADRCU?!]{1,2}\s/.test(rawLine))) {
      line = porcelainMatch[1].trim();
    }
    const renameIdx = line.indexOf(' -> ');
    if (renameIdx >= 0) {
      line = line.slice(renameIdx + 4).trim();
    }

    const norm = normalizePathToken(line);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }

  return out;
}

function stripRepoRootPrefix(p: string): string {
  return p.replace(/^(VBot-iOS|VBot-Android)\//i, '');
}

function doesChangedFileMatchCodeRef(changedFile: string, codeRef: string): boolean {
  const c = normalizePathToken(changedFile).toLowerCase();
  const r = normalizePathToken(codeRef).toLowerCase();
  if (!c || !r) return false;
  if (c === r) return true;

  const cStripped = stripRepoRootPrefix(c);
  const rStripped = stripRepoRootPrefix(r);
  if (cStripped === rStripped) return true;

  if (c.includes('/')) {
    if (c.endsWith(`/${r}`) || c.endsWith(`/${rStripped}`) || r.endsWith(`/${c}`) || rStripped.endsWith(`/${cStripped}`)) {
      return true;
    }
  } else {
    // Bare filename input (e.g. "MiniAppService.swift")
    const rBase = r.split('/').pop() ?? '';
    if (rBase === c) return true;
  }

  return false;
}

function buildDatasetFlatFlow(dataset: MergedFlowDataset): VisibleFlowResult {
  const nodes: FlowNodeData[] = [dataset.rootNode, ...dataset.branches];
  const edges: FlowEdgeData[] = [...dataset.branchEdges];
  const nodeParentMap: Record<string, string> = {};
  const activeScenarios: Scenario[] = [];
  const seenIds = new Set<string>(nodes.map((n) => n.id));

  for (const branch of dataset.branches) {
    nodeParentMap[branch.id] = dataset.rootNode.id;
  }
  for (const [parentId, sub] of Object.entries(dataset.subtreesByParentId)) {
    for (const node of sub.nodes) {
      if (!seenIds.has(node.id)) {
        seenIds.add(node.id);
        nodes.push(node);
      }
      if (!nodeParentMap[node.id]) {
        nodeParentMap[node.id] = parentId;
      }
    }
    edges.push(...sub.edges);
    if (sub.scenarios?.length) {
      activeScenarios.push(...sub.scenarios);
    }
  }

  return { nodes, edges, nodeParentMap, activeScenarios };
}

function collectNodeCodeRefs(node: FlowNodeData): string[] {
  const set = new Set<string>(node.techDetail?.codeRefs ?? []);
  for (const r of node.techDetail?.byPlatform?.ios?.codeRefs ?? []) set.add(r);
  for (const r of node.techDetail?.byPlatform?.android?.codeRefs ?? []) set.add(r);
  return [...set];
}

export function analyzePrImpact(
  index: ImpactIndex,
  changedFiles: readonly string[],
  dataset: MergedFlowDataset,
): PrImpactReport {
  const cleanFiles = [...new Set(changedFiles.map(normalizePathToken).filter(Boolean))];
  if (cleanFiles.length === 0) {
    return {
      changedFiles: [],
      matchedFiles: [],
      unmatchedFiles: [],
      affectedNodes: [],
      affectedScenarios: [],
      affectedMiniApps: [],
      parityAlerts: [],
    };
  }

  const matchedFileSet = new Set<string>();
  const affectedNodes: PrAffectedNode[] = [];
  const affectedNodeIds = new Set<string>();
  const affectedMiniAppIds = new Set<string>();

  for (const hit of index.nodeHits.values()) {
    const codeRefs = collectNodeCodeRefs(hit.node);
    if (codeRefs.length === 0) continue;

    const hitFiles: string[] = [];
    for (const file of cleanFiles) {
      if (codeRefs.some((ref) => doesChangedFileMatchCodeRef(file, ref))) {
        hitFiles.push(file);
        matchedFileSet.add(file);
      }
    }

    if (hitFiles.length > 0) {
      affectedNodeIds.add(hit.node.id);
      affectedNodes.push({
        node: hit.node,
        nodeLabel: hit.nodeLabel,
        branchId: hit.branchId,
        branchLabel: hit.branchLabel,
        matchedFiles: hitFiles,
        parityVerdict: hit.node.techDetail?.parityAssessment?.verdict,
      });
      for (const tok of hit.tokens) {
        if (tok.axis === 'miniapp') affectedMiniAppIds.add(tok.token);
      }
    }
  }

  const flatFlow = buildDatasetFlatFlow(dataset);
  const affectedScenarios: PrAffectedScenario[] = [];
  for (const entry of index.scenarios) {
    const overlap = entry.scenario.nodeIds.filter((id) => affectedNodeIds.has(id));
    if (overlap.length > 0) {
      const timeline = buildScenarioTimeline(entry.scenario, flatFlow, 'tech');
      const qaCases = buildQaTestCasesForScenario(timeline, 'compare');
      affectedScenarios.push({
        scenario: entry.scenario,
        parentId: entry.parentId,
        matchedNodeIds: overlap,
        estimatedQaCaseCount: qaCases.length,
      });
    }
  }

  const affectedMiniApps = index.catalog.filter(
    (app) =>
      affectedMiniAppIds.has(app.id) ||
      (app.relatedNodeId ? affectedNodeIds.has(app.relatedNodeId) : false),
  );

  const parityAlerts = index.parityAlerts.filter(
    (al) => al.relatedNodeId && affectedNodeIds.has(al.relatedNodeId),
  );

  return {
    changedFiles: cleanFiles,
    matchedFiles: cleanFiles.filter((f) => matchedFileSet.has(f)),
    unmatchedFiles: cleanFiles.filter((f) => !matchedFileSet.has(f)),
    affectedNodes,
    affectedScenarios,
    affectedMiniApps,
    parityAlerts,
  };
}

export function exportPrRegressionMarkdown(report: PrImpactReport): string {
  const lines: string[] = [
    '# PR Impact & Regression Checklist',
    '',
    `- **Tổng số file thay đổi:** ${report.changedFiles.length} (khớp sơ đồ: ${report.matchedFiles.length}, chưa map: ${report.unmatchedFiles.length})`,
    `- **Node bị ảnh hưởng:** ${report.affectedNodes.length}`,
    `- **Kịch bản QA cần test lại:** ${report.affectedScenarios.length}`,
    '',
  ];

  if (report.affectedScenarios.length > 0) {
    lines.push('## Kịch bản Regression Test');
    for (const sc of report.affectedScenarios) {
      lines.push(
        `- [ ] **${sc.scenario.name}** (${sc.estimatedQaCaseCount} QA test cases · đụng ${sc.matchedNodeIds.length} bước)`,
      );
    }
    lines.push('');
  }

  if (report.affectedNodes.length > 0) {
    lines.push('## Danh sách Node bị ảnh hưởng');
    for (const n of report.affectedNodes) {
      lines.push(
        `- **${n.nodeLabel}** (\`${n.node.id}\` · ${n.branchLabel}): ${n.matchedFiles.map((f) => `\`${f}\``).join(', ')}`,
      );
    }
    lines.push('');
  }

  if (report.unmatchedFiles.length > 0) {
    lines.push('## File chưa có trong `codeRefs` (cân nhắc bổ sung tài liệu)');
    for (const f of report.unmatchedFiles) {
      lines.push(`- \`${f}\``);
    }
    lines.push('');
  }

  return lines.join('\n');
}

const DRIFT_PRIORITY: Record<CodeDriftStatus, number> = {
  missing_file: 0,
  stale: 1,
  unverified_date: 2,
  fresh: 3,
};

export function evaluateCodeDrift(
  dataset: MergedFlowDataset,
  gitFiles: Record<string, { exists: boolean; lastCommitDate?: string }>,
): CodeDriftReport {
  const allNodes: FlowNodeData[] = [dataset.rootNode, ...dataset.branches];
  const seen = new Set<string>(allNodes.map((n) => n.id));
  for (const sub of Object.values(dataset.subtreesByParentId)) {
    for (const n of sub.nodes) {
      if (!seen.has(n.id)) {
        seen.add(n.id);
        allNodes.push(n);
      }
    }
  }

  const items: CodeDriftNodeItem[] = [];
  for (const node of allNodes) {
    const refs = collectNodeCodeRefs(node);
    const checkedFiles: CodeDriftFileDetail[] = [];
    for (const ref of refs) {
      const info = gitFiles[ref];
      if (!info) continue;
      checkedFiles.push({
        ref,
        exists: info.exists,
        lastCommitDate: info.lastCommitDate,
      });
    }
    if (checkedFiles.length === 0) continue;

    const hasMissing = checkedFiles.some((f) => !f.exists);
    let newestCommitDate: string | undefined;
    for (const f of checkedFiles) {
      if (f.lastCommitDate && (!newestCommitDate || f.lastCommitDate > newestCommitDate)) {
        newestCommitDate = f.lastCommitDate;
      }
    }
    const lastVerifiedAt = node.meta?.lastVerifiedAt;

    let status: CodeDriftStatus = 'fresh';
    if (hasMissing) {
      status = 'missing_file';
    } else if (newestCommitDate && lastVerifiedAt && newestCommitDate > lastVerifiedAt) {
      status = 'stale';
    } else if (!lastVerifiedAt) {
      status = 'unverified_date';
    }

    items.push({
      nodeId: node.id,
      nodeLabel: getNodeDisplayLabel(node, 'tech'),
      status,
      lastVerifiedAt,
      newestCommitDate,
      files: checkedFiles,
    });
  }

  items.sort((a, b) => DRIFT_PRIORITY[a.status] - DRIFT_PRIORITY[b.status] || a.nodeLabel.localeCompare(b.nodeLabel));

  return {
    totalCheckedNodes: items.length,
    missingFileCount: items.filter((i) => i.status === 'missing_file').length,
    staleCount: items.filter((i) => i.status === 'stale').length,
    unverifiedDateCount: items.filter((i) => i.status === 'unverified_date').length,
    freshCount: items.filter((i) => i.status === 'fresh').length,
    items,
  };
}
