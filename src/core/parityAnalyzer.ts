// src/core/parityAnalyzer.ts
import { getNodeDisplayLabel } from './graphEngine';
import type {
  FlowNodeData,
  MergedFlowDataset,
  NodeKind,
  Platform,
} from '../data/schema';

export type ParityCategory =
  | 'ios_only'
  | 'android_only'
  | 'behavior_diff'
  | 'bridge_parity';

export interface BridgeParityNote {
  messageName: string;
  parityNote: string;
}

export interface ParityItem {
  nodeId: string;
  nodeLabel: string;
  nodeKind: NodeKind;
  branchId: string;
  branchLabel: string;
  breadcrumb: string[];
  categories: ParityCategory[];
  primaryCategory: ParityCategory;
  platforms?: Platform[];
  platformDiffNote?: string;
  bridgeParityNotes: BridgeParityNote[];
  iosSummary?: string;
  androidSummary?: string;
}

export interface ParityBranchCount {
  branchId: string;
  branchLabel: string;
  count: number;
}

export interface ParitySummary {
  total: number;
  iosOnly: number;
  androidOnly: number;
  behaviorDiff: number;
  bridgeParity: number;
  byBranch: ParityBranchCount[];
  items: ParityItem[];
}

const CATEGORY_LABELS: Record<ParityCategory, string> = {
  ios_only: 'Chỉ có trên iOS',
  android_only: 'Chỉ có trên Android',
  bridge_parity: 'Khác Bridge',
  behavior_diff: 'Khác hành vi',
};

function pickPrimaryCategory(categories: ParityCategory[]): ParityCategory {
  if (categories.includes('ios_only')) return 'ios_only';
  if (categories.includes('android_only')) return 'android_only';
  if (categories.includes('bridge_parity')) return 'bridge_parity';
  return 'behavior_diff';
}

function buildParityItem(
  node: FlowNodeData,
  branchId: string,
  branchLabel: string,
  breadcrumb: string[],
): ParityItem | null {
  const categories: ParityCategory[] = [];
  const onlyPlatform = node.platforms?.length === 1 ? node.platforms[0] : undefined;

  if (onlyPlatform === 'ios') {
    categories.push('ios_only');
  } else if (onlyPlatform === 'android') {
    categories.push('android_only');
  }

  const platformDiffNote = node.techDetail?.platformDiffNote;
  if (platformDiffNote) {
    categories.push('behavior_diff');
  }

  const bridgeParityNotes: BridgeParityNote[] = [];
  for (const msg of node.techDetail?.miniAppBridge?.messages ?? []) {
    if (msg.parityNote) {
      bridgeParityNotes.push({
        messageName: msg.name,
        parityNote: msg.parityNote,
      });
    }
  }
  if (bridgeParityNotes.length > 0) {
    categories.push('bridge_parity');
  }

  if (categories.length === 0) {
    return null;
  }

  const iosSummary =
    onlyPlatform === 'android'
      ? undefined
      : (node.techDetail?.byPlatform?.ios?.summary ?? node.summary.tech ?? undefined);

  const androidSummary =
    onlyPlatform === 'ios'
      ? undefined
      : (node.techDetail?.byPlatform?.android?.summary ?? undefined);

  return {
    nodeId: node.id,
    nodeLabel: getNodeDisplayLabel(node, 'tech'),
    nodeKind: node.kind,
    branchId,
    branchLabel,
    breadcrumb,
    categories,
    primaryCategory: pickPrimaryCategory(categories),
    ...(node.platforms ? { platforms: node.platforms } : {}),
    ...(platformDiffNote ? { platformDiffNote } : {}),
    bridgeParityNotes,
    ...(iosSummary ? { iosSummary } : {}),
    ...(androidSummary ? { androidSummary } : {}),
  };
}

