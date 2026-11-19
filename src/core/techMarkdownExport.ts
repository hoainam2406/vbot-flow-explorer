// src/core/techMarkdownExport.ts
import {
  filterAndBridgeSubtree,
  findNodeById,
  getEdgeDisplayLabel,
  getNodeDisplayLabel,
  isVisibleForPlatform,
} from './graphEngine';
import type {
  FlowNodeData,
  MergedFlowDataset,
  NodeKind,
  PlatformTechDetail,
  PlatformViewMode,
} from '../data/schema';

const KIND_LABELS: Record<NodeKind, string> = {
  module: 'Module',
  miniapp: 'Mini App',
  action: 'Thao tác',
  process: 'Xử lý',
  decision: 'Điều kiện',
  external: 'Hệ thống',
  error: 'Lỗi / Retry',
};

const MODE_LABELS: Record<PlatformViewMode, string> = {
  compare: 'So sánh iOS ↔ Android',
  ios: 'iOS (Swift)',
  android: 'Android (Kotlin / Java)',
};

const DIRECTION_LABELS: Record<'host_init' | 'host_to_miniapp' | 'miniapp_to_host', string> = {
  host_init: 'Host khởi tạo Mini App',
  host_to_miniapp: 'Host → Mini App',
  miniapp_to_host: 'Mini App → Host',
};

function mergeUnique(lists: Array<string[] | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const item of list ?? []) {
      if (!seen.has(item)) {
        seen.add(item);
        out.push(item);
      }
    }
  }
  return out;
}

function appendBulletSection(lines: string[], title: string, items: string[], codeStyle = false): void {
  if (items.length === 0) return;
  lines.push(`**${title}:**`);
  for (const item of items) {
    lines.push(codeStyle ? `- \`${item}\`` : `- ${item}`);
  }
  lines.push('');
}

function appendPlatformDetails(
  lines: string[],
  heading: string,
  summary: string | undefined,
  inputs: string[],
  outputs: string[],
  apis: string[],
  edgeCases: string[],
  codeRefs: string[],
): void {
  const hasContent =
    Boolean(summary) ||
    inputs.length > 0 ||
    outputs.length > 0 ||
    apis.length > 0 ||
    edgeCases.length > 0 ||
    codeRefs.length > 0;
  if (!hasContent) return;

  lines.push(`### ${heading}`, '');
  if (summary) {
    lines.push(summary, '');
  }
  appendBulletSection(lines, 'Đầu vào (Inputs)', inputs);
  appendBulletSection(lines, 'Đầu ra (Outputs)', outputs);
  appendBulletSection(lines, 'API / Sự kiện', apis, true);
  appendBulletSection(lines, 'Biên & Xử lý lỗi', edgeCases);
  appendBulletSection(lines, 'Tham chiếu mã nguồn', codeRefs, true);
}

function resolvePlatformSlice(
  node: FlowNodeData,
  platform: 'ios' | 'android',
): {
  summary?: string;
  inputs: string[];
  outputs: string[];
  apis: string[];
  edgeCases: string[];
  codeRefs: string[];
} {
  const detail = node.techDetail;
  const platDetail: PlatformTechDetail | undefined =
    platform === 'ios' ? detail?.byPlatform?.ios : detail?.byPlatform?.android;

  if (platform === 'ios') {
    return {
      summary: platDetail?.summary ?? node.summary.tech,
      inputs: mergeUnique([detail?.inputs, platDetail?.inputs]),
      outputs: mergeUnique([detail?.outputs, platDetail?.outputs]),
      apis: mergeUnique([detail?.apisOrEvents, platDetail?.apisOrEvents]),
      edgeCases: mergeUnique([detail?.edgeCases, platDetail?.edgeCases]),
      codeRefs: mergeUnique([platDetail?.codeRefs, detail?.codeRefs]).filter(
        (ref) => !ref.startsWith('VBot-Android/'),
      ),
    };
  }

  return {
    summary: platDetail?.summary ?? node.summary.tech,
    inputs: platDetail?.inputs?.length ? platDetail.inputs : (detail?.inputs ?? []),
    outputs: platDetail?.outputs?.length ? platDetail.outputs : (detail?.outputs ?? []),
    apis: platDetail?.apisOrEvents?.length ? platDetail.apisOrEvents : (detail?.apisOrEvents ?? []),
    edgeCases: platDetail?.edgeCases ?? [],
    codeRefs: (platDetail?.codeRefs ?? []).filter(Boolean),
  };
}

