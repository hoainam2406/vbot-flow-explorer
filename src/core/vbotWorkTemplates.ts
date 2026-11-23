// src/core/vbotWorkTemplates.ts
import { getNodeDisplayLabel } from './graphEngine';
import {
  PARITY_FIX_TARGET_LABELS,
  PARITY_NEEDS_FIX_LABELS,
  PARITY_VERDICT_LABELS,
  type ParityItem,
} from './parityAnalyzer';
import type { QaCaseResult, QaTestCase } from './qaChecklistEngine';
import { isSafeExternalUrl, type DevWorkspaceSettings } from './workspaceSettings';
import type { AppRepoConfig, FlowNodeData, PlatformViewMode } from '../data/schema';

export type ParityTriageStatus = 'open' | 'in_progress' | 'synced' | 'accepted_diff';
export type VbotWorkPriority = 'no-priority' | 'low' | 'medium' | 'high' | 'urgent';

export interface VbotWorkTaskDraft {
  itemKey: string;
  title: string;
  description: string;
  priority: VbotWorkPriority;
  fallbackUrl?: string;
}

export const PARITY_TRIAGE_STORAGE_KEY = 'vbot-flow:parity-status:v1';

export const PARITY_TRIAGE_LABELS: Record<ParityTriageStatus, string> = {
  open: 'Mới phát hiện',
  in_progress: 'Đang đồng bộ',
  synced: 'Đã khớp',
  accepted_diff: 'Chấp nhận khác biệt',
};

