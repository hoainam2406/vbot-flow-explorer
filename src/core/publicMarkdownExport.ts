// src/core/publicMarkdownExport.ts
import { filterAndBridgeSubtree, findNodeById, isVisibleForMode } from './graphEngine';
import type { FlowNodeData, MergedFlowDataset, NodeKind } from '../data/schema';

const KIND_LABELS: Record<NodeKind, string> = {
  module: 'Module',
  miniapp: 'Mini App',
  action: 'Thao tác',
  process: 'Xử lý',
  decision: 'Điều kiện',
  external: 'Hệ thống',
  error: 'Lỗi / Retry',
};

export function exportNodeOverviewMarkdown(
  node: FlowNodeData,
  dataset: MergedFlowDataset,
  options?: { includeSubtree?: boolean },
): string {
  const lines: string[] = [
    `# ${node.label}`,
    '',
    `- **Loại:** ${KIND_LABELS[node.kind]}`,
    '',
    '## Mô tả tổng quan',
    '',
    node.summary.overview,
    '',
  ];

  const includeSubtree = options?.includeSubtree !== false;
  const rawSubtree = includeSubtree ? dataset.subtreesByParentId[node.id] : undefined;

  if (rawSubtree) {
    const visibleSubtree = filterAndBridgeSubtree(rawSubtree, 'overview');
    if (visibleSubtree.nodes.length > 0) {
      lines.push('## Các bước trong nhánh', '');
      visibleSubtree.nodes.forEach((child, idx) => {
        lines.push(`${idx + 1}. **${child.label}** — ${child.summary.overview}`);
        const grandSubtree = dataset.subtreesByParentId[child.id];
        if (grandSubtree) {
          const visibleGrand = filterAndBridgeSubtree(grandSubtree, 'overview');
          for (const grand of visibleGrand.nodes) {
            lines.push(`   - **${grand.label}:** ${grand.summary.overview}`);
          }
        }
      });
      lines.push('');
    }

    if (visibleSubtree.edges.length > 0) {
      const labelMap = new Map(visibleSubtree.nodes.map((n) => [n.id, n.label]));
      lines.push('## Luồng xử lý chính', '');
      for (const edge of visibleSubtree.edges) {
        const src = labelMap.get(edge.source) ?? edge.source;
        const tgt = labelMap.get(edge.target) ?? edge.target;
        const edgeTag = edge.label ? ` *(${edge.label})*` : '';
        lines.push(`- ${src} → ${tgt}${edgeTag}`);
      }
      lines.push('');
    }
  }

  const related = (node.relatedNodeIds ?? [])
    .map((id) => findNodeById(dataset, id))
    .filter((target): target is FlowNodeData => Boolean(target))
    .filter((target) => isVisibleForMode(target.audience, 'overview'));

  if (related.length > 0) {
    lines.push('## Liên kết liên quan', '');
    for (const target of related) {
      lines.push(`- ${target.label}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}