export function exportNodeTechMarkdown(
  node: FlowNodeData,
  dataset: MergedFlowDataset,
  platformMode: PlatformViewMode,
  options?: { includeSubtree?: boolean },
): string {
  const scopeLabel =
    node.platforms?.length === 1
      ? node.platforms[0] === 'ios'
        ? 'Chỉ iOS'
        : 'Chỉ Android'
      : 'Cả iOS & Android';

  const lines: string[] = [
    `# ${getNodeDisplayLabel(node, 'tech')}`,
    '',
    `- **ID:** \`${node.id}\``,
    `- **Loại:** ${KIND_LABELS[node.kind]}`,
    `- **Phạm vi nền tảng:** ${scopeLabel}`,
    `- **Chế độ xuất:** ${MODE_LABELS[platformMode]}`,
    '',
    '## Mô tả tổng quan',
    '',
    node.summary.overview,
    '',
  ];

  const detail = node.techDetail;
  if (detail?.platformDiffNote) {
    lines.push('## Điểm khác biệt iOS ↔ Android', '', `> ${detail.platformDiffNote}`, '');
  }

  const onlyPlatform = node.platforms?.length === 1 ? node.platforms[0] : undefined;
  const showIos =
    (platformMode === 'compare' || platformMode === 'ios') && onlyPlatform !== 'android';
  const showAndroid =
    (platformMode === 'compare' || platformMode === 'android') && onlyPlatform !== 'ios';

  const iosSlice = showIos ? resolvePlatformSlice(node, 'ios') : null;
  const androidSlice = showAndroid ? resolvePlatformSlice(node, 'android') : null;

  if (iosSlice || androidSlice) {
    lines.push('## Chi tiết kỹ thuật', '');
    if (iosSlice) {
      appendPlatformDetails(
        lines,
        'iOS (Swift)',
        iosSlice.summary,
        iosSlice.inputs,
        iosSlice.outputs,
        iosSlice.apis,
        iosSlice.edgeCases,
        iosSlice.codeRefs,
      );
    }
    if (androidSlice) {
      appendPlatformDetails(
        lines,
        'Android (Kotlin / Java)',
        androidSlice.summary,
        androidSlice.inputs,
        androidSlice.outputs,
        androidSlice.apis,
        androidSlice.edgeCases,
        androidSlice.codeRefs,
      );
    }
  }

  const bridge = detail?.miniAppBridge;
  if (bridge) {
    lines.push('## Giao tiếp Host ↔ Mini App', '');
    lines.push(`- **Mini App ID:** \`${bridge.miniAppId}\``);
    lines.push(`- **Chế độ nhúng:** \`${bridge.embedMode}\``);
    if (platformMode === 'compare' && bridge.transportByPlatform) {
      if (bridge.transportByPlatform.ios) {
        lines.push(`- **Transport (iOS):** \`${bridge.transportByPlatform.ios}\``);
      }
      if (bridge.transportByPlatform.android) {
        lines.push(`- **Transport (Android):** \`${bridge.transportByPlatform.android}\``);
      }
    } else {
      const transport =
        (platformMode === 'android'
          ? bridge.transportByPlatform?.android
          : bridge.transportByPlatform?.ios) ?? bridge.transport;
      if (transport) {
        lines.push(`- **Transport:** \`${transport}\``);
      }
    }
    lines.push('');

    for (const msg of bridge.messages) {
      lines.push(`### \`${msg.name}\` (${DIRECTION_LABELS[msg.direction]})`, '');
      if (platformMode === 'compare' && (msg.hostFnByPlatform?.ios || msg.hostFnByPlatform?.android)) {
        if (msg.hostFnByPlatform?.ios ?? msg.hostFn) {
          lines.push(`- **Host (iOS):** \`${msg.hostFnByPlatform?.ios ?? msg.hostFn}\``);
        }
        if (msg.hostFnByPlatform?.android) {
          lines.push(`- **Host (Android):** \`${msg.hostFnByPlatform.android}\``);
        }
      } else {
        const hostFn =
          (platformMode === 'android'
            ? msg.hostFnByPlatform?.android
            : msg.hostFnByPlatform?.ios) ?? msg.hostFn;
        if (hostFn) {
          lines.push(`- **Hàm phía Host:** \`${hostFn}\``);
        }
      }
      if (msg.miniAppFn) {
        lines.push(`- **Hàm phía Mini App:** \`${msg.miniAppFn}\``);
      }
      if (msg.payload) {
        lines.push(`- **Payload:** \`${msg.payload}\``);
      }
      if (msg.response) {
        lines.push(`- **Response:** \`${msg.response}\``);
      }
      if (msg.note) {
        lines.push(`- **Ghi chú:** ${msg.note}`);
      }
      if (msg.parityNote) {
        lines.push(`- **Chênh lệch nền tảng:** ${msg.parityNote}`);
      }
      if (msg.examplePayload) {
        lines.push('', '```json', msg.examplePayload, '```');
      }
      if (msg.exampleResponse) {
        lines.push('', '```json', msg.exampleResponse, '```');
      }
      lines.push('');
    }
  }

  const includeSubtree = options?.includeSubtree !== false;
  const rawSubtree = includeSubtree ? dataset.subtreesByParentId[node.id] : undefined;

  if (rawSubtree) {
    const visibleSubtree = filterAndBridgeSubtree(rawSubtree, 'tech', platformMode);
    if (visibleSubtree.nodes.length > 0) {
      lines.push('## Các bước trong nhánh', '');
      visibleSubtree.nodes.forEach((child, idx) => {
        const platTag =
          child.platforms?.length === 1
            ? ` [${child.platforms[0] === 'ios' ? 'Chỉ iOS' : 'Chỉ Android'}]`
            : '';
        const text = child.summary.tech ?? child.summary.overview;
        lines.push(
          `${idx + 1}. **${getNodeDisplayLabel(child, 'tech')}**${platTag} (\`${child.id}\`) — ${text}`,
        );
        if (child.techDetail?.platformDiffNote) {
          lines.push(`   - *Khác biệt:* ${child.techDetail.platformDiffNote}`);
        }
      });
      lines.push('');
    }

    if (visibleSubtree.edges.length > 0) {
      const labelMap = new Map(
        visibleSubtree.nodes.map((n) => [n.id, getNodeDisplayLabel(n, 'tech')]),
      );
      lines.push('## Luồng chuyển bước', '');
      for (const edge of visibleSubtree.edges) {
        const src = labelMap.get(edge.source) ?? edge.source;
        const tgt = labelMap.get(edge.target) ?? edge.target;
        const resolvedEdgeLabel = getEdgeDisplayLabel(edge, 'tech');
        const edgeTag = resolvedEdgeLabel ? ` *(${resolvedEdgeLabel})*` : '';
        const platTag =
          edge.platforms?.length === 1
            ? ` [${edge.platforms[0] === 'ios' ? 'iOS' : 'Android'}]`
            : '';
        lines.push(`- ${src} → ${tgt}${edgeTag}${platTag}`);
      }
      lines.push('');
    }

    const visibleScenarios = (visibleSubtree.scenarios ?? []).filter((sc) =>
      isVisibleForPlatform(sc.platforms, 'tech', platformMode),
    );
    if (visibleScenarios.length > 0) {
      lines.push('## Kịch bản liên quan', '');
      for (const sc of visibleScenarios) {
        const desc = sc.description ? `: ${sc.description}` : '';
        lines.push(`- **${sc.name}** (\`${sc.id}\`)${desc}`);
      }
      lines.push('');
    }
  }

  const related = (node.relatedNodeIds ?? [])
    .map((id) => findNodeById(dataset, id))
    .filter((target): target is FlowNodeData => Boolean(target))
    .filter((target) => isVisibleForPlatform(target.platforms, 'tech', platformMode));

  if (related.length > 0) {
    lines.push('## Liên kết chéo', '');
    for (const target of related) {
      lines.push(`- **${getNodeDisplayLabel(target, 'tech')}** (\`${target.id}\`)`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}
