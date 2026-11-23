// src/core/dataHealthEngine.ts
import {
  auditMediaCoverage,
  auditMiniAppConsistency,
  type MediaCoverageReport,
  type MiniAppConsistencyReport,
} from './auditSyncEngine';
import { getNodeDisplayLabel } from './graphEngine';
import { ALL_SANDBOX_COMMANDS } from './miniAppContractBuilder';
import { extractParityReport, type ParitySummary } from './parityAnalyzer';
import { CORE_BRIDGE_SPECS, MINI_APP_CATALOG } from '../data/miniAppBridgeCatalog';
import { MINI_APP_PERMISSION_PROFILES } from '../data/miniAppPermissionMatrix';
import type { FlowNodeData, MergedFlowDataset } from '../data/schema';

export type DataHealthIssueKind =
  | 'missing_edge_cases'
  | 'missing_by_platform'
  | 'missing_last_verified'
  | 'stale_verified';

export interface DataHealthIssue {
  kind: DataHealthIssueKind;
  nodeId: string;
  nodeLabel: string;
  branchId: string;
  branchLabel: string;
  detail: string;
}

export interface BranchParityHealth {
  branchId: string;
  branchLabel: string;
  totalNodes: number;
  parityItems: number;
  actionNeeded: number;
  logicDiff: number;
  osImplOnly: number;
  synced: number;
  syncPercent: number;
}

export interface DataHealthReport {
  overallScore: number;
  totalNodes: number;
  miniAppAudit: MiniAppConsistencyReport;
  mediaCoverage: MediaCoverageReport;
  paritySummary: ParitySummary;
  branchParityHealth: BranchParityHealth[];
  issues: DataHealthIssue[];
  countsByKind: Record<DataHealthIssueKind, number>;
}

function daysBetweenIsoDates(fromDate: string, toDate: string): number {
  const t1 = Date.parse(`${fromDate}T00:00:00Z`);
  const t2 = Date.parse(`${toDate}T00:00:00Z`);
  if (Number.isNaN(t1) || Number.isNaN(t2)) return 0;
  return Math.floor((t2 - t1) / (1000 * 60 * 60 * 24));
}