export function loadParityTriageMap(): Record<string, ParityTriageStatus> {
  if (typeof window === 'undefined' || !window.localStorage) {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(PARITY_TRIAGE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ParityTriageStatus>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveParityTriageStatus(
  nodeId: string,
  status: ParityTriageStatus,
): Record<string, ParityTriageStatus> {
  const current = loadParityTriageMap();
  const next = { ...current, [nodeId]: status };
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(PARITY_TRIAGE_STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

export function resolveVbotWorkUrl(
  settings: DevWorkspaceSettings,
  repoConfig?: AppRepoConfig,
  category: 'ios' | 'android' | 'miniapp' | 'general' = 'general',
): string {
  const candidates = [
    settings.vbotWorkBaseUrlOverride,
    repoConfig?.vbotWorkProjectUrls?.[category],
    repoConfig?.vbotWorkBaseUrl,
    'https://work.vpmedia.vn',
  ];
  for (const url of candidates) {
    if (url && isSafeExternalUrl(url)) {
      return url.trim();
    }
  }
  return 'https://work.vpmedia.vn';
}

function collectNodeCodeRefs(node: FlowNodeData): string[] {
  const set = new Set<string>(node.techDetail?.codeRefs ?? []);
  for (const r of node.techDetail?.byPlatform?.ios?.codeRefs ?? []) set.add(r);
  for (const r of node.techDetail?.byPlatform?.android?.codeRefs ?? []) set.add(r);
  return [...set];
}

export function buildNodeTaskMarkdown(
  node: FlowNodeData,
  options: { pageUrl?: string; branchLabel?: string; platformMode: PlatformViewMode },
): string {
  const title = getNodeDisplayLabel(node, 'tech');
  const codeRefs = collectNodeCodeRefs(node);
  const lines: string[] = [
    `### [VBot Flow] ${title}`,
    '',
    `- **Node ID:** \`${node.id}\``,
    ...(options.branchLabel ? [`- **Phân hệ:** ${options.branchLabel}`] : []),
    `- **Nền tảng đang xem:** ${options.platformMode}`,
    ...(options.pageUrl ? [`- **Link sơ đồ:** ${options.pageUrl}`] : []),
    ...(node.meta?.owner ? [`- **Phụ trách:** ${node.meta.owner}`] : []),
    '',
    '**Mô tả nghiệp vụ:**',
    node.summary.overview,
    '',
  ];

  if (node.summary.tech) {
    lines.push('**Ghi chú kỹ thuật:**', node.summary.tech, '');
  }
  if (node.techDetail?.platformDiffNote) {
    lines.push('**Chênh lệch iOS ↔ Android:**', node.techDetail.platformDiffNote, '');
  }
  if (codeRefs.length > 0) {
    lines.push('**File code liên quan:**');
    codeRefs.forEach((r) => lines.push(`- \`${r}\``));
    lines.push('');
  }
  if ((node.techDetail?.edgeCases ?? []).length > 0) {
    lines.push('**Checklist xử lý & kiểm thử:**');
    node.techDetail!.edgeCases!.forEach((ec) => lines.push(`- [ ] ${ec}`));
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

export function buildNodeTaskDraft(
  node: FlowNodeData,
  options: {
    pageUrl?: string;
    branchLabel?: string;
    platformMode: PlatformViewMode;
    fallbackUrl?: string;
  },
): VbotWorkTaskDraft {
  const titleText = getNodeDisplayLabel(node, 'tech');
  const verdict = node.techDetail?.parityAssessment?.verdict;
  const priority: VbotWorkPriority =
    verdict === 'action_needed' ? 'high' : verdict === 'logic_diff' ? 'medium' : 'medium';

  return {
    itemKey: `node:${node.id}`,
    title: `[VBot Flow] ${titleText}`,
    description: buildNodeTaskMarkdown(node, options),
    priority,
    ...(options.fallbackUrl ? { fallbackUrl: options.fallbackUrl } : {}),
  };
}

export function buildParityTaskMarkdown(
  item: ParityItem,
  options: {
    pageUrl?: string;
    appName?: string;
    techBranch?: string;
    triageStatus?: ParityTriageStatus;
  },
): string {
  const lines: string[] = [
    `### [Parity iOS ↔ Android] Đồng bộ "${item.nodeLabel}"`,
    '',
    `- **Nhánh:** ${item.breadcrumb.join(' › ')}`,
    `- **Node ID:** \`${item.nodeId}\``,
    `- **Mức độ đánh giá:** ${PARITY_VERDICT_LABELS[item.assessment.verdict]} (${PARITY_NEEDS_FIX_LABELS[item.assessment.needsFix]})`,
    `- **Bên cần sửa:** ${PARITY_FIX_TARGET_LABELS[item.assessment.fixTarget]}`,
    `- **Logic / Kết quả:** Logic ${item.assessment.sameLogic ? 'giống nhau' : 'khác nhau'} · Kết quả ${item.assessment.sameOutcome ? 'giống nhau' : 'khác nhau'}`,
    ...(options.techBranch ? [`- **Nhánh code đối soát:** \`${options.techBranch}\``] : []),
    ...(options.triageStatus
      ? [`- **Trạng thái theo dõi:** ${PARITY_TRIAGE_LABELS[options.triageStatus]}`]
      : []),
    ...(options.pageUrl ? [`- **Deep-link:** ${options.pageUrl}`] : []),
    '',
    '**Phân tích bản chất khác biệt:**',
    item.assessment.explanation,
    '',
    '**Khuyến nghị:**',
    item.assessment.recommendation,
    '',
  ];

  if (item.platformDiffNote) {
    lines.push('**Điểm khác biệt hiện tại:**', item.platformDiffNote, '');
  }
  if (item.iosSummary) {
    lines.push(`- **iOS:** ${item.iosSummary}`);
  }
  if (item.androidSummary) {
    lines.push(`- **Android:** ${item.androidSummary}`);
  }
  if (item.bridgeParityNotes.length > 0) {
    lines.push('', '**Lệch Mini App Bridge:**');
    item.bridgeParityNotes.forEach((b) => lines.push(`- \`${b.messageName}\`: ${b.parityNote}`));
  }

  lines.push(
    '',
    '**Tiêu chí hoàn thành (DoD):**',
    '- [ ] Thống nhất hành vi giữa iOS (Swift) và Android (Kotlin)',
    '- [ ] Cập nhật lại mô tả & trạng thái trên `vbot-flow-explorer`',
  );

  return lines.join('\n').trimEnd() + '\n';
}

export function buildParityTaskDraft(
  item: ParityItem,
  options: {
    pageUrl?: string;
    appName?: string;
    techBranch?: string;
    triageStatus?: ParityTriageStatus;
    fallbackUrl?: string;
  },
): VbotWorkTaskDraft {
  const verdict = item.assessment.verdict;
  const priority: VbotWorkPriority =
    verdict === 'action_needed'
      ? 'high'
      : verdict === 'logic_diff'
        ? 'medium'
        : 'low';

  return {
    itemKey: `parity:${item.nodeId}`,
    title: `[Parity iOS ↔ Android] Đồng bộ "${item.nodeLabel}"`,
    description: buildParityTaskMarkdown(item, options),
    priority,
    ...(options.fallbackUrl ? { fallbackUrl: options.fallbackUrl } : {}),
  };
}

export function buildQaBugTaskMarkdown(
  scenarioTitle: string,
  testCase: QaTestCase,
  result: QaCaseResult,
  pageUrl?: string,
): string {
  const failedPlatforms: string[] = [];
  if (result.ios === 'fail' || result.ios === 'blocked') failedPlatforms.push(`iOS (${result.ios})`);
  if (result.android === 'fail' || result.android === 'blocked') {
    failedPlatforms.push(`Android (${result.android})`);
  }

  const lines: string[] = [
    `### [QA Bug] ${testCase.title}`,
    '',
    `- **Kịch bản:** ${scenarioTitle}`,
    `- **Bước số:** ${testCase.stepNumber} (\`${testCase.nodeId}\`)`,
    `- **Nền tảng lỗi:** ${failedPlatforms.join(', ') || 'Chưa xác định'}`,
    ...(pageUrl ? [`- **Link sơ đồ:** ${pageUrl}`] : []),
    '',
    ...(testCase.detail ? ['**Kỳ vọng / Bối cảnh:**', testCase.detail, ''] : []),
    '**Thực tế / Ghi chú lỗi QA:**',
    result.note.trim() || '(Chưa nhập mô tả chi tiết lỗi)',
    '',
  ];

  return lines.join('\n').trimEnd() + '\n';
}
