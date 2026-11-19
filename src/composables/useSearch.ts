// src/composables/useSearch.ts
import { isVisibleForPlatform, type ViewMode } from '../core/graphEngine';
import type {
  FlowNodeData,
  MergedFlowDataset,
  PlatformTechDetail,
  PlatformViewMode,
} from '../data/schema';

export interface SearchHit {
  node: FlowNodeData;
  groupTitle: string;
}

function collectPlatformDetailText(detail: PlatformTechDetail | undefined): string[] {
  if (!detail) return [];
  return [
    detail.summary ?? '',
    detail.transport ?? '',
    ...(detail.apisOrEvents ?? []),
    ...(detail.edgeCases ?? []),
    ...(detail.codeRefs ?? []),
  ];
}

export function searchFlowNodes(
  dataset: MergedFlowDataset,
  query: string,
  mode: ViewMode,
  platformMode: PlatformViewMode = 'compare',
): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const hits: SearchHit[] = [];
  const match = (n: FlowNodeData, groupTitle: string) => {
    if (mode === 'overview' && n.audience === 'tech') return;
    if (mode === 'tech' && !isVisibleForPlatform(n.platforms, mode, platformMode)) return;

    const extraTechFields =
      __ENABLE_TECH_MODE__ && mode === 'tech'
        ? [
            n.techLabel ?? '',
            n.summary.tech ?? '',
            n.techDetail?.platformDiffNote ?? '',
            ...(n.techDetail?.apisOrEvents ?? []),
            ...(n.techDetail?.codeRefs ?? []),
            ...(platformMode !== 'android'
              ? collectPlatformDetailText(n.techDetail?.byPlatform?.ios)
              : []),
            ...(platformMode !== 'ios'
              ? collectPlatformDetailText(n.techDetail?.byPlatform?.android)
              : []),
            n.techDetail?.miniAppBridge?.miniAppId ?? '',
            ...(platformMode !== 'android'
              ? [n.techDetail?.miniAppBridge?.transportByPlatform?.ios ?? '']
              : []),
            ...(platformMode !== 'ios'
              ? [n.techDetail?.miniAppBridge?.transportByPlatform?.android ?? '']
              : []),
            ...(n.techDetail?.miniAppBridge?.messages.flatMap((m) => [
              m.name,
              m.hostFn ?? '',
              ...(platformMode !== 'android' ? [m.hostFnByPlatform?.ios ?? ''] : []),
              ...(platformMode !== 'ios' ? [m.hostFnByPlatform?.android ?? ''] : []),
              m.miniAppFn ?? '',
              m.payload ?? '',
              m.note ?? '',
              m.parityNote ?? '',
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