export function buildDataHealthReport(
  dataset: MergedFlowDataset,
  options?: { referenceDate?: string; staleThresholdDays?: number },
): DataHealthReport {
  const referenceDate =
    options?.referenceDate ?? new Date().toISOString().slice(0, 10);
  const staleThresholdDays = options?.staleThresholdDays ?? 60;

  const miniAppAudit = auditMiniAppConsistency(
    dataset,
    MINI_APP_CATALOG,
    MINI_APP_PERMISSION_PROFILES,
    ALL_SANDBOX_COMMANDS,
    CORE_BRIDGE_SPECS,
  );
  const mediaCoverage = auditMediaCoverage(dataset, dataset.existingMediaPaths ?? []);
  const paritySummary = extractParityReport(dataset);

  const branchNodeCounts = new Map<string, number>();
  const branchLabelMap = new Map<string, string>();
  const nodesWithBranch: Array<{ node: FlowNodeData; branchId: string; branchLabel: string }> = [
    {
      node: dataset.rootNode,
      branchId: dataset.rootNode.id,
      branchLabel: getNodeDisplayLabel(dataset.rootNode, 'tech'),
    },
  ];
  const seen = new Set<string>([dataset.rootNode.id]);

  const walk = (parentId: string, branchId: string, branchLabel: string) => {
    const sub = dataset.subtreesByParentId[parentId];
    if (!sub) return;
    for (const child of sub.nodes) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      nodesWithBranch.push({ node: child, branchId, branchLabel });
      branchNodeCounts.set(branchId, (branchNodeCounts.get(branchId) ?? 0) + 1);
      walk(child.id, branchId, branchLabel);
    }
  };

  for (const branch of dataset.branches) {
    const bLabel = getNodeDisplayLabel(branch, 'tech');
    branchLabelMap.set(branch.id, bLabel);
    branchNodeCounts.set(branch.id, 1);
    if (!seen.has(branch.id)) {
      seen.add(branch.id);
      nodesWithBranch.push({ node: branch, branchId: branch.id, branchLabel: bLabel });
    }
    walk(branch.id, branch.id, bLabel);
  }

  const issues: DataHealthIssue[] = [];
  for (const { node, branchId, branchLabel } of nodesWithBranch) {
    const label = getNodeDisplayLabel(node, 'tech');
    const detail = node.techDetail;

    if (node.kind !== 'module') {
      const hasEdgeCases =
        (detail?.edgeCases?.length ?? 0) > 0 ||
        (detail?.byPlatform?.ios?.edgeCases?.length ?? 0) > 0 ||
        (detail?.byPlatform?.android?.edgeCases?.length ?? 0) > 0;
      if (!hasEdgeCases && (node.kind === 'error' || node.kind === 'decision' || node.kind === 'process')) {
        issues.push({
          kind: 'missing_edge_cases',
          nodeId: node.id,
          nodeLabel: label,
          branchId,
          branchLabel,
          detail: 'Node xử lý/lỗi/điều kiện chưa có danh sách edgeCases.',
        });
      }
    }

    const isSharedPlatform = !node.platforms || node.platforms.length === 2;
    if (isSharedPlatform && node.audience === 'tech' && detail) {
      if (!detail.byPlatform?.ios || !detail.byPlatform?.android) {
        issues.push({
          kind: 'missing_by_platform',
          nodeId: node.id,
          nodeLabel: label,
          branchId,
          branchLabel,
          detail: 'Node kỹ thuật dùng chung 2 OS nhưng thiếu chi tiết byPlatform.ios hoặc byPlatform.android.',
        });
      }
    }

    const verifiedAt = node.meta?.lastVerifiedAt;
    if (!verifiedAt) {
      if (node.audience === 'tech' || detail?.codeRefs?.length) {
        issues.push({
          kind: 'missing_last_verified',
          nodeId: node.id,
          nodeLabel: label,
          branchId,
          branchLabel,
          detail: 'Chưa ghi nhận ngày rà soát (meta.lastVerifiedAt).',
        });
      }
    } else {
      const age = daysBetweenIsoDates(verifiedAt, referenceDate);
      if (age > staleThresholdDays) {
        issues.push({
          kind: 'stale_verified',
          nodeId: node.id,
          nodeLabel: label,
          branchId,
          branchLabel,
          detail: `Đã quá ${age} ngày kể từ lần rà soát ${verifiedAt} (ngưỡng ${staleThresholdDays} ngày).`,
        });
      }
    }
  }

  const branchParityHealth: BranchParityHealth[] = dataset.branches.map((branch) => {
    const items = paritySummary.items.filter((i) => i.branchId === branch.id);
    const actionNeeded = items.filter((i) => i.assessment.verdict === 'action_needed').length;
    const logicDiff = items.filter((i) => i.assessment.verdict === 'logic_diff').length;
    const osImplOnly = items.filter((i) => i.assessment.verdict === 'os_impl_only').length;
    const synced = items.filter((i) => i.assessment.verdict === 'synced').length;
    const total = items.length;
    const resolved = synced + osImplOnly;
    const syncPercent = total === 0 ? 100 : Math.round((resolved / total) * 100);
    return {
      branchId: branch.id,
      branchLabel: branchLabelMap.get(branch.id) ?? branch.label,
      totalNodes: branchNodeCounts.get(branch.id) ?? 1,
      parityItems: total,
      actionNeeded,
      logicDiff,
      osImplOnly,
      synced,
      syncPercent,
    };
  });

  const countsByKind: Record<DataHealthIssueKind, number> = {
    missing_edge_cases: issues.filter((i) => i.kind === 'missing_edge_cases').length,
    missing_by_platform: issues.filter((i) => i.kind === 'missing_by_platform').length,
    missing_last_verified: issues.filter((i) => i.kind === 'missing_last_verified').length,
    stale_verified: issues.filter((i) => i.kind === 'stale_verified').length,
  };

  const mediaRatio = mediaCoverage.total === 0 ? 1 : mediaCoverage.present / mediaCoverage.total;
  const miniAppPenalty = miniAppAudit.errors.length * 10 + miniAppAudit.warnings.length * 3;
  const issuePenalty = Math.min(35, Math.round((issues.length / Math.max(1, nodesWithBranch.length)) * 40));
  const rawScore = Math.round(70 + mediaRatio * 30 - miniAppPenalty - issuePenalty);
  const overallScore = Math.max(0, Math.min(100, rawScore));

  return {
    overallScore,
    totalNodes: nodesWithBranch.length,
    miniAppAudit,
    mediaCoverage,
    paritySummary,
    branchParityHealth,
    issues,
    countsByKind,
  };
}
