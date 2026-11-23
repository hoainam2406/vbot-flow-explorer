// src/core/parityAnalyzer.ts
import { getNodeDisplayLabel } from './graphEngine';
import type {
  FlowNodeData,
  MergedFlowDataset,
  NodeKind,
  ParityAssessment,
  ParityFixTarget,
  ParityNeedsFix,
  ParityVerdict,
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

export interface ResolvedParityAssessment extends Omit<ParityAssessment, 'fixTarget'> {
  fixTarget: ParityFixTarget;
  isInferred: boolean;
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
  assessment: ResolvedParityAssessment;
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
  byVerdict: Record<ParityVerdict, number>;
  byFixTarget: Record<ParityFixTarget, number>;
  byBranch: ParityBranchCount[];
  items: ParityItem[];
}

export const PARITY_VERDICT_LABELS: Record<ParityVerdict, string> = {
  action_needed: 'Nên sửa (Lỗi / Parity Gap)',
  logic_diff: 'Khác logic / Kết quả',
  os_impl_only: 'Chỉ khác OS / Ngôn ngữ',
  synced: 'Đã đồng bộ (Chỉ ghi chú)',
};

export const PARITY_NEEDS_FIX_LABELS: Record<ParityNeedsFix, string> = {
  yes: 'Nên sửa',
  consider: 'Cân nhắc đồng bộ',
  no: 'Không cần sửa',
};

export const PARITY_FIX_TARGET_LABELS: Record<ParityFixTarget, string> = {
  ios: 'Cần sửa iOS',
  android: 'Cần sửa Android',
  both: 'Cần sửa cả 2 bên',
  tbd: 'Chờ chốt bên chuẩn',
  none: 'Không cần sửa',
};

const CATEGORY_LABELS: Record<ParityCategory, string> = {
  ios_only: 'Chỉ có trên iOS',
  android_only: 'Chỉ có trên Android',
  bridge_parity: 'Khác Bridge',
  behavior_diff: 'Khác hành vi',
};

function inferFixTarget(
  verdict: ParityVerdict,
  needsFix: ParityNeedsFix,
  combinedText: string,
  categories: ParityCategory[],
): ParityFixTarget {
  if (needsFix === 'no' || verdict === 'os_impl_only' || verdict === 'synced') {
    return 'none';
  }
  const hasIosDefect =
    /(iOS\s+(?:chỉ|chưa|không|thiếu|comment|dropFirst|ép|bỏ sót|#warning))/i.test(combinedText);
  const hasAndroidDefect =
    /(Android\s+(?:chưa|không|thiếu|bỏ sót)|thay vì \|\||Parity Gap|vb-ma-android-sdk|VerifyFragment)/i.test(
      combinedText,
    );
  if (hasIosDefect && hasAndroidDefect) {
    return 'both';
  }
  if (hasAndroidDefect) {
    return 'android';
  }
  if (hasIosDefect) {
    return 'ios';
  }
  if (categories.includes('ios_only')) {
    return 'android';
  }
  if (categories.includes('android_only')) {
    return 'ios';
  }
  return 'tbd';
}

export function resolveParityAssessment(
  node: FlowNodeData,
  categories: ParityCategory[],
): ResolvedParityAssessment {
  const diffNote = node.techDetail?.platformDiffNote ?? '';
  const bridgeNotes = (node.techDetail?.miniAppBridge?.messages ?? [])
    .map((m) => m.parityNote)
    .filter((n): n is string => Boolean(n))
    .join(' ');
  const combined = `${diffNote} ${bridgeNotes}`.trim();

  const explicit = node.techDetail?.parityAssessment;
  if (explicit) {
    return {
      ...explicit,
      fixTarget:
        explicit.fixTarget ??
        inferFixTarget(
          explicit.verdict,
          explicit.needsFix,
          `${combined} ${explicit.explanation} ${explicit.recommendation}`,
          categories,
        ),
      isInferred: false,
    };
  }

  if (combined.includes('Parity Gap') || combined.includes('thay vì ||')) {
    return {
      verdict: 'action_needed',
      sameLogic: false,
      sameOutcome: false,
      needsFix: 'yes',
      fixTarget: inferFixTarget('action_needed', 'yes', combined, categories),
      explanation:
        'Phát hiện thiếu sót hoặc lỗi logic rõ rệt (Parity Gap) khiến kết quả/contract giữa 2 nền tảng bị lệch.',
      recommendation: 'Nên tạo task sửa và đồng bộ giữa iOS và Android.',
      isInferred: true,
    };
  }

  if (categories.includes('ios_only') || categories.includes('android_only')) {
    const onlyLabel = categories.includes('ios_only') ? 'iOS' : 'Android';
    return {
      verdict: 'logic_diff',
      sameLogic: false,
      sameOutcome: false,
      needsFix: 'consider',
      fixTarget: inferFixTarget('logic_diff', 'consider', combined, categories),
      explanation: `Bước hoặc màn hình này hiện mới tồn tại trên ${onlyLabel}, nền tảng còn lại chưa có luồng tương ứng.`,
      recommendation: `Cân nhắc với PO xem có cần bổ sung trải nghiệm tương đương ở nền tảng còn lại hay giữ đặc thù ${onlyLabel}.`,
      isInferred: true,
    };
  }

  if (
    /(Đã đồng bộ|Cả 2 HĐH đều|Cả hai HĐH đều)/i.test(combined) &&
    !/\b(NHƯNG|CHƯA|KHÔNG)\b|khác biệt/i.test(combined)
  ) {
    return {
      verdict: 'synced',
      sameLogic: true,
      sameOutcome: true,
      needsFix: 'no',
      fixTarget: 'none',
      explanation:
        'Hai nền tảng đã áp dụng cùng logic nghiệp vụ và cho ra kết quả tương đồng; ghi chú chủ yếu để xác nhận đã đối soát.',
      recommendation: 'Không cần sửa — 2 nền tảng đã đồng bộ.',
      isInferred: true,
    };
  }

  if (
    /(PushKit|CallKit|FCM|WKWebView|JavascriptInterface|SQLiteOpenHelper|Keychain|Realm)/i.test(
      combined,
    ) &&
    !/(khác biệt hành vi|KHÔNG truyền|chưa có)/i.test(combined)
  ) {
    return {
      verdict: 'os_impl_only',
      sameLogic: true,
      sameOutcome: true,
      needsFix: 'no',
      fixTarget: 'none',
      explanation:
        'Khác biệt xuất phát từ framework/API đặc thù của iOS (Swift) và Android (Kotlin/Java), còn logic nghiệp vụ và kết quả đầu ra tương đương.',
      recommendation: 'Không cần sửa — chấp nhận khác biệt theo đặc thù hệ điều hành.',
      isInferred: true,
    };
  }

  return {
    verdict: 'logic_diff',
    sameLogic: false,
    sameOutcome: false,
    needsFix: 'consider',
    fixTarget: inferFixTarget('logic_diff', 'consider', combined, categories),
    explanation:
      'Có khác biệt về luồng xử lý, API gọi hoặc hành vi hiển thị giữa 2 nền tảng nên kết quả có thể không đồng nhất hoàn toàn.',
    recommendation: 'Cân nhắc đối chiếu với PO/Tech để thống nhất hoặc ghi nhận chấp nhận khác biệt.',
    isInferred: true,
  };
}

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
    assessment: resolveParityAssessment(node, categories),
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
  const byVerdict: Record<ParityVerdict, number> = {
    action_needed: 0,
    logic_diff: 0,
    os_impl_only: 0,
    synced: 0,
  };
  const byFixTarget: Record<ParityFixTarget, number> = {
    ios: 0,
    android: 0,
    both: 0,
    tbd: 0,
    none: 0,
  };

  for (const item of items) {
    if (item.categories.includes('ios_only')) iosOnly += 1;
    if (item.categories.includes('android_only')) androidOnly += 1;
    if (item.categories.includes('behavior_diff')) behaviorDiff += 1;
    if (item.categories.includes('bridge_parity')) bridgeParity += 1;
    byVerdict[item.assessment.verdict] += 1;
    byFixTarget[item.assessment.fixTarget] += 1;
  }

  return {
    total: items.length,
    iosOnly,
    androidOnly,
    behaviorDiff,
    bridgeParity,
    byVerdict,
    byFixTarget,
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
    '| Nhóm chênh lệch / Kết luận | Số lượng |',
    '| --- | ---: |',
    `| Tổng số điểm ghi nhận | ${report.total} |`,
    `| Chỉ có trên iOS | ${report.iosOnly} |`,
    `| Chỉ có trên Android | ${report.androidOnly} |`,
    `| Khác hành vi / Kiến trúc | ${report.behaviorDiff} |`,
    `| Khác Bridge / Mini App | ${report.bridgeParity} |`,
    `| Nên sửa (Lỗi / Parity Gap) | ${report.byVerdict.action_needed} |`,
    `| Khác logic / Kết quả (Cân nhắc đồng bộ) | ${report.byVerdict.logic_diff} |`,
    `| Chỉ khác OS / Ngôn ngữ (Cùng kết quả — Không cần sửa) | ${report.byVerdict.os_impl_only} |`,
    `| Đã đồng bộ (Chỉ ghi chú — Không cần sửa) | ${report.byVerdict.synced} |`,
    `| Cần sửa iOS | ${report.byFixTarget.ios} |`,
    `| Cần sửa Android | ${report.byFixTarget.android} |`,
    `| Cần sửa cả 2 bên | ${report.byFixTarget.both} |`,
    `| Chờ chốt bên chuẩn | ${report.byFixTarget.tbd} |`,
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
      const { assessment } = item;
      lines.push(`### ${item.nodeLabel} (\`${item.nodeId}\`)`);
      lines.push(`- **Phân loại:** ${catBadges}`);
      lines.push(
        `- **Kết luận:** ${PARITY_VERDICT_LABELS[assessment.verdict]} (Logic: ${assessment.sameLogic ? 'Giống nhau' : 'Khác nhau'} · Kết quả: ${assessment.sameOutcome ? 'Giống nhau' : 'Khác nhau'} · Hành động: ${PARITY_NEEDS_FIX_LABELS[assessment.needsFix]} · Bên cần sửa: ${PARITY_FIX_TARGET_LABELS[assessment.fixTarget]})`,
      );
      lines.push(`- **Giải thích:** ${assessment.explanation}`);
      lines.push(`- **Khuyến nghị:** ${assessment.recommendation}`);
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
