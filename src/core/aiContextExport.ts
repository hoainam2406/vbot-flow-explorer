// src/core/aiContextExport.ts
import { findNodeById, getNodeDisplayLabel } from './graphEngine';
import type { MiniAppContract } from './miniAppContractBuilder';
import {
  PARITY_FIX_TARGET_LABELS,
  PARITY_NEEDS_FIX_LABELS,
  PARITY_VERDICT_LABELS,
  type ParityItem,
} from './parityAnalyzer';
import { detectCodeRefPlatform, type DevWorkspaceSettings } from './workspaceSettings';
import type { FlowNodeData, MergedFlowDataset, PlatformViewMode } from '../data/schema';

function joinLocalPath(base: string, rel: string): string {
  const cleanBase = base.trim().replace(/\/+$/, '');
  let cleanRel = rel.trim().replace(/^\/+/, '');
  if (!cleanBase) return rel;
  if (cleanBase.endsWith('/VBot-Android') && cleanRel.startsWith('VBot-Android/')) {
    cleanRel = cleanRel.slice('VBot-Android/'.length);
  } else if (cleanBase.endsWith('/VBot-iOS') && cleanRel.startsWith('VBot-iOS/')) {
    cleanRel = cleanRel.slice('VBot-iOS/'.length);
  }
  return `${cleanBase}/${cleanRel}`;
}

function formatCodeRefLine(ref: string, settings?: DevWorkspaceSettings): string {
  const plat = detectCodeRefPlatform(ref);
  if (!settings) return `- \`${ref}\``;
  const repoBase = plat === 'ios' ? settings.localIosRepoPath : settings.localAndroidRepoPath;
  if (!repoBase?.trim()) return `- [${plat.toUpperCase()}] \`${ref}\``;
  return `- [${plat.toUpperCase()}] \`${ref}\` → \`${joinLocalPath(repoBase, ref)}\``;
}

function collectNodeCodeRefs(node: FlowNodeData): string[] {
  const set = new Set<string>(node.techDetail?.codeRefs ?? []);
  for (const r of node.techDetail?.byPlatform?.ios?.codeRefs ?? []) set.add(r);
  for (const r of node.techDetail?.byPlatform?.android?.codeRefs ?? []) set.add(r);
  return [...set];
}

function collectNodeApis(node: FlowNodeData): string[] {
  const set = new Set<string>(node.techDetail?.apisOrEvents ?? []);
  for (const a of node.techDetail?.byPlatform?.ios?.apisOrEvents ?? []) set.add(a);
  for (const a of node.techDetail?.byPlatform?.android?.apisOrEvents ?? []) set.add(a);
  return [...set];
}

function collectNodeEdgeCases(node: FlowNodeData): string[] {
  const set = new Set<string>(node.techDetail?.edgeCases ?? []);
  for (const e of node.techDetail?.byPlatform?.ios?.edgeCases ?? []) set.add(e);
  for (const e of node.techDetail?.byPlatform?.android?.edgeCases ?? []) set.add(e);
  return [...set];
}

