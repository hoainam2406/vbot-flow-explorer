// src/core/devDashboardEngine.ts
import { buildFlatManageableNodes, type FlatManageableNode } from './bulkNodeManager';
import type { DevWorkboardState, DevWorkboardTask } from './devWorkboardStore';
import { findNodeById, getNodeDisplayLabel } from './graphEngine';
import { extractParityReport, type ParityItem } from './parityAnalyzer';
import type { ParityTriageStatus } from './vbotWorkTemplates';
import type { FlowNodeData, MergedFlowDataset } from '../data/schema';

export interface DevDashboardSummary {
  branchLabel: string;
  totals: {
    totalNodes: number;
    parityActionNeeded: number;
    parityLogicDiff: number;
    wipCount: number;
    needsReviewCount: number;
    staleCount: number;
    missingVerifiedCount: number;
    pinnedCount: number;
    activeWorkboardTasks: number;
    linkedTaskNodes: number;
  };
  parityQueues: {
    ios: ParityItem[];
    android: ParityItem[];
    both: ParityItem[];
    other: ParityItem[];
  };
  attentionNodes: FlatManageableNode[];
  pinnedSummaries: Array<{
    node: FlowNodeData;
    label: string;
    note: string;
    workTaskUrl?: string;
  }>;
  openTasks: DevWorkboardTask[];
}

export function buildDevDashboardSummary(
  dataset: MergedFlowDataset,
  options?: {
    pinnedNodeIds?: readonly string[];
    devNotesByNodeId?: Record<string, string>;
    workboard?: Pick<DevWorkboardState, 'tasks'>;
    parityTriageMap?: Record<string, ParityTriageStatus>;
    referenceDate?: string;
  },
): DevDashboardSummary {
  const flatNodes = buildFlatManageableNodes(dataset, {
    referenceDate: options?.referenceDate,
    personalNotesByNodeId: options?.devNotesByNodeId,
  });
  const parityReport = extractParityReport(dataset);
  const triageMap = options?.parityTriageMap ?? {};

  const attentionItems = parityReport.items.filter(
    (item) =>
      item.assessment.verdict === 'action_needed' ||
      item.assessment.verdict === 'logic_diff',
  );

  const sortQueue = (items: ParityItem[]) =>
    [...items].sort((a, b) => {
      const aDone =
        triageMap[a.nodeId] === 'synced' || triageMap[a.nodeId] === 'accepted_diff' ? 1 : 0;
      const bDone =
        triageMap[b.nodeId] === 'synced' || triageMap[b.nodeId] === 'accepted_diff' ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      if (a.assessment.verdict !== b.assessment.verdict) {
        return a.assessment.verdict === 'action_needed' ? -1 : 1;
      }
      return a.code.localeCompare(b.code);
    });

  const iosQueue: ParityItem[] = [];
  const androidQueue: ParityItem[] = [];
  const bothQueue: ParityItem[] = [];
  const otherQueue: ParityItem[] = [];

  for (const item of attentionItems) {
    if (item.assessment.fixTarget === 'ios') iosQueue.push(item);
    else if (item.assessment.fixTarget === 'android') androidQueue.push(item);
    else if (item.assessment.fixTarget === 'both') bothQueue.push(item);
    else otherQueue.push(item);
  }

  let wipCount = 0;
  let needsReviewCount = 0;
  let staleCount = 0;
  let missingVerifiedCount = 0;
  let linkedTaskNodes = 0;

  const attentionNodes: FlatManageableNode[] = [];
  for (const row of flatNodes) {
    if (row.status === 'wip') wipCount += 1;
    if (row.status === 'needs_review') needsReviewCount += 1;
    if (row.isStale) staleCount += 1;
    if (row.isMissingVerified) missingVerifiedCount += 1;
    if (row.workTaskUrl) linkedTaskNodes += 1;

    if (row.status === 'wip' || row.status === 'needs_review' || row.isStale) {
      attentionNodes.push(row);
    }
  }

  const pinnedSummaries: DevDashboardSummary['pinnedSummaries'] = [];
  for (const id of options?.pinnedNodeIds ?? []) {
    const node = findNodeById(dataset, id);
    if (!node) continue;
    pinnedSummaries.push({
      node,
      label: getNodeDisplayLabel(node, 'tech'),
      note: options?.devNotesByNodeId?.[id]?.trim() ?? '',
      ...(node.meta?.workTaskUrl ? { workTaskUrl: node.meta.workTaskUrl } : {}),
    });
  }

  const openTasks = (options?.workboard?.tasks ?? []).filter((t) => t.status !== 'done');

  return {
    branchLabel: dataset.app.techBranch ?? 'Nam-dev',
    totals: {
      totalNodes: flatNodes.length,
      parityActionNeeded: parityReport.byVerdict.action_needed,
      parityLogicDiff: parityReport.byVerdict.logic_diff,
      wipCount,
      needsReviewCount,
      staleCount,
      missingVerifiedCount,
      pinnedCount: pinnedSummaries.length,
      activeWorkboardTasks: openTasks.length,
      linkedTaskNodes,
    },
    parityQueues: {
      ios: sortQueue(iosQueue),
      android: sortQueue(androidQueue),
      both: sortQueue(bothQueue),
      other: sortQueue(otherQueue),
    },
    attentionNodes: attentionNodes.slice(0, 40),
    pinnedSummaries,
    openTasks,
  };
}

