// src/composables/useSearch.ts
import type { ViewMode } from '../core/graphEngine';
import type { FlowNodeData, MergedFlowDataset } from '../data/schema';

export interface SearchHit {
  node: FlowNodeData;
  groupTitle: string;
}

export function searchFlowNodes(
  dataset: MergedFlowDataset,
  query: string,
  mode: ViewMode,
): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const hits: SearchHit[] = [];
  const match = (n: FlowNodeData, groupTitle: string) => {
    if (mode === 'overview' && n.audience === 'tech') return;

    const extraTechFields =
      __ENABLE_TECH_MODE__ && mode === 'tech'
        ? [
            n.summary.tech ?? '',
            ...(n.techDetail?.apisOrEvents ?? []),
            ...(n.techDetail?.codeRefs ?? []),
            n.techDetail?.miniAppBridge?.miniAppId ?? '',
            ...(n.techDetail?.miniAppBridge?.messages.flatMap((m) => [
              m.name,
              m.payload ?? '',
              m.note ?? '',
            ]) ?? []),
          ]
        : [];

    const haystack = [n.label, n.summary.overview, ...extraTechFields]
      .join(' ')
      .toLowerCase();
    if (haystack.includes(q)) hits.push({ node: n, groupTitle });
  };

  match(dataset.rootNode, 'Tổng quan');
  dataset.branches.forEach((b) => match(b, 'Chức năng lớn'));
  for (const sub of Object.values(dataset.subtreesByParentId)) {
    sub.nodes.forEach((n) => match(n, sub.title));
  }
  return hits.slice(0, 20);
}