export function buildNodeAiContextPrompt(
  node: FlowNodeData,
  dataset: MergedFlowDataset,
  platformMode: PlatformViewMode,
  settings?: DevWorkspaceSettings,
): string {
  const overviewLabel = getNodeDisplayLabel(node, 'overview');
  const techLabel = getNodeDisplayLabel(node, 'tech');
  const codeRefs = collectNodeCodeRefs(node);
  const apis = collectNodeApis(node);
  const edgeCases = collectNodeEdgeCases(node);
  const pa = node.techDetail?.parityAssessment;

  const lines: string[] = [
    `# Ngữ cảnh kỹ thuật VBot — ${techLabel}`,
    '',
    'Hãy sử dụng ngữ cảnh dưới đây khi phân tích, sửa lỗi hoặc đối chiếu luồng trong mã nguồn VBot.',
    '',
    '## 1. Định danh & Mô tả luồng',
    `- **Node ID:** \`${node.id}\` (kind: \`${node.kind}\`)`,
    `- **Tên hiển thị:** ${overviewLabel}${techLabel !== overviewLabel ? ` · **Tên kỹ thuật:** ${techLabel}` : ''}`,
    `- **Nền tảng đang xem:** \`${platformMode}\` (nhánh đối soát: \`${dataset.app.techBranch ?? 'Nam-dev'}\`)`,
    `- **Nghiệp vụ (Overview):** ${node.summary.overview}`,
    ...(node.summary.tech ? [`- **Kỹ thuật (Tech):** ${node.summary.tech}`] : []),
  ];

  if (node.techDetail?.platformDiffNote || pa) {
    lines.push('', '## 2. Chênh lệch iOS ↔ Android & Parity');
    if (node.techDetail?.platformDiffNote) {
      lines.push(`- **Ghi chú khác biệt:** ${node.techDetail.platformDiffNote}`);
    }
    if (pa) {
      lines.push(
        `- **Đánh giá:** ${PARITY_VERDICT_LABELS[pa.verdict]} · ${PARITY_NEEDS_FIX_LABELS[pa.needsFix]}`,
        `- **Bên cần xử lý:** ${PARITY_FIX_TARGET_LABELS[pa.fixTarget ?? 'none']}`,
        `- **Giải thích:** ${pa.explanation}`,
        `- **Khuyến nghị:** ${pa.recommendation}`,
      );
    }
  }

  if (node.techDetail?.byPlatform?.ios || node.techDetail?.byPlatform?.android) {
    lines.push('', '## 3. Triển khai theo nền tảng');
    if (node.techDetail.byPlatform?.ios?.summary) {
      lines.push(`- **iOS:** ${node.techDetail.byPlatform.ios.summary}`);
    }
    if (node.techDetail.byPlatform?.android?.summary) {
      lines.push(`- **Android:** ${node.techDetail.byPlatform.android.summary}`);
    }
  }

  if (codeRefs.length > 0) {
    lines.push('', '## 4. File mã nguồn cần đọc (`codeRefs`)');
    lines.push(...codeRefs.map((ref) => formatCodeRefLine(ref, settings)));
  }

  if (apis.length > 0) {
    lines.push('', '## 5. APIs / WebSocket / Sự kiện liên quan');
    lines.push(...apis.map((a) => `- \`${a}\``));
  }

  if (edgeCases.length > 0) {
    lines.push('', '## 6. Edge Cases & Ràng buộc cần giữ nguyên');
    lines.push(...edgeCases.map((e) => `- ${e}`));
  }

  if (node.techDetail?.miniAppBridge) {
    const b = node.techDetail.miniAppBridge;
    lines.push('', `## 7. Cầu nối Mini App (\`${b.miniAppId}\`, mode: \`${b.embedMode}\`)`);
    if (b.transportByPlatform?.ios) lines.push(`- **iOS Transport:** ${b.transportByPlatform.ios}`);
    if (b.transportByPlatform?.android) lines.push(`- **Android Transport:** ${b.transportByPlatform.android}`);
    for (const msg of b.messages) {
      lines.push(`- \`[${msg.direction}] ${msg.name}\`: ${msg.miniAppFn ?? msg.hostFn ?? ''}`);
    }
  }

  const related = (node.relatedNodeIds ?? [])
    .map((id) => findNodeById(dataset, id))
    .filter((n): n is FlowNodeData => Boolean(n));
  if (related.length > 0) {
    lines.push('', '## 8. Node liên kết chéo');
    lines.push(...related.map((r) => `- \`${r.id}\` — ${getNodeDisplayLabel(r, 'tech')}`));
  }

  return lines.join('\n') + '\n';
}