export function exportDevDashboardMarkdown(summary: DevDashboardSummary): string {
  const today = new Date().toISOString().slice(0, 10);
  const lines = [
    `# Báo cáo Quản lý Dev VBot (${summary.branchLabel} · ${today})`,
    '',
    '## 1. Tổng quan chỉ số',
    `- **Tổng số Node:** ${summary.totals.totalNodes}`,
    `- **Parity cần chú ý:** ${summary.totals.parityActionNeeded} \`action_needed\` · ${summary.totals.parityLogicDiff} \`logic_diff\``,
    `- **Trạng thái Node:** ${summary.totals.wipCount} WIP · ${summary.totals.needsReviewCount} Cần đối soát · ${summary.totals.staleCount} Quá hạn kiểm (>60 ngày)`,
    `- **Công việc đang theo dõi:** ${summary.totals.pinnedCount} node đang ghim · ${summary.totals.activeWorkboardTasks} task Workboard mở · ${summary.totals.linkedTaskNodes} node có link VBot Work`,
  ];

  const appendQueue = (title: string, items: ParityItem[]) => {
    if (items.length === 0) return;
    lines.push('', `### ${title} (${items.length})`);
    for (const item of items.slice(0, 15)) {
      lines.push(`- **[${item.code}] ${item.nodeLabel}** (\`${item.nodeId}\`): ${item.assessment.recommendation}`);
    }
  };

  lines.push('', '## 2. Hàng đợi Parity theo nền tảng');
  appendQueue('Việc iOS (Swift)', summary.parityQueues.ios);
  appendQueue('Việc Android (Kotlin)', summary.parityQueues.android);
  appendQueue('Cần xử lý cả 2 bên', summary.parityQueues.both);

  if (summary.pinnedSummaries.length > 0) {
    lines.push('', '## 3. Node đang ghim (Working Pins)');
    for (const p of summary.pinnedSummaries) {
      lines.push(`- **${p.label}** (\`${p.node.id}\`)${p.note ? ` — _${p.note}_` : ''}`);
    }
  }

  if (summary.openTasks.length > 0) {
    lines.push('', '## 4. Task Workboard đang mở');
    for (const t of summary.openTasks) {
      lines.push(
        `- [${t.status.toUpperCase()}] ${t.key ? `\`${t.key}\` ` : ''}**${t.title}** (${t.platform})`,
      );
    }
  }

  return lines.join('\n') + '\n';
}