export function extractParityReport(dataset: MergedFlowDataset): ParitySummary {
  const visited = new Set<string>();
  const items: ParityItem[] = [];

  const inspectSubtree = (
    parentId: string,
    branchId: string,
    branchLabel: string,
    trail: string[],
  ) => {
    const subtree = dataset.subtreesByParentId[parentId];
    if (!subtree) return;
    for (const child of subtree.nodes) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      const nextTrail = [...trail, getNodeDisplayLabel(child, 'tech')];
      const item = buildParityItem(child, branchId, branchLabel, nextTrail);
      if (item) {
        items.push(item);
      }
      inspectSubtree(child.id, branchId, branchLabel, nextTrail);
    }
  };

  // Root node first (without descending into branches, which are walked in order below)
  visited.add(dataset.rootNode.id);
  const rootLabel = getNodeDisplayLabel(dataset.rootNode, 'tech');
  const rootItem = buildParityItem(
    dataset.rootNode,
    dataset.rootNode.id,
    rootLabel,
    [rootLabel],
  );
  if (rootItem) {
    items.push(rootItem);
  }

  for (const branch of dataset.branches) {
    if (!visited.has(branch.id)) {
      visited.add(branch.id);
      const bLabel = getNodeDisplayLabel(branch, 'tech');
      const trail = [rootLabel, bLabel];
      const item = buildParityItem(branch, branch.id, bLabel, trail);
      if (item) {
        items.push(item);
      }
      inspectSubtree(branch.id, branch.id, bLabel, trail);
    }
  }

  const branchOrder: Array<{ id: string; label: string }> = [
    { id: dataset.rootNode.id, label: rootLabel },
    ...dataset.branches.map((b) => ({ id: b.id, label: getNodeDisplayLabel(b, 'tech') })),
  ];
  const countsMap = new Map<string, number>();
  for (const item of items) {
    countsMap.set(item.branchId, (countsMap.get(item.branchId) ?? 0) + 1);
  }

  const byBranch: ParityBranchCount[] = [];
  for (const entry of branchOrder) {
    const count = countsMap.get(entry.id) ?? 0;
    if (count > 0) {
      byBranch.push({
        branchId: entry.id,
        branchLabel: entry.label,
        count,
      });
    }
  }

  let iosOnly = 0;
  let androidOnly = 0;
  let behaviorDiff = 0;
  let bridgeParity = 0;

  for (const item of items) {
    if (item.categories.includes('ios_only')) iosOnly += 1;
    if (item.categories.includes('android_only')) androidOnly += 1;
    if (item.categories.includes('behavior_diff')) behaviorDiff += 1;
    if (item.categories.includes('bridge_parity')) bridgeParity += 1;
  }

  return {
    total: items.length,
    iosOnly,
    androidOnly,
    behaviorDiff,
    bridgeParity,
    byBranch,
    items,
  };
}

export function exportParityReportToMarkdown(
  report: ParitySummary,
  appMeta: { name: string; version?: string },
): string {
  const versionSuffix = appMeta.version ? ` (${appMeta.version})` : '';
  const lines: string[] = [
    `# Báo cáo chênh lệch iOS ↔ Android — ${appMeta.name}${versionSuffix}`,
    '',
    '## Tổng quan chỉ số',
    '',
    '| Nhóm chênh lệch | Số lượng |',
    '| --- | ---: |',
    `| Tổng số điểm ghi nhận | ${report.total} |`,
    `| Chỉ có trên iOS | ${report.iosOnly} |`,
    `| Chỉ có trên Android | ${report.androidOnly} |`,
    `| Khác hành vi / Kiến trúc | ${report.behaviorDiff} |`,
    `| Khác Bridge / Mini App | ${report.bridgeParity} |`,
    '',
  ];

  const itemsByBranch = new Map<string, ParityItem[]>();
  for (const item of report.items) {
    const group = itemsByBranch.get(item.branchId) ?? [];
    group.push(item);
    itemsByBranch.set(item.branchId, group);
  }

  for (const branch of report.byBranch) {
    lines.push(`## ${branch.branchLabel} (${branch.count})`, '');
    const branchItems = itemsByBranch.get(branch.branchId) ?? [];
    for (const item of branchItems) {
      const catBadges = item.categories.map((c) => `\`${CATEGORY_LABELS[c]}\``).join(' ');
      lines.push(`### ${item.nodeLabel} (\`${item.nodeId}\`)`);
      lines.push(`- **Phân loại:** ${catBadges}`);
      lines.push(`- **Đường dẫn:** ${item.breadcrumb.join(' → ')}`);
      if (item.platformDiffNote) {
        lines.push(`- **Khác biệt:** ${item.platformDiffNote}`);
      }
      for (const note of item.bridgeParityNotes) {
        lines.push(`- **Bridge \`${note.messageName}\`:** ${note.parityNote}`);
      }
      if (item.iosSummary) {
        lines.push(`- **iOS:** ${item.iosSummary}`);
      }
      if (item.androidSummary) {
        lines.push(`- **Android:** ${item.androidSummary}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n').trimEnd() + '\n';
}