export function buildParityItemAiContextPrompt(
  item: ParityItem,
  dataset: MergedFlowDataset,
  settings?: DevWorkspaceSettings,
): string {
  const node = findNodeById(dataset, item.nodeId);
  const allRefs = node ? collectNodeCodeRefs(node) : [];
  const edgeCases = node ? collectNodeEdgeCases(node) : [];

  const lines: string[] = [
    `# Yêu cầu đối soát / đồng bộ Parity iOS ↔ Android — ${item.nodeLabel}`,
    '',
    'Hãy kiểm tra mã nguồn cả 2 nền tảng bên dưới và đề xuất/thực hiện phương án đồng bộ hành vi theo đúng đánh giá Parity.',
    '',
    `- **Node ID:** \`${item.nodeId}\` (${item.breadcrumb.join(' › ')})`,
    `- **Phân loại:** ${PARITY_VERDICT_LABELS[item.assessment.verdict]}`,
    `- **Mức độ cần sửa:** ${PARITY_NEEDS_FIX_LABELS[item.assessment.needsFix]}`,
    `- **Bên cần sửa (fixTarget):** ${PARITY_FIX_TARGET_LABELS[item.assessment.fixTarget]}`,
    `- **Cùng logic:** ${item.assessment.sameLogic ? 'Có' : 'Không'} · **Cùng kết quả UX:** ${item.assessment.sameOutcome ? 'Có' : 'Không'}`,
    '',
    '## Mô tả sai lệch & Khuyến nghị',
    `- **Giải thích:** ${item.assessment.explanation}`,
    `- **Khuyến nghị xử lý:** ${item.assessment.recommendation}`,
    ...(item.platformDiffNote ? [`- **Ghi chú kỹ thuật:** ${item.platformDiffNote}`] : []),
    '',
    '## Hiện trạng 2 nền tảng',
    `- **iOS:** ${item.iosSummary || 'Chưa có mô tả riêng'}`,
    `- **Android:** ${item.androidSummary || 'Chưa có mô tả riêng'}`,
  ];

  if (allRefs.length > 0) {
    lines.push('', '## File mã nguồn liên quan');
    lines.push(...allRefs.map((ref) => formatCodeRefLine(ref, settings)));
  }

  if (edgeCases.length > 0) {
    lines.push('', '## Edge Cases bắt buộc bảo toàn');
    lines.push(...edgeCases.map((e) => `- ${e}`));
  }

  lines.push(
    '',
    '## Tiêu chí nghiệm thu',
    '1. Logic xử lý và kết quả trả về cho người dùng / Mini App khớp giữa iOS & Android.',
    '2. Không làm gãy các edge cases đã liệt kê ở trên.',
  );

  return lines.join('\n') + '\n';
}

export function buildMiniAppAiContextPrompt(contract: MiniAppContract): string {
  const { app, launchParams, incomingEvents, outgoingCommands, parityAlerts, manifestPermissionsJson } =
    contract;

  const lines: string[] = [
    `# Ngữ cảnh tích hợp Mini App: ${app.nameVi} (\`${app.id}\`)`,
    '',
    'Sử dụng tài liệu hợp đồng này để code hoặc debug giao tiếp giữa Mini App (`@vbotma/sdk`) và Host App iOS/Android.',
    '',
    `- **Vị trí hiển thị:** \`${app.placement}\` · **Quyền truy cập:** \`${app.accessLevel}\``,
    `- **iOS Rule:** ${app.iosPermissionRule}`,
    `- **Android Rule:** ${app.androidPermissionRule}`,
    '',
    '## 1. Launch Params (URL Hash)',
    ...launchParams.map(
      (lp) =>
        `- \`${lp.key}\` (\`${lp.type}\`, ${lp.required ? 'bắt buộc' : 'tùy chọn'}): ${lp.description}`,
    ),
    '',
    '## 2. Sự kiện Host Push xuống Mini App (`onEvent`)',
    ...incomingEvents.map((e) => `- \`${e.eventName}\`: ${e.summary}`),
    '',
    '## 3. Lệnh Mini App gọi lên Host',
    ...outgoingCommands.map(
      (c) => `- \`${c.method}\` (${c.isHostAction ? 'Host Action' : 'Core SDK'}): \`${c.sdkCallSummary}\``,
    ),
  ];

  if (parityAlerts.length > 0) {
    lines.push('', '## 4. Lưu ý lệch iOS ↔ Android cần xử lý phía Mini App');
    for (const a of parityAlerts) {
      lines.push(`- **${a.title}:** ${a.recommendationForMiniApp}`);
    }
  }

  lines.push('', '## 5. manifest.json permissions', '```json', manifestPermissionsJson, '```');

  return lines.join('\n') + '\n';
}
